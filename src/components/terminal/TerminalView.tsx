"use client";

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Scan, ArrowRight, Loader2, Radio, ArrowLeft, LogOut, GraduationCap, Heart, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useAuth, useUser } from '@/firebase';
import { collection, query, where, limit, doc, getDoc, getDocs, orderBy, setDoc } from 'firebase/firestore';
import { signInAnonymously, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { isToday, parseISO } from 'date-fns';
import { StudentRecord, UserRecord, DEPARTMENTS, ProgramRecord } from '@/lib/firebase-schema';

// Purposes are loaded from Firestore /visit_purposes at runtime
// Fallback list used only if Firestore is empty or loading
const FALLBACK_PURPOSES = [
  { value: 'Reading Books', label: 'Reading & Private Study' },
  { value: 'Research',      label: 'Thesis & Research' },
  { value: 'Computer Use',  label: 'Computer Usage' },
  { value: 'Assignments',   label: 'Academic Assignments' },
];

export default function TerminalView({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState<'auth' | 'dept' | 'purpose' | 'success'>('auth');
  const [rfidInput,  setRfidInput]  = useState('');
  const [identifiedStudent, setIdentifiedStudent] = useState<StudentRecord | null>(null);
  const [isVisitor,  setIsVisitor]  = useState(false);
  const [purpose,    setPurpose]    = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [countdown,  setCountdown]  = useState(4);
  const [lastAction, setLastAction] = useState<'checkin' | 'checkout'>('checkin');
  const [notRegistered, setNotRegistered] = useState(false);

  // Dept/program for visitors
  const [visitorDeptId,  setVisitorDeptId]  = useState('');
  const [visitorProgram, setVisitorProgram] = useState('');
  const [allDepts,       setAllDepts]       = useState<{ deptID: string; departmentName: string }[]>([]);
  const [deptPrograms,   setDeptPrograms]   = useState<ProgramRecord[]>([]);
  const [isLoadingProgs, setIsLoadingProgs] = useState(false);

  const inputRef  = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const db   = useFirestore();
  const auth = useAuth();
  const { user: authUser } = useUser();

  useEffect(() => {
    if (!authUser) signInAnonymously(auth);
    if (step === 'auth' && inputRef.current) inputRef.current.focus();
  }, [step, authUser, auth]);

  // ── Dynamic purposes from Firestore ──
  const [livePurposes, setLivePurposes] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getDocs(query(collection(db, 'visit_purposes'), where('active', '==', true)))
      .then(snap => {
        if (snap.empty) { setLivePurposes(FALLBACK_PURPOSES); return; }
        const sorted = snap.docs
          .map(d => d.data() as { value: string; label: string; order?: number; active: boolean })
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setLivePurposes(sorted.map(p => ({ value: p.value, label: p.label })));
      })
      .catch(() => setLivePurposes(FALLBACK_PURPOSES));
  }, [db]);

  // Load all departments once
  useEffect(() => {
    getDocs(collection(db, 'departments')).then(snap =>
      setAllDepts(snap.docs.map(d => d.data() as { deptID: string; departmentName: string })
        .sort((a, b) => a.departmentName.localeCompare(b.departmentName)))
    );
  }, [db]);

  // Load programs when dept changes
  useEffect(() => {
    if (!visitorDeptId) { setDeptPrograms([]); return; }
    setIsLoadingProgs(true);
    setVisitorProgram('');
    getDocs(query(collection(db, 'programs'), where('deptID', '==', visitorDeptId)))
      .then(snap => setDeptPrograms(snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ProgramRecord))
        .sort((a, b) => a.code.localeCompare(b.code))))
      .finally(() => setIsLoadingProgs(false));
  }, [visitorDeptId, db]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'success') {
      setCountdown(4);
      timer = setInterval(() => setCountdown(p => p > 0 ? p - 1 : 0), 1000);
    }
    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => { if (step === 'success' && countdown <= 0) handleReset(); }, [step, countdown]);

  const handleReset = () => {
    setStep('auth'); setRfidInput(''); setIdentifiedStudent(null);
    setPurpose(''); setLastAction('checkin'); setIsVisitor(false);
    setVisitorDeptId(''); setVisitorProgram(''); setNotRegistered(false);
  };

  const goToNextStep = (student: StudentRecord, needsDept: boolean) => {
    setIdentifiedStudent(student);
    setLastAction('checkin');
    if (needsDept) { setIsVisitor(true); setStep('dept'); }
    else { setStep('purpose'); }
  };

  const checkExistingLogs = async (student: StudentRecord, needsDept: boolean) => {
    const q = query(collection(db, 'library_logs'),
      where('studentId', '==', student.studentId),
      orderBy('checkInTimestamp', 'desc'), limit(1));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const log = snap.docs[0].data();
      if (!log.checkOutTimestamp && isToday(parseISO(log.checkInTimestamp))) {
        updateDocumentNonBlocking(doc(db, 'library_logs', snap.docs[0].id),
          { checkOutTimestamp: new Date().toISOString() });
        setIdentifiedStudent(student);
        setLastAction('checkout');
        setStep('success');
        return;
      }
    }
    goToNextStep(student, needsDept);
  };

  const handleIdentify = async (input: string) => {
    const cleanId = input.trim();
    if (!cleanId) return;
    setIsSearching(true);
    try {
      // 1. Check /users by doc ID (student ID or admin ID)
      let userDoc = await getDoc(doc(db, 'users', cleanId));

      // 2. If not found by ID, try email
      if (!userDoc.exists()) {
        const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanId.toLowerCase()), limit(1)));
        if (!emailSnap.empty) userDoc = emailSnap.docs[0] as any;
      }

      if (userDoc.exists()) {
        const data = userDoc.data() as UserRecord;
        if (data.status === 'blocked') {
          toast({ title: 'Access Blocked', description: 'Please visit the help desk.', variant: 'destructive' });
          return;
        }
        const asStudent: StudentRecord = {
          ...data,
          id:        data.id || cleanId,
          studentId: data.id || cleanId,
          isBlocked: (data.status as string) === 'blocked',
        };
        await checkExistingLogs(asStudent, !data.deptID || data.deptID === '');
        return;
      }

      // 2. Check /users by temporaryId field (visitors)
      const tvQ = query(collection(db, 'users'),
        where('temporaryId', '==', cleanId), limit(1));
      const tvSnap = await getDocs(tvQ);
      if (!tvSnap.empty) {
        const tv = tvSnap.docs[0].data();
        const asStudent: StudentRecord = {
          studentId: cleanId, id: tv.id || cleanId,
          firstName: tv.firstName, middleName: tv.middleName || '',
          lastName: tv.lastName, email: tv.email,
          deptID: tv.deptID || '', program: tv.program || '',
          role: 'visitor', status: tv.status || 'pending', isBlocked: (tv.status as string) === 'blocked',
        };
        await checkExistingLogs(asStudent, !tv.deptID || tv.deptID === '');
        return;
      }

      // 3. Check /users for admin/super_admin role
      const adminDoc = await getDoc(doc(db, 'users', cleanId));
      if (adminDoc.exists()) {
        const admin = adminDoc.data();
        // Only proceed if this is actually an admin/super_admin user
        if (!admin.role || !['admin', 'super_admin'].includes(admin.role)) {
          // ID not found — show registration prompt card
      setNotRegistered(true);
          return;
        }
        const asStudent: StudentRecord = {
          studentId: cleanId, id: cleanId,
          firstName:  admin.firstName || 'Staff',
          middleName: admin.middleName || '',
          lastName:   admin.lastName  || '',
          email:      admin.email || '',
          deptID:     admin.deptID || 'STAFF',
          program:    admin.program || '',
          role: 'admin', status: 'active', isBlocked: false,
        };
        // Admins don't need dept prompt — they have dept in their profile
        await checkExistingLogs(asStudent, false);
        return;
      }

      // ID not found — show registration prompt card
      setNotRegistered(true);
    } catch (e) {
      toast({ title: 'Registry Error', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleGoogleLogin = async () => {
    setIsSearching(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const email = result.user.email;
      const SUPER_ADMIN = 'shawndavidsobremontedomingo@gmail.com';
      if (!email?.endsWith('@neu.edu.ph') && email?.toLowerCase() !== SUPER_ADMIN) {
        toast({ title: 'Restricted', description: 'Academic accounts only.', variant: 'destructive' }); return;
      }
      // Look up by email in /users
      setRfidInput(email); // Store email so the "not registered" card can show it
      const uQ = query(collection(db, 'users'), where('email', '==', email), limit(1));
      const uSnap = await getDocs(uQ);
      if (!uSnap.empty) {
        const u = uSnap.docs[0].data();
        const isAdmin = u.role === 'admin' || u.role === 'super_admin';
        const asStudent: StudentRecord = {
          studentId: u.id, id: u.id,
          firstName: u.firstName, middleName: u.middleName || '',
          lastName: u.lastName, email: u.email,
          deptID: u.deptID || '', program: u.program || '',
          role: u.role, status: u.status, isBlocked: (u.status as string) === 'blocked',
        };
        // Admins never need dept prompt regardless of whether deptID is set
        await checkExistingLogs(asStudent, !isAdmin && (!u.deptID || u.deptID === ''));
        return;
      }
      setNotRegistered(true);
    } catch (e) {
      toast({ title: 'Authentication Failed', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleDeptConfirm = async () => {
    if (!visitorDeptId || !identifiedStudent) return;
    // Persist dept+program back to /users
    const tvRef = doc(db, 'users', identifiedStudent.studentId);
    await setDoc(tvRef, { deptID: visitorDeptId, program: visitorProgram }, { merge: true });
    setIdentifiedStudent(prev => prev ? { ...prev, deptID: visitorDeptId, program: visitorProgram } : prev);
    setStep('purpose');
  };

  const handleCheckIn = () => {
    if (!purpose || !identifiedStudent) return;
    addDocumentNonBlocking(collection(db, 'library_logs'), {
      studentId:        identifiedStudent.studentId,
      deptID:           identifiedStudent.deptID,
      checkInTimestamp: new Date().toISOString(),
      purpose,
      studentName: `${(identifiedStudent.lastName || '').toUpperCase()}, ${identifiedStudent.firstName}`,
    });
    setLastAction('checkin');
    setStep('success');
  };

  const navy = 'hsl(221,72%,22%)';

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-lg">

        {/* ── NOT REGISTERED ── */}
        {notRegistered && (
          <Card className="rounded-[2.5rem] border shadow-2xl bg-white/70 backdrop-blur-3xl p-10 space-y-8 animate-in fade-in zoom-in duration-500">
            <button onClick={handleReset} className="flex items-center gap-2 text-slate-400 hover:text-primary font-bold text-[10px] uppercase tracking-widest">
              <ArrowLeft size={16} /> Back to Kiosk
            </button>
            <div className="text-center space-y-4">
              <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center text-amber-500">
                <GraduationCap size={40} />
              </div>
              <h1 className="text-3xl font-bold font-headline text-slate-900">Not Registered</h1>
              <p className="text-slate-500 font-medium text-sm leading-relaxed max-w-xs mx-auto">
                Your ID <span className="font-bold font-mono text-slate-800">{rfidInput}</span> was not found in the system.
              </p>
            </div>
            <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 space-y-2">
              <p className="text-sm font-bold text-blue-800">How to register:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside font-medium">
                <li>Go back to the main portal screen</li>
                <li>Click <strong>Student Portal</strong></li>
                <li>Sign in with your <strong>@neu.edu.ph</strong> Google account</li>
                <li>Your account will be created automatically</li>
                <li>Return to the kiosk to check in</li>
              </ol>
            </div>
            <Button onClick={handleReset} className="w-full h-14 text-base font-bold rounded-2xl">
              <ArrowLeft size={18} className="mr-2" /> Return to Kiosk
            </Button>
          </Card>
        )}

        {/* ── AUTH ── */}
        {!notRegistered && step === 'auth' && (
          <Card className="rounded-[2.5rem] border shadow-2xl bg-white/70 backdrop-blur-3xl p-10 space-y-8 animate-in fade-in zoom-in duration-500">
            <button onClick={onComplete} className="flex items-center gap-2 text-slate-400 hover:text-primary font-bold text-[10px] uppercase tracking-widest">
              <ArrowLeft size={16} /> Main Portal
            </button>
            <div className="text-center space-y-4">
              <div className="mx-auto w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary">
                <Radio size={40} className="animate-pulse" />
              </div>
              <h1 className="text-4xl font-bold font-headline text-slate-900">Kiosk Access</h1>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Please Verify Identity</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                  <span className="uppercase font-bold text-sm tracking-widest text-slate-400">Institutional ID</span>
                  <span className="flex items-center gap-1 uppercase font-bold text-sm text-primary"><Radio size={12} /> Sensor Active</span>
                </div>
                <div className="relative">
                  <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/50" size={20} />
                  <Input ref={inputRef} placeholder="XX-YYYYY-ZZZ"
                    value={rfidInput} onChange={e => setRfidInput(e.target.value)}
                    className="h-16 text-lg font-mono text-center font-bold rounded-2xl border-2 bg-slate-50 focus:bg-white pl-10"
                    onKeyDown={e => e.key === 'Enter' && handleIdentify(rfidInput)}
                    inputMode="text" style={{ fontSize: '16px' }} />
                </div>
              </div>
              <Button onClick={() => handleIdentify(rfidInput)}
                className="w-full h-14 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/95 shadow-xl"
                disabled={isSearching || !rfidInput.trim()}>
                {isSearching ? <Loader2 className="animate-spin" /> : 'Verify Identity'}
              </Button>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-sm font-bold uppercase tracking-widest">
                  <span className="bg-white/70 px-4 text-slate-400">Cloud Enrollment</span>
                </div>
              </div>
              <Button variant="outline" onClick={handleGoogleLogin} disabled={isSearching}
                className="w-full h-12 text-sm font-bold rounded-xl border-2 bg-white/50 hover:bg-white">
                <div className="flex items-center gap-3">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                  Institutional Login
                </div>
              </Button>
            </div>
          </Card>
        )}

        {/* ── DEPT/PROGRAM (visitors only) ── */}
        {step === 'dept' && identifiedStudent && (
          <Card className="rounded-[2.5rem] border shadow-2xl bg-white/70 backdrop-blur-3xl p-10 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg"
                style={{ background: 'linear-gradient(135deg,hsl(43,85%,50%),hsl(38,90%,40%))' }}>
                {(identifiedStudent.firstName || 'V')[0]}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Welcome, {identifiedStudent.firstName}!
                </h2>
                <p className="text-xs font-semibold text-amber-600 mt-1 uppercase tracking-wide">
                  Visitor — Please complete your information
                </p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                <Building2 size={12} /> College / Department
              </label>
              <Select value={visitorDeptId} onValueChange={setVisitorDeptId}>
                <SelectTrigger className="h-14 rounded-2xl border-2 bg-slate-50 font-semibold text-sm">
                  <SelectValue placeholder="Select your college" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-64">
                  {allDepts.map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm py-2">
                      <span className="font-bold mr-2 text-xs" style={{ color: navy }}>[{d.deptID}]</span>
                      {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                <GraduationCap size={12} /> Academic Program
                {!visitorDeptId && <span className="text-amber-400 font-normal normal-case ml-1">(Select dept first)</span>}
              </label>
              <Select value={visitorProgram} onValueChange={setVisitorProgram}
                disabled={!visitorDeptId || isLoadingProgs}>
                <SelectTrigger className="h-14 rounded-2xl border-2 bg-slate-50 font-semibold text-sm disabled:opacity-50">
                  <SelectValue placeholder={
                    !visitorDeptId ? 'Select a department first'
                    : isLoadingProgs ? 'Loading...'
                    : 'Select your program'
                  } />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-64">
                  {deptPrograms.map(p => (
                    <SelectItem key={p.code} value={p.code} className="font-semibold text-sm py-2.5">
                      <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {p.code}
                      </span>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={handleReset} className="flex-1 h-14 rounded-2xl font-bold">Cancel</Button>
              <Button onClick={handleDeptConfirm} disabled={!visitorDeptId}
                className="flex-[2] h-14 rounded-2xl font-bold text-white"
                style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))`, border: 'none' }}>
                Continue <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* ── PURPOSE ── */}
        {step === 'purpose' && identifiedStudent && (
          <Card className="rounded-[2.5rem] border shadow-2xl bg-white/70 backdrop-blur-3xl p-10 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center text-center space-y-8">
              <div className="relative">
                <div className="h-20 w-20 bg-primary rounded-3xl flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-primary/30">
                  {(identifiedStudent.firstName || 'V')[0]}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-lg shadow-lg">
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold font-headline text-slate-900">Welcome, {identifiedStudent.firstName}!</h2>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                  {identifiedStudent.deptID === 'STAFF'
                    ? 'Library Staff'
                    : DEPARTMENTS[identifiedStudent.deptID ?? ''] || identifiedStudent.deptID || ''}
                  {identifiedStudent.program ? ` · ${identifiedStudent.program}` : ''}
                </p>
                {isVisitor && (
                  <span className="inline-block text-xs font-bold px-3 py-1 rounded-full mt-1"
                    style={{ background: 'hsl(43,85%,50%,0.12)', color: 'hsl(43,85%,35%)' }}>
                    Visitor — Pending Verification
                  </span>
                )}
              </div>
              <div className="w-full space-y-3 text-left">
                <Label className="uppercase font-bold text-[9px] tracking-widest text-slate-400 px-1">Purpose of Visit</Label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="h-14 rounded-2xl text-base font-bold border-2 bg-slate-50">
                    <SelectValue placeholder="Select Reason" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {(livePurposes.length > 0 ? livePurposes : FALLBACK_PURPOSES).map(p => <SelectItem key={p.value} value={p.value} className="font-bold">{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-full gap-4">
                <Button variant="outline" onClick={handleReset} className="h-14 flex-1 rounded-2xl font-bold">Cancel</Button>
                <Button onClick={handleCheckIn} disabled={!purpose}
                  className="h-14 flex-[2] rounded-2xl bg-primary hover:bg-primary/95 font-bold">
                  Check-In <ArrowRight size={18} className="ml-2" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && identifiedStudent && (
          <Card className="rounded-[3rem] border-none shadow-2xl py-16 px-10 text-center bg-white/80 backdrop-blur-3xl animate-in zoom-in duration-700">
            <div className={`mx-auto w-32 h-32 ${lastAction === 'checkin' ? 'bg-emerald-50' : 'bg-amber-50'} rounded-full flex items-center justify-center mb-8`}>
              {lastAction === 'checkin' ? <CheckCircle2 size={64} className="text-emerald-500" /> : <LogOut size={64} className="text-amber-500" />}
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-headline font-bold text-slate-900 tracking-tight">
                {lastAction === 'checkin' ? 'Welcome!' : 'Thank You!'}
              </h2>
              <div className="space-y-1">
                <p className="text-xl font-bold text-slate-800">{identifiedStudent.firstName} {identifiedStudent.lastName}</p>
                <Heart className="fill-primary text-primary mx-auto animate-pulse" size={20} />
              </div>
              <p className="text-slate-400 font-medium text-sm max-w-[240px] mx-auto leading-relaxed">
                {lastAction === 'checkin' ? 'Enjoy your study session.' : 'We hope your research was productive!'}
              </p>
            </div>
            <div className="mt-12 space-y-4">
              <div className="text-slate-300 font-bold uppercase tracking-widest text-[9px]">Auto-reset in {countdown}s</div>
              <Button variant="ghost" onClick={handleReset} className="rounded-full px-8 h-10 font-bold text-primary text-xs hover:bg-primary/5">
                Skip Wait
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}