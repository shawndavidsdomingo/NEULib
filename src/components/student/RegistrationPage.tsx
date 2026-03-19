"use client";

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, limit, getDocs, setDoc, doc } from 'firebase/firestore';
import { Loader2, UserCircle2, IdCard, GraduationCap, Building2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UserRecord, ProgramRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';

interface Props {
  onSubmitted: (registeredUser?: UserRecord) => void; // passes user back so kiosk can pre-fill
  onBack: () => void;
}

export default function RegistrationPage({ onSubmitted, onBack }: Props) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [nameMode,     setNameMode]     = useState<'email' | 'manual' | null>(null);
  const [firstName,    setFirstName]    = useState('');
  const [middleName,   setMiddleName]   = useState('');
  const [lastName,     setLastName]     = useState('');
  const [studentId,    setStudentId]    = useState('');
  const [deptId,       setDeptId]       = useState('');
  const [program,      setProgram]      = useState('');
  const [error,        setError]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [done,         setDone]         = useState(false);
  const [registeredUser, setRegisteredUser] = useState<UserRecord | null>(null);

  const [allDepts,     setAllDepts]     = useState<{ deptID: string; departmentName: string }[]>([]);
  const [programs,     setPrograms]     = useState<ProgramRecord[]>([]);
  const [loadingProgs, setLoadingProgs] = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'departments'))
      .then(snap => setAllDepts(
        snap.docs.map(d => d.data() as { deptID: string; departmentName: string })
          .sort((a, b) => a.departmentName.localeCompare(b.departmentName))
      ));
  }, [db]);

  useEffect(() => {
    if (!deptId) { setPrograms([]); return; }
    setLoadingProgs(true);
    setProgram('');
    getDocs(query(collection(db, 'programs'), where('deptID', '==', deptId)))
      .then(snap => setPrograms(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgramRecord))
          .sort((a, b) => a.code.localeCompare(b.code))
      ))
      .finally(() => setLoadingProgs(false));
  }, [deptId, db]);

  useEffect(() => {
    if (nameMode === 'email' && user?.displayName) {
      const parts = user.displayName.trim().split(' ');
      setFirstName(parts.slice(0, -1).join(' ') || parts[0] || '');
      setLastName(parts.length > 1 ? parts[parts.length - 1] : '');
      setMiddleName('');
    }
    if (nameMode === 'manual') {
      setFirstName(''); setMiddleName(''); setLastName('');
    }
  }, [nameMode, user?.displayName]);

  const handleIdChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    let formatted = digits;
    if (digits.length > 2)  formatted = digits.slice(0, 2) + '-' + digits.slice(2);
    if (digits.length > 7)  formatted = formatted.slice(0, 9) + '-' + digits.slice(7);
    if (digits.length > 10) formatted = formatted.slice(0, 13);
    setStudentId(formatted);
    setError('');
  };

  const handleSubmit = async () => {
    setError('');
    if (!nameMode) { setError('Please choose your name source.'); return; }
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return; }
    if (!studentId.trim()) { setError('Student ID is required.'); return; }
    if (!/^\d{2}-\d{5}-\d{3}$/.test(studentId.trim())) {
      setError('Student ID format: YY-XXXXX-ZZZ (e.g. 24-12864-481)'); return;
    }
    if (!deptId) { setError('Please select your department.'); return; }
    if (!user?.email) return;

    setSubmitting(true);
    try {
      const existing = await getDocs(query(collection(db, 'users'), where('id', '==', studentId.trim()), limit(1)));
      if (!existing.empty && existing.docs[0].data().email !== user.email) {
        setError('This Student ID is already registered to another account.');
        setSubmitting(false); return;
      }

      const newData: UserRecord = {
        id:         studentId.trim(),
        firstName:  firstName.trim(),
        middleName: middleName.trim(),
        lastName:   lastName.trim(),
        email:      user.email!,
        role:       'visitor',
        status:     'pending',
        deptID:     deptId,
        program:    program || '',
        addedAt:    new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', studentId.trim()), newData, { merge: false });
      setRegisteredUser(newData);
      setDone(true);

      // After 3 seconds redirect to kiosk with the registered user's credentials
      setTimeout(() => {
        onSubmitted(newData);
      }, 3000);

    } catch (e: any) {
      setError(e.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen — redirects to kiosk purpose step ─────────────────────
  if (done && registeredUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans',sans-serif" }}>
        <div className="bg-white/95 rounded-3xl shadow-2xl p-10 w-full max-w-md text-center space-y-6 animate-in zoom-in duration-500">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'rgba(5,150,105,0.1)' }}>
            <CheckCircle2 size={40} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              Registration Submitted!
            </h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              Welcome, <strong>{registeredUser.firstName}</strong>! Your account is pending admin verification.
              Taking you to the kiosk to log your visit now…
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
            <Loader2 size={12} className="animate-spin" /> Redirecting to Kiosk…
          </div>
          {/* Allow manual skip */}
          <button
            onClick={() => onSubmitted(registeredUser)}
            className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 transition-colors">
            Go now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <div className="w-full max-w-md space-y-4">

        {/* Header */}
        <div className="text-center space-y-2 pb-2">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-white"
            style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
            <UserCircle2 size={30} />
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
            Complete Registration
          </h1>
          <p className="text-white/60 text-sm font-medium">{user?.email}</p>
        </div>

        <div className="bg-white/97 rounded-2xl shadow-2xl p-6 space-y-5"
          style={{ backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)' }}>

          {/* Name source */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              How should we get your name?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: 'email',  label: 'Use email name',  sub: user?.displayName || 'From Google account' },
                { id: 'manual', label: 'Enter manually',  sub: 'Type your full name' },
              ] as const).map(opt => (
                <button key={opt.id} onClick={() => setNameMode(opt.id)}
                  className="p-3 rounded-xl border-2 text-left transition-all active:scale-95"
                  style={{
                    borderColor: nameMode === opt.id ? navy : '#e2e8f0',
                    background:  nameMode === opt.id ? `${navy}08` : '#fafafa',
                  }}>
                  <p className="font-bold text-sm text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Name fields */}
          {nameMode && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">First Name *</label>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)}
                    placeholder="Juan" readOnly={nameMode === 'email'}
                    className={`h-10 rounded-xl text-sm ${nameMode === 'email' ? 'bg-slate-100 text-slate-500' : 'bg-slate-50'}`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Last Name *</label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)}
                    placeholder="Dela Cruz" readOnly={nameMode === 'email'}
                    className={`h-10 rounded-xl text-sm ${nameMode === 'email' ? 'bg-slate-100 text-slate-500' : 'bg-slate-50'}`} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Middle Name (optional)</label>
                <Input value={middleName} onChange={e => setMiddleName(e.target.value)}
                  placeholder="Santos" className="h-10 rounded-xl bg-slate-50 text-sm" />
              </div>
            </div>
          )}

          {/* Student ID */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
              <IdCard size={11} /> Student ID *
            </label>
            <Input value={studentId} onChange={e => handleIdChange(e.target.value)}
              placeholder="24-12864-481"
              className="h-11 rounded-xl bg-slate-50 font-mono font-semibold text-sm" />
            <p className="text-xs text-slate-400 mt-1">Format: YY-XXXXX-ZZZ · Dashes are inserted automatically</p>
          </div>

          {/* Department */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
              <Building2 size={11} /> College / Department *
            </label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 font-semibold text-sm">
                <SelectValue placeholder="Select your college" />
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-60">
                {allDepts.map(d => (
                  <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                    <span className="font-bold mr-2 text-xs" style={{ color: navy }}>[{d.deptID}]</span>
                    {d.departmentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Program */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
              <GraduationCap size={11} /> Academic Program
            </label>
            <Select value={program} onValueChange={setProgram} disabled={!deptId || loadingProgs}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 font-semibold text-sm disabled:opacity-50">
                <SelectValue placeholder={!deptId ? 'Select department first' : loadingProgs ? 'Loading…' : 'Select program'} />
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-60">
                {programs.map(p => (
                  <SelectItem key={p.code} value={p.code} className="font-semibold text-sm">
                    <span className="font-bold mr-2 text-xs font-mono" style={{ color: navy }}>{p.code}</span>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onBack}
              className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-[2] h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : 'Submit Registration'}
            </button>
          </div>

          <p className="text-center text-xs text-slate-400">
            Your account will be pending admin verification. You can still use the kiosk while pending.
          </p>
        </div>
      </div>
    </div>
  );
}