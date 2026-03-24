"use client";
import React from 'react';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Scan, ArrowRight, Loader2, Radio, ArrowLeft, LogOut, GraduationCap, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, addDocumentNonBlocking, setDocumentNonBlocking, updateDocumentNonBlocking, useAuth, useUser } from '@/firebase';
import { collection, query, where, limit, doc, getDoc, getDocs, orderBy, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { signInAnonymously, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { isToday, parseISO, format, isAfter, isBefore } from 'date-fns';
import { formatStudentId } from '@/lib/student-id-formatter';
import { libraryLogId } from '@/lib/firestore-ids';
import { StudentRecord, UserRecord, DEPARTMENTS, PROGRAMS, ProgramRecord } from '@/lib/firebase-schema';
import { CredentialRequestModal } from '@/components/student/CredentialRequestModal';
import { KioskAnnouncementBanner } from '@/components/kiosk/KioskAnnouncementBanner';

const FALLBACK_PURPOSES = [
  { value: 'Reading Books', label: 'Reading & Private Study' },
  { value: 'Research',      label: 'Thesis & Research' },
  { value: 'Computer Use',  label: 'Computer Usage' },
  { value: 'Assignments',   label: 'Academic Assignments' },
];

// ── Library schedule type (matches /branches/{id}.schedule) ──────────────────
interface DaySchedule {
  open:   string; // "07:30"
  close:  string; // "21:00"
  closed: boolean;
}

type WeekSchedule = {
  [key in 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun']: DaySchedule;
};

interface TerminalViewProps {
  onComplete?: () => void;
  onAdminReturn?: () => void;
  onRegister?: (email: string) => void;
  preloadedUser?: UserRecord | null;
  defaultBranchId?: string | null;  // fallback when no ?branch= URL param
}

// ── Read branchId from URL param ?branch=xxx ──────────────────────────────────
function getKioskBranchId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('branch');
}

// ── Parse "HH:MM" to today's Date ────────────────────────────────────────────
function parseTimeToday(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Get today's day key ───────────────────────────────────────────────────────
// Returns { isOpen, reason, openTime, closeTime } based on current time vs schedule
function checkLibraryHours(schedule: WeekSchedule | null): {
  isOpen: boolean;
  reason: 'open' | 'closed_today' | 'not_yet_open' | 'already_closed' | 'no_schedule';
  openTime?: string;   // formatted "7:00 AM"
  closeTime?: string;  // formatted "6:00 PM"
} {
  if (!schedule) return { isOpen: true, reason: 'no_schedule' }; // no schedule = always open
  const key = (['sun','mon','tue','wed','thu','fri','sat'] as const)[new Date().getDay()];
  const day = schedule[key];
  if (!day || day.closed) return { isOpen: false, reason: 'closed_today' };
  const now   = new Date();
  const open  = parseTimeToday(day.open);
  const close = parseTimeToday(day.close);
  const fmt   = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (now < open)  return { isOpen: false, reason: 'not_yet_open',  openTime: fmt(open),  closeTime: fmt(close) };
  if (now >= close) return { isOpen: false, reason: 'already_closed', openTime: fmt(open), closeTime: fmt(close) };
  return { isOpen: true, reason: 'open', openTime: fmt(open), closeTime: fmt(close) };
}

function todayKey(): keyof WeekSchedule {
  const keys: (keyof WeekSchedule)[] = ['sun','mon','tue','wed','thu','fri','sat'];
  return keys[new Date().getDay()];
}


// ── Kiosk avatar: shows photo if available, falls back to initial ─────────────
function KioskAvatar({
  name, avatarUrl, size = 64, rounded = '1rem', shadow = true,
}: {
  name: string; avatarUrl?: string | null;
  size?: number; rounded?: string; shadow?: boolean;
}) {
  const initial = (name || 'V')[0].toUpperCase();
  const [imgFailed, setImgFailed] = React.useState(false);

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgFailed(true)}
        style={{
          width: size, height: size, borderRadius: rounded,
          objectFit: 'cover',
          border: '2.5px solid rgba(255,255,255,0.35)',
          boxShadow: shadow ? '0 4px 16px rgba(0,0,0,0.2)' : 'none',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: rounded,
      background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,44%))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 800, fontSize: size * 0.38,
      boxShadow: shadow ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
    }}>
      {initial}
    </div>
  );
}

export default function TerminalView({ onComplete, onAdminReturn, onRegister, preloadedUser, defaultBranchId }: TerminalViewProps) {
  const needsDeptStep = preloadedUser && (!preloadedUser.deptID || preloadedUser.deptID === '');
  const [step,              setStep]              = useState<'auth' | 'dept' | 'purpose' | 'success'>(
    preloadedUser ? (needsDeptStep ? 'dept' : 'purpose') : 'auth'
  );
  const [rfidInput,         setRfidInput]         = useState('');
  const [identifiedStudent, setIdentifiedStudent] = useState<StudentRecord | null>(
    preloadedUser ? {
      ...preloadedUser,
      studentId: preloadedUser.id,
      isBlocked: (preloadedUser.status as string) === 'blocked',
    } as StudentRecord : null
  );
  const [isVisitor,         setIsVisitor]         = useState(needsDeptStep);
  const [purpose,           setPurpose]           = useState('');
  const [isSearching,       setIsSearching]       = useState(false);
  const [countdown,         setCountdown]         = useState(5);
  const [lastAction,        setLastAction]        = useState<'checkin' | 'checkout'>('checkin');
  const [showNotRegistered, setShowNotRegistered] = useState(false);
  const [isRegisteringFromPopup, setIsRegisteringFromPopup] = useState(false);
  const [blockedStudent,    setBlockedStudent]    = useState<{ name: string } | null>(null);
  const [blockedCountdown,  setBlockedCountdown]  = useState(5);
  const [blockedInsideModal, setBlockedInsideModal] = useState(false);
  const [sessionDuration,   setSessionDuration]   = useState<{ hours: number; minutes: number } | null>(null);

  // Dept/program for visitors
  const [visitorDeptId,   setVisitorDeptId]   = useState('');
  const [visitorProgram,  setVisitorProgram]  = useState('');
  const [allDepts,        setAllDepts]        = useState<{ deptID: string; departmentName: string }[]>([]);
  const [deptPrograms,    setDeptPrograms]    = useState<ProgramRecord[]>([]);
  const [isLoadingProgs,  setIsLoadingProgs]  = useState(false);

  // Contact admin modal
  const [showContactAdmin, setShowContactAdmin] = useState(false);
  const [contactAdminUser, setContactAdminUser] = useState<UserRecord | null>(null);

  // ── Branch + schedule ────────────────────────────────────────────────────
  // Use URL param first, fall back to prop (set by landing page for main library)
  const kioskBranchId = useMemo(() => getKioskBranchId() ?? defaultBranchId ?? null, [defaultBranchId]);
  const [branchSchedule, setBranchSchedule] = useState<WeekSchedule | null>(null);
  const [branchName,     setBranchName]     = useState<string | null>(null);
  const [closedMsg,      setClosedMsg]      = useState<string | null>(null); // set when library is closed

  // Derived: is library currently closed based on schedule?
  const libraryHours  = branchSchedule ? checkLibraryHours(branchSchedule) : null;
  const isLibraryClosed = libraryHours ? !libraryHours.isOpen : false;

  const inputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const db   = useFirestore();
  const auth = useAuth();
  const { user: authUser } = useUser();

  useEffect(() => {
    if (!authUser) signInAnonymously(auth);
    if (step === 'auth' && inputRef.current) inputRef.current.focus();
  }, [step, authUser, auth]);

  // ── Load branch schedule ──────────────────────────────────────────────────
  useEffect(() => {
    if (!kioskBranchId) return;
    getDoc(doc(db, 'branches', kioskBranchId)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.name) setBranchName(data.name as string);
        if (data.schedule) setBranchSchedule(data.schedule as WeekSchedule);
      }
    }).catch(() => {});
  }, [kioskBranchId, db]);

  // ── Auto-checkout open sessions at library closing time ──────────────────
  // Runs every minute. When current time reaches today's closing time,
  // all open sessions for this branch are auto-closed and marked "NO TAP".
  //
  // BUG FIXED — "always times out at 2:41 AM":
  // parseTimeToday(today.close) builds the close time using the CURRENT date.
  // After midnight, the branch's closing time (e.g. 21:00) has already passed
  // in the new day, so isBefore(now, closeTime) is false immediately on every
  // mount → checkAndAutoClose() fires and closes all open sessions at any time
  // past midnight, which is wrong.
  //
  // Fix: Only trigger auto-close within a narrow window ON THE SAME DAY as the
  // closing time. We track a `autoClosedForDate` ref so the batch only fires
  // once per calendar day, and we add an explicit guard that the current time
  // is within [closeTime, closeTime + 2 hours] — not just "past close time".
  // Sessions opened on a previous day that were never tapped out are left alone;
  // they will appear as open in the admin dashboard and can be handled manually
  // (or by a server-side Cloud Function, which is the correct long-term solution).
  useEffect(() => {
    if (!branchSchedule) return;

    // Track which calendar date we've already auto-closed for, to prevent
    // firing again after midnight when the close time is "already past".
    const autoClosedForDate = { value: '' };

    const checkAndAutoClose = async () => {
      const now = new Date();
      const key = todayKey();
      const today = branchSchedule[key];
      if (!today || today.closed) return;

      const closeTime = parseTimeToday(today.close);

      // ── Guard 1: Only fire if we're past closing time ────────────────────
      if (isBefore(now, closeTime)) return;

      // ── Guard 2: Only fire within 2 hours after closing time (same day).
      // This prevents triggering at 2:41 AM when "21:00 has already passed"
      // in the new calendar day.
      const twoHoursAfterClose = new Date(closeTime.getTime() + 2 * 60 * 60 * 1000);
      if (isAfter(now, twoHoursAfterClose)) return;

      // ── Guard 3: Only fire once per calendar day ─────────────────────────
      const todayDateStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
      if (autoClosedForDate.value === todayDateStr) return;
      autoClosedForDate.value = todayDateStr;

      try {
        // Query by today's date range — avoids composite index requirement.
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

        const constraints: Parameters<typeof query>[1][] = [
          where('checkInTimestamp', '>=', todayStart.toISOString()),
          where('checkInTimestamp', '<=', todayEnd.toISOString()),
        ];
        if (kioskBranchId) {
          constraints.push(where('branchId', '==', kioskBranchId));
        }

        const q    = query(collection(db, 'library_logs'), ...constraints);
        const snap = await getDocs(q);
        if (snap.empty) return;

        // Filter client-side: only docs with no checkOutTimestamp (open sessions)
        const toClose = snap.docs.filter(d => !d.data().checkOutTimestamp);

        if (!toClose.length) return;

        const batch   = writeBatch(db);
        const closeTs = closeTime.toISOString();
        toClose.forEach(d => {
          batch.update(d.ref, {
            checkOutTimestamp: closeTs,
            noTap:             true,             // student did not tap out before closing
            autoCheckout:      true,             // flag so reports can identify these
            checkoutReason:    'library_closed',
          });
        });
        await batch.commit();
      } catch (err) {
        // Reset so we retry on next tick if something failed
        autoClosedForDate.value = '';
        console.error('[AutoClose] Failed to auto-checkout open sessions:', err);
      }
    };

    // Do NOT run immediately on mount — wait for the first minute tick.
    // Running on mount is what caused the "2:41 AM" bug: the kiosk page
    // loads after midnight, close time is already in the past, and the
    // guard was not tight enough. Now we only check on interval.
    const interval = setInterval(checkAndAutoClose, 60_000);
    return () => clearInterval(interval);
  }, [branchSchedule, db, kioskBranchId]);

  // ── Dynamic purposes ──────────────────────────────────────────────────────
  const [livePurposes, setLivePurposes] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getDocs(query(collection(db, 'visit_purposes'), where('active', '==', true)))
      .then(snap => {
        if (snap.empty) { setLivePurposes(FALLBACK_PURPOSES); return; }
        const sorted = snap.docs
          .map(d => d.data() as { value: string; label: string; order?: number })
          .sort((a, b) => {
            const orderDiff = (a.order ?? 99) - (b.order ?? 99);
            if (orderDiff !== 0) return orderDiff;
            return (a.label ?? '').localeCompare(b.label ?? '');
          });
        setLivePurposes(sorted.map(p => ({ value: p.value, label: p.label })));
      })
      .catch(() => setLivePurposes(FALLBACK_PURPOSES));
  }, [db]);

  // Load departments
  useEffect(() => {
    getDocs(collection(db, 'departments')).then(snap => {
      const DEPT_ORDER = Object.keys(DEPARTMENTS);
      setAllDepts(
        snap.docs
          .map(d => d.data() as { deptID: string; departmentName: string })
          .sort((a, b) => {
            const ai = DEPT_ORDER.indexOf(a.deptID);
            const bi = DEPT_ORDER.indexOf(b.deptID);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.departmentName.localeCompare(b.departmentName);
          })
      );
    });
  }, [db]);

  // Load programs when dept changes
  useEffect(() => {
    if (!visitorDeptId) { setDeptPrograms([]); return; }
    setIsLoadingProgs(true);
    setVisitorProgram('');
    getDocs(query(collection(db, 'programs'), where('deptID', '==', visitorDeptId)))
      .then(snap => {
        const schemaOrder = (PROGRAMS[visitorDeptId] ?? []).map(p => p.code);
        setDeptPrograms(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() } as ProgramRecord))
            .sort((a, b) => {
              const ai = schemaOrder.indexOf(a.code);
              const bi = schemaOrder.indexOf(b.code);
              if (ai !== -1 && bi !== -1) return ai - bi;
              if (ai !== -1) return -1;
              if (bi !== -1) return 1;
              const aStaff = a.code.endsWith('-STAFF');
              const bStaff = b.code.endsWith('-STAFF');
              if (aStaff && !bStaff) return -1;
              if (!aStaff && bStaff) return 1;
              return a.name.localeCompare(b.name);
            })
        );
      })
      .finally(() => setIsLoadingProgs(false));
  }, [visitorDeptId, db]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'success') {
      setCountdown(5);
      timer = setInterval(() => setCountdown(p => p > 0 ? p - 1 : 0), 1000);
    }
    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => { if (step === 'success' && countdown <= 0) handleReset(); }, [step, countdown]);

  useEffect(() => {
    if (!blockedStudent) { setBlockedCountdown(5); return; }
    setBlockedCountdown(5);
    const interval = setInterval(() => {
      setBlockedCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); setBlockedStudent(null); return 5; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [blockedStudent]);

  const handleReset = () => {
    const wasAdmin = identifiedStudent?.role === 'admin' || identifiedStudent?.role === 'super_admin';
    setStep('auth'); setRfidInput(''); setIdentifiedStudent(null);
    setPurpose(''); setLastAction('checkin'); setIsVisitor(false);
    setVisitorDeptId(''); setVisitorProgram(''); setSessionDuration(null);
    if (wasAdmin && onAdminReturn) onAdminReturn();
  };

  const goToNextStep = (student: StudentRecord, needsDept: boolean) => {
    setIdentifiedStudent(student);
    setLastAction('checkin');
    if (needsDept) { setIsVisitor(true); setStep('dept'); }
    else           { setStep('purpose'); }
  };

  const checkBlockedActiveSession = async (studentId: string): Promise<boolean> => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const q = query(
        collection(db, 'library_logs'),
        where('studentId', '==', studentId),
        where('checkInTimestamp', '>=', todayStart.toISOString()),
        orderBy('checkInTimestamp', 'desc'), limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty && !snap.docs[0].data().checkOutTimestamp) {
        setBlockedInsideModal(true);
        return true;
      }
    } catch { /* non-fatal */ }
    return false;
  };

  const checkExistingLogs = async (student: StudentRecord, needsDept: boolean) => {
    // ── Branch-aware tap logic ────────────────────────────────────────────────
    //
    // Rules:
    //  1. Open session on SAME branch  → tap-out (normal checkout)
    //  2. Open session on DIFF branch  → auto-close that session (student moved
    //                                    to a new library), then new check-in here
    //  3. No open session anywhere     → new check-in
    //
    // Example flow:
    //   Tap NEU Main → check-in (branchId: neu-main)
    //   Tap SOM Lib  → auto-closes NEU Main session, new check-in at SOM Lib
    //   Tap SOM Lib  → tap-out at SOM Lib
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch recent logs for this student (client-side filtering, no composite index)
    const q = query(
      collection(db, 'library_logs'),
      where('studentId', '==', student.studentId),
      orderBy('checkInTimestamp', 'desc'),
      limit(10)
    );
    const snap = await getDocs(q);

    // Separate: open session on this branch vs open session on a different branch
    const sameBranchDoc = snap.docs.find(d => {
      const data = d.data();
      if (data.checkOutTimestamp) return false;
      if (!isToday(parseISO(data.checkInTimestamp))) return false;
      if (kioskBranchId) return data.branchId === kioskBranchId;
      return true; // no branch config — match any
    });

    const otherBranchDoc = !sameBranchDoc ? snap.docs.find(d => {
      const data = d.data();
      if (data.checkOutTimestamp) return false;
      if (!isToday(parseISO(data.checkInTimestamp))) return false;
      if (kioskBranchId) return data.branchId !== kioskBranchId && !!data.branchId;
      return false;
    }) : undefined;

    // ── Case 1: Open session on same branch → tap-out ────────────────────────
    if (sameBranchDoc) {
      const log   = sameBranchDoc.data();
      const logId = sameBranchDoc.id;

      if (student.isBlocked || (student as any).status === 'blocked') {
        setIdentifiedStudent(student);
        setBlockedInsideModal(true);
        return;
      }

      const checkOutNow  = new Date();
      updateDocumentNonBlocking(doc(db, 'library_logs', logId),
        { checkOutTimestamp: checkOutNow.toISOString() });

      const checkInTime  = parseISO(log.checkInTimestamp);
      const totalMinutes = Math.max(0, Math.floor(
        (checkOutNow.getTime() - checkInTime.getTime()) / 60000
      ));
      setSessionDuration({ hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 });

      setIdentifiedStudent(student);
      setLastAction('checkout');
      setStep('success');
      return;
    }

    // ── Case 2: Open session on a DIFFERENT branch → auto-close it, then check-in ──
    if (otherBranchDoc) {
      // Silently close the other-branch session with current time
      // Mark it as auto-closed due to branch transfer so reports can identify it
      updateDocumentNonBlocking(doc(db, 'library_logs', otherBranchDoc.id), {
        checkOutTimestamp: new Date().toISOString(),
        autoCheckout:      true,
        checkoutReason:    'branch_transfer',
      });
      // Fall through to new check-in below
    }

    // ── Case 3 (or after Case 2): No same-branch session → new check-in ──────
    if (student.isBlocked || (student as any).status === 'blocked') {
      setIdentifiedStudent(student);
      const isInside = await checkBlockedActiveSession(student.studentId);
      if (!isInside) setBlockedStudent({ name: student.firstName || 'Student' });
      return;
    }

    goToNextStep(student, needsDept);
  };

  const handleIdentify = async (input: string) => {
    const cleanId = input.trim();
    if (!cleanId) return;

    setIsSearching(true);
    try {
      let userDoc = await getDoc(doc(db, 'users', cleanId));

      if (!userDoc.exists()) {
        const emailSnap = await getDocs(
          query(collection(db, 'users'), where('email', '==', cleanId.toLowerCase()), limit(1))
        );
        if (!emailSnap.empty) userDoc = emailSnap.docs[0] as any;
      }

      if (userDoc.exists()) {
        const data = userDoc.data() as UserRecord;
        if (data.status === 'blocked') {
          const sid = data.id || cleanId;
          const isInside = await checkBlockedActiveSession(sid);
          if (!isInside) {
            setBlockedStudent({ name: data.firstName || 'Student' });
          }
          try {
            const attemptRef = doc(collection(db, 'blocked_attempts'));
            setDoc(attemptRef, {
              studentId:   sid,
              studentName: `${(data.lastName||'').toUpperCase()}, ${data.firstName||''}`,
              deptID:      data.deptID || '',
              program:     data.program || '',
              timestamp:   new Date().toISOString(),
            });
          } catch { /* non-fatal */ }
          return;
        }
        const asStudent: StudentRecord = {
          ...data, id: data.id || cleanId,
          studentId: data.id || cleanId,
          isBlocked: (data.status as string) === 'blocked',
          avatarUrl: (data as any).avatarUrl ?? null,
        } as StudentRecord & { avatarUrl?: string | null };
        await checkExistingLogs(asStudent, !data.deptID || data.deptID === '');
        return;
      }

      const tvSnap = await getDocs(query(collection(db, 'users'), where('temporaryId', '==', cleanId), limit(1)));
      if (!tvSnap.empty) {
        const tv = tvSnap.docs[0].data();
        const asStudent: StudentRecord = {
          studentId: cleanId, id: tv.id || cleanId,
          firstName: tv.firstName, middleName: tv.middleName || '',
          lastName: tv.lastName, email: tv.email,
          deptID: tv.deptID || '', program: tv.program || '',
          role: 'visitor', status: tv.status || 'pending', isBlocked: tv.status === 'blocked',
        };
        await checkExistingLogs(asStudent, !tv.deptID || tv.deptID === '');
        return;
      }

      setShowNotRegistered(true);
    } catch {
      toast({ title: 'Registry Error', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleRegisterFromPopup = async () => {
    setShowNotRegistered(false);
    setIsRegisteringFromPopup(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const email  = result.user.email;
      const SUPER_ADMIN = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || '').toLowerCase();

      if (!email?.endsWith('@neu.edu.ph') && email?.toLowerCase() !== SUPER_ADMIN) {
        toast({ title: 'Restricted', description: 'Please use your @neu.edu.ph institutional account.', variant: 'destructive' });
        return;
      }

      const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
      if (!uSnap.empty) {
        const u = uSnap.docs[0].data() as UserRecord;
        const asStudent: StudentRecord = {
          studentId: u.id, id: u.id,
          firstName: u.firstName, middleName: u.middleName || '',
          lastName: u.lastName, email: u.email,
          deptID: u.deptID || '', program: u.program || '',
          role: u.role, status: u.status, isBlocked: (u.status as string) === 'blocked',
        };
        await checkExistingLogs(asStudent, !u.deptID || u.deptID === '');
        return;
      }

      if (onRegister) onRegister(email!);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        toast({ title: 'Authentication Failed', description: 'Please try again.', variant: 'destructive' });
        setShowNotRegistered(true);
      }
    } finally {
      setIsRegisteringFromPopup(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const email  = result.user.email;
      const SUPER_ADMIN = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'shawndavidsobremontedomingo@gmail.com').toLowerCase();

      if (!email?.endsWith('@neu.edu.ph') && email?.toLowerCase() !== SUPER_ADMIN) {
        toast({ title: 'Restricted', description: 'Academic accounts only (@neu.edu.ph).', variant: 'destructive' });
        return;
      }

      const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));

      if (!uSnap.empty) {
        const u = uSnap.docs[0].data() as UserRecord;

        // ── Persist Google avatar to user record if missing ──────────────
        const photoURL = result.user.photoURL;
        if (photoURL && !u.avatarUrl) {
          updateDoc(doc(db, 'users', u.id), { avatarUrl: photoURL }).catch(() => {});
        }

        if (u.status === 'blocked') {
          const isInside = await checkBlockedActiveSession(u.id);
          if (!isInside) {
            setBlockedStudent({ name: u.firstName || 'Student' });
          }
          try {
            const attemptRef = doc(collection(db, 'blocked_attempts'));
            setDoc(attemptRef, {
              studentId:   u.id,
              studentName: `${(u.lastName||'').toUpperCase()}, ${u.firstName||''}`,
              deptID:      u.deptID || '',
              program:     u.program || '',
              timestamp:   new Date().toISOString(),
            });
          } catch { /* non-fatal */ }
          return;
        }
        const isAdmin = u.role === 'admin' || u.role === 'super_admin';
        const asStudent: StudentRecord = {
          studentId: u.id, id: u.id,
          firstName: u.firstName, middleName: u.middleName || '',
          lastName: u.lastName, email: u.email,
          deptID: u.deptID || '', program: u.program || '',
          role: u.role, status: u.status, isBlocked: (u.status as string) === 'blocked',
          avatarUrl: (u as any).avatarUrl || result.user.photoURL || null,
        } as StudentRecord & { avatarUrl?: string | null };
        await checkExistingLogs(asStudent, !isAdmin && (!u.deptID || u.deptID === ''));
        return;
      }

      if (email?.endsWith('@neu.edu.ph') && onRegister) {
        onRegister(email);
        return;
      }

      setShowNotRegistered(true);
    } catch {
      toast({ title: 'Authentication Failed', variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const handleDeptConfirm = async () => {
    if (!visitorDeptId || !identifiedStudent) return;
    const tvRef = doc(db, 'users', identifiedStudent.studentId);
    await setDoc(tvRef, { deptID: visitorDeptId, program: visitorProgram }, { merge: true });
    setIdentifiedStudent(prev => prev ? { ...prev, deptID: visitorDeptId, program: visitorProgram } : prev);
    setStep('purpose');
  };

  const handleCheckIn = async () => {
    if (!purpose || !identifiedStudent) return;

    // ── Hours check — only block NEW check-ins, not tap-outs ─────────────
    // (tap-outs are handled in checkExistingLogs and never reach here)
    const hours = checkLibraryHours(branchSchedule);
    if (!hours.isOpen) {
      const lib  = branchName ?? 'Library';
      const name = identifiedStudent.firstName || '';
      const msg  = hours.reason === 'not_yet_open'
        ? `Sorry${name ? `, ${name}` : ''}! ${lib} will open at ${hours.openTime}.`
        : `Sorry${name ? `, ${name}` : ''}! ${lib} is now closed.`;
      setClosedMsg(msg);
      return;
    }

    if (!identifiedStudent.deptID) {
      toast({ title: 'Missing Information', description: 'Department information is required.', variant: 'destructive' });
      setStep('dept');
      setIsVisitor(true);
      return;
    }

    const studentName = `${(identifiedStudent.lastName || '').toUpperCase()}, ${identifiedStudent.firstName}`;
    const logDocId    = libraryLogId(studentName, identifiedStudent.deptID);

    // ── Fetch avatar from user record ────────────────────────────────────
    let avatarUrl: string | null = null;
    try {
      const userSnap = await getDoc(doc(db, 'users', identifiedStudent.studentId));
      avatarUrl = userSnap.data()?.avatarUrl ?? null;
    } catch { /* non-fatal */ }

    setDocumentNonBlocking(
      doc(db, 'library_logs', logDocId),
      {
        studentId:          identifiedStudent.studentId,
        deptID:             identifiedStudent.deptID,
        program:            (identifiedStudent as any).program ?? '',
        checkInTimestamp:   new Date().toISOString(),
        checkOutTimestamp:  null,   // explicit null — auto-close query filters with !data.checkOutTimestamp
        purpose,
        studentName,
        noTap:              false,  // reset: not a no-tap yet
        autoCheckout:       false,
        ...(avatarUrl       ? { avatarUrl }               : {}),
        ...(kioskBranchId   ? { branchId: kioskBranchId } : {}),
      },
      { merge: false }
    );
    setLastAction('checkin');
    setStep('success');
  };

  const navy = 'hsl(221,72%,22%)';
  const purposes = livePurposes.length > 0 ? livePurposes : FALLBACK_PURPOSES;

  return (
    <div className="flex items-center justify-center min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-lg">

        {/* ── AUTH ── */}
        {step === 'auth' && (
          <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-700"
            style={{ transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.01)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 32px 64px rgba(0,0,0,0.35)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}>
            <div className="px-8 pt-8 pb-8 text-center relative"
              style={{ background: 'linear-gradient(160deg,hsl(225,70%,42%) 0%,hsl(221,72%,28%) 60%,hsl(221,72%,22%) 100%)' }}>
              <button onClick={onComplete}
                className="flex items-center gap-1.5 text-white/50 hover:text-white/80 font-bold text-[10px] uppercase tracking-widest mb-5 transition-all">
                <ArrowLeft size={13} /> Main Portal
              </button>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(255,255,255,0.20)' }}>
                <Radio size={32} className="text-white animate-pulse" />
              </div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
                {branchName ? `${branchName} Kiosk` : 'Library Kiosk'}
              </h1>
              <p className="text-white/50 font-semibold uppercase tracking-widest text-xs mt-1.5">
                NEU · Tap to Enter or Exit
              </p>
            </div>
            <div className="bg-white px-8 py-7 space-y-5">

              {/* ── Library closed banner ── */}
              {isLibraryClosed && (
                <div className="px-4 py-3.5 rounded-2xl flex items-start gap-3 mb-1"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span className="text-xl flex-shrink-0">🔒</span>
                  <div>
                    <p className="font-bold text-sm" style={{ color: '#dc2626' }}>
                      {branchName ?? 'Library'} is currently closed
                    </p>
                    {libraryHours?.openTime && libraryHours?.closeTime && (
                      <p className="text-xs font-medium mt-0.5" style={{ color: '#ef4444' }}>
                        {libraryHours.reason === 'not_yet_open'
                          ? `Opens today at ${libraryHours.openTime}`
                          : `Hours: ${libraryHours.openTime} – ${libraryHours.closeTime}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Announcement banner ── */}
              <KioskAnnouncementBanner branchId={kioskBranchId ?? undefined} />

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="uppercase font-bold text-xs tracking-widest text-slate-400">Institutional ID</span>
                  <span className="flex items-center gap-1 uppercase font-bold text-xs text-primary/70">
                    <Radio size={10} className="animate-pulse" /> Sensor Active
                  </span>
                </div>
                <div className="relative">
                  <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <Input ref={inputRef} placeholder="XX-YYYYY-ZZZ"
                    value={rfidInput}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      let out = digits;
                      if (digits.length > 2) out = digits.slice(0,2) + '-' + digits.slice(2);
                      if (digits.length > 7) out = digits.slice(0,2) + '-' + digits.slice(2,7) + '-' + digits.slice(7);
                      setRfidInput(out);
                    }}
                    className="h-14 text-lg font-mono text-center font-bold rounded-2xl border-2 border-slate-200 bg-slate-50 focus:bg-white focus:border-primary/40 pl-10 tracking-widest"
                    disabled={isLibraryClosed}
                    onKeyDown={e => e.key === 'Enter' && handleIdentify(rfidInput)}
                    inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false} />
                </div>
              </div>
              <Button onClick={() => handleIdentify(rfidInput)}
                className="w-full h-13 py-3.5 text-base font-bold rounded-2xl shadow-lg transition-all"
                style={{ background: isLibraryClosed ? '#94a3b8' : 'linear-gradient(135deg,hsl(43,85%,50%),hsl(38,90%,42%))' }}
                disabled={isSearching || !rfidInput.trim() || isLibraryClosed}>
                {isSearching ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                {isSearching ? 'Searching…' : 'Verify Identity'}
              </Button>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100" /></div>
                <div className="relative flex justify-center text-xs font-bold uppercase tracking-widest">
                  <span className="bg-white px-4 text-slate-300">Cloud Enrollment</span>
                </div>
              </div>
              <Button variant="outline" onClick={handleGoogleLogin} disabled={isSearching || isLibraryClosed}
                className="w-full h-12 text-sm font-semibold rounded-2xl border-2 hover:bg-slate-50 transition-all"
                style={{ borderColor: 'hsl(221,72%,22%)', color: 'hsl(221,72%,22%)' }}>
                <div className="flex items-center gap-3">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                  Institutional Login
                </div>
              </Button>
            </div>
          </div>
        )}

        {/* ── DEPT/PROGRAM ── */}
        {step === 'dept' && identifiedStudent && (
          <Card className="rounded-[2.5rem] shadow-2xl p-10 space-y-6 animate-in slide-in-from-bottom-4 duration-500"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <KioskAvatar
                  name={identifiedStudent.firstName || 'V'}
                  avatarUrl={(identifiedStudent as any).avatarUrl}
                  size={64} rounded="1rem"
                />
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
              <Select value={visitorProgram} onValueChange={setVisitorProgram} disabled={!visitorDeptId || isLoadingProgs}>
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
        {step === 'purpose' && identifiedStudent && isLibraryClosed ? (
          /* ── Library closed — show card instead of purpose picker ── */
          <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-400"
            style={{ background: 'linear-gradient(160deg,hsl(225,70%,42%) 0%,hsl(221,72%,22%) 100%)' }}>
            <div className="px-8 pt-8 pb-6 text-center space-y-3">
              <div className="flex justify-center">
                <KioskAvatar
                  name={`${identifiedStudent.firstName} ${identifiedStudent.lastName}`}
                  avatarUrl={(identifiedStudent as any).avatarUrl}
                  size={72} rounded="1.1rem"
                />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Sorry, {identifiedStudent.firstName}!
                </h2>
                <p className="text-white/70 text-sm font-semibold mt-1">
                  {branchName ?? 'The library'} is currently closed.
                </p>
                {libraryHours?.reason === 'not_yet_open' && libraryHours.openTime ? (
                  <p className="text-white/50 text-xs font-bold mt-1 uppercase tracking-widest">
                    Opens today at {libraryHours.openTime}
                  </p>
                ) : libraryHours?.closeTime ? (
                  <p className="text-white/50 text-xs font-bold mt-1 uppercase tracking-widest">
                    Operating hours: {libraryHours.openTime} – {libraryHours.closeTime}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="bg-white rounded-t-3xl px-8 pt-7 pb-8">
              <div className="text-center space-y-4">
                <div className="text-5xl">🔒</div>
                <div>
                  <p className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                    {branchName ?? 'Library'} is Closed
                  </p>
                  <p className="text-slate-500 text-sm font-medium mt-1 leading-relaxed">
                    {libraryHours?.reason === 'not_yet_open'
                      ? `Please come back when we open at ${libraryHours.openTime}.`
                      : `We're closed for today. Please visit us during operating hours.`}
                  </p>
                  {libraryHours?.openTime && libraryHours?.closeTime && (
                    <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">
                      {libraryHours.openTime} – {libraryHours.closeTime} · {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]}
                    </p>
                  )}
                </div>
                <button onClick={handleReset}
                  className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
                  ← Back
                </button>
              </div>
            </div>
          </div>
        ) : step === 'purpose' && identifiedStudent && (
          <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-400"
            style={{ background: 'linear-gradient(160deg,hsl(225,70%,42%) 0%,hsl(221,72%,22%) 100%)' }}>
            <div className="px-8 pt-8 pb-6 text-center">
              <div className="flex justify-center mb-4">
                <KioskAvatar
                  name={`${identifiedStudent.firstName} ${identifiedStudent.lastName}`}
                  avatarUrl={(identifiedStudent as any).avatarUrl}
                  size={72} rounded="1.1rem"
                />
              </div>
              <h2 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
                Welcome, {identifiedStudent.firstName} {identifiedStudent.lastName}!
              </h2>
              <p className="text-white/55 text-xs font-bold mt-1 uppercase tracking-widest">
                {identifiedStudent.deptID === 'STAFF'
                  ? 'Library Staff'
                  : DEPARTMENTS[identifiedStudent.deptID ?? ''] || identifiedStudent.deptID || ''}
                {identifiedStudent.program ? ` · ${identifiedStudent.program}` : ''}
              </p>
              {isVisitor && (
                <span className="inline-block text-xs font-bold px-3 py-1.5 rounded-full mt-2"
                  style={{ background: 'rgba(251,191,36,0.2)', color: 'hsl(43,85%,85%)' }}>
                  Visitor — Pending Verification
                </span>
              )}
            </div>

            <div className="bg-white rounded-t-3xl px-8 pt-7 pb-8 space-y-5">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                  Select Purpose of Visit
                </p>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="h-14 rounded-2xl border-2 bg-slate-50 font-semibold text-base"
                    style={{ borderColor: purpose ? navy : '#e2e8f0' }}>
                    <SelectValue placeholder="Choose your reason for visiting…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-72">
                    {purposes.map(p => (
                      <SelectItem key={p.value} value={p.value} className="font-semibold text-sm py-3 cursor-pointer">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full gap-3">
                <button onClick={handleReset}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleCheckIn} disabled={!purpose}
                  className="flex-[2] py-3.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))`, boxShadow: purpose ? '0 6px 20px rgba(10,26,77,0.3)' : 'none' }}>
                  Check-In →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && identifiedStudent && (() => {
          const firstName   = identifiedStudent.firstName;
          const fullName    = `${identifiedStudent.firstName} ${identifiedStudent.lastName}`.trim();
          const collegeName = identifiedStudent.deptID === 'STAFF'
            ? 'Library Staff'
            : (DEPARTMENTS[identifiedStudent.deptID ?? ''] || identifiedStudent.deptID || '');
          const prog        = identifiedStudent.program || '';
          const isCheckIn   = lastAction === 'checkin';

          const durStr = (() => {
            if (!sessionDuration) return null;
            const { hours, minutes } = sessionDuration;
            if (hours === 0 && minutes === 0) return 'less than a minute';
            if (hours === 0) return `${minutes} min${minutes !== 1 ? 's' : ''}`;
            if (minutes === 0) return `${hours} hr${hours !== 1 ? 's' : ''}`;
            return `${hours} hr${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
          })();

          return (
            <div className="rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in duration-500"
              style={{ background: 'linear-gradient(160deg,hsl(225,70%,38%) 0%,hsl(221,72%,22%) 100%)' }}>

              <div className="px-8 pt-10 pb-4 text-center space-y-3">
                <div className="flex justify-center">
                  {(identifiedStudent as any).avatarUrl ? (
                    <div className="relative">
                      <KioskAvatar
                        name={`${identifiedStudent.firstName} ${identifiedStudent.lastName}`}
                        avatarUrl={(identifiedStudent as any).avatarUrl}
                        size={72} rounded="1.1rem"
                      />
                      <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: isCheckIn ? '#059669' : '#64748b', border: '2px solid white' }}>
                        {isCheckIn
                          ? <CheckCircle2 size={16} className="text-white" />
                          : <LogOut size={16} className="text-white" />}
                      </div>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                      style={{ background: 'rgba(255,255,255,0.15)' }}>
                      {isCheckIn
                        ? <CheckCircle2 size={34} className="text-white" />
                        : <LogOut       size={34} className="text-white" />}
                    </div>
                  )}
                </div>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest pt-1">
                  {isCheckIn ? 'Check-In Logged' : 'Check-Out Logged'}
                </p>
                <h2 className="text-3xl font-extrabold text-white leading-tight"
                  style={{ fontFamily: "'Playfair Display',serif" }}>
                  {isCheckIn ? 'Welcome to NEU Library,' : 'Thank You,'}
                  <br />{firstName}!
                </h2>
                {collegeName && (
                  <p className="text-white/45 text-xs font-bold uppercase tracking-widest">
                    {collegeName}{prog ? ` · ${prog}` : ''}
                  </p>
                )}
              </div>

              <div className="mx-6 border-t border-white/15 mt-4" />

              <div className="px-8 py-6 text-center space-y-5">
                {isCheckIn ? (
                  <p className="text-white/80 text-base font-medium leading-relaxed">
                    Thank you for logging. You may now enter, <strong className="text-white">{firstName}</strong>.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {durStr && (
                      <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl"
                        style={{ background: 'rgba(255,255,255,0.14)' }}>
                        <LogOut size={15} className="text-white/70" />
                        <span className="text-white font-bold text-base" style={{ fontFamily: "'DM Mono',monospace" }}>
                          {durStr}
                        </span>
                        <span className="text-white/60 text-sm font-medium">inside</span>
                      </div>
                    )}
                    <p className="text-white/85 text-base font-medium leading-relaxed">
                      Thank You <strong className="text-white">{fullName}</strong> for visiting NEU Library.{' '}
                      {durStr && (
                        <>You have been <strong className="text-white">{durStr}</strong> inside.<br /></>
                      )}
                      Your session has been recorded. Have a great day!
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-white/50 text-sm font-semibold">
                  <span>Returning in</span>
                  <span className="text-white font-extrabold text-xl w-7 text-center"
                    style={{ fontFamily: "'DM Mono',monospace" }}>{countdown}</span>
                </div>

                <button onClick={handleReset}
                  className="px-8 py-2 rounded-full font-bold text-sm text-white/60 hover:text-white border border-white/20 hover:border-white/50 transition-all active:scale-95">
                  Done
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── BLOCKED STUDENT POPUP ── */}
        {blockedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
              <div className="px-7 py-7 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <span className="text-3xl">🚫</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Access Restricted
                  </h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed">
                    Hi! <strong>{blockedStudent.name}</strong>, you're prohibited from entering the library.
                    Please contact the admin.
                  </p>
                  <div className="mt-2">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full transition-all duration-1000"
                        style={{ width: `${(blockedCountdown / 5) * 100}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-1 text-center">
                      Dismissing in {blockedCountdown}s
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      if (identifiedStudent) {
                        setContactAdminUser(identifiedStudent);
                        setShowContactAdmin(true);
                      }
                      setBlockedStudent(null);
                    }}
                    className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                    Contact Admin
                  </button>
                  <button
                    onClick={() => setBlockedStudent(null)}
                    className="w-full h-12 rounded-2xl font-bold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">
                    Understood
                  </button>
                </div>
              </div>
            </div>
            <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
          </div>
        )}

        {/* ── BLOCKED INSIDE MODAL ── */}
        {blockedInsideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
              <div className="h-2 w-full" style={{ background: 'linear-gradient(90deg,#dc2626,#ef4444)' }} />
              <div className="px-7 py-7 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(220,38,38,0.08)' }}>
                  <span className="text-4xl">⛔</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Account Blocked
                  </h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed">
                    You have been <strong className="text-red-600">blocked</strong> while inside the library.
                  </p>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Please proceed to the Admin Office for assistance before leaving.
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-red-100" style={{ background: 'rgba(254,242,242,0.8)' }}>
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Action Required</p>
                  <p className="text-xs text-red-600 mt-1">Contact the Library Admin to resolve your account status.</p>
                </div>
                <button
                  onClick={() => { setBlockedInsideModal(false); handleReset(); }}
                  className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                  I Understand
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── NOT REGISTERED POPUP ── */}
        {showNotRegistered && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
              <div className="px-8 pt-8 pb-7 text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(251,191,36,0.12)' }}>
                  <GraduationCap size={32} style={{ color: 'hsl(43,85%,42%)' }} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Not Yet Registered
                  </h3>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed">
                    Sorry, this Institutional ID isn't in our system. Please register using your{' '}
                    <strong className="text-slate-800">Institutional Account</strong> to continue.
                  </p>
                </div>
                <button
                  onClick={handleRegisterFromPopup}
                  disabled={isRegisteringFromPopup}
                  className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-3 border-2 transition-all active:scale-95 disabled:opacity-60"
                  style={{ borderColor: '#e2e8f0', color: '#1e293b', background: 'white' }}>
                  {isRegisteringFromPopup
                    ? <Loader2 size={20} className="animate-spin text-primary" />
                    : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />}
                  {isRegisteringFromPopup ? 'Opening Google…' : 'Register with Google'}
                </button>
                <button
                  onClick={() => setShowNotRegistered(false)}
                  className="w-full text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors py-1">
                  Cancel
                </button>
              </div>
            </div>
            <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
          </div>
        )}

        {/* ── Library Closed Modal ── */}
        {closedMsg && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(12px)' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="px-7 pt-8 pb-6 text-center space-y-4">
                <div className="text-5xl">🔒</div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                    {branchName ?? 'Library'} is Closed
                  </h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed">{closedMsg}</p>
                  {libraryHours?.openTime && libraryHours?.closeTime && (
                    <p className="text-xs font-semibold text-slate-400">
                      Operating hours: {libraryHours.openTime} – {libraryHours.closeTime}
                    </p>
                  )}
                </div>
                <button onClick={() => setClosedMsg(null)}
                  className="w-full h-12 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CredentialRequestModal ── */}
        {showContactAdmin && contactAdminUser && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
            <CredentialRequestModal
              profile={contactAdminUser}
              onClose={() => {
                setShowContactAdmin(false);
                setContactAdminUser(null);
              }}
            />
          </div>
        )}

      </div>
    </div>
  );
}