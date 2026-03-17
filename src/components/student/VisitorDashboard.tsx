"use client";

/**
 * VisitorDashboard
 *
 * Fixes:
 * 1. Uses /users collection (not /temporary_visitors)
 * 2. Asks for studentId during setup (not just dept/program)
 * 3. dept/program save now correctly writes to /users
 * 4. Pending users can always access dashboard after completing setup
 * 5. After sign-out + sign-back-in, skips setup if already done
 * 6. Looks up user by email (not uid) so re-logins always find the record
 */

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit, doc, getDocs, setDoc } from 'firebase/firestore';
import {
  LogOut, Clock, History, Activity, Loader2,
  LayoutDashboard, TrendingUp, LogIn, AlertTriangle,
  GraduationCap, Building2, ArrowRight, IdCard,
} from 'lucide-react';
import {
  format, parseISO, isToday, differenceInMinutes,
  isWithinInterval, startOfDay, endOfDay, subDays, eachDayOfInterval,
} from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { UserRecord, LibraryLogRecord, ProgramRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.94)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.08)',
  borderRadius: '1rem',
};

export default function VisitorDashboard({ onExit }: { onExit: () => void }) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  const [activeTab, setActiveTab]   = useState<'overview' | 'history' | 'analytics'>('overview');
  const [startDate, setStartDate]   = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [endDate, setEndDate]       = useState(format(new Date(), 'yyyy-MM-dd'));

  // Setup form state
  const [setupStudentId, setSetupStudentId] = useState('');
  const [setupDeptId,    setSetupDeptId]    = useState('');
  const [setupProgram,   setSetupProgram]   = useState('');
  const [allDepts,       setAllDepts]       = useState<{ deptID: string; departmentName: string }[]>([]);
  const [deptPrograms,   setDeptPrograms]   = useState<ProgramRecord[]>([]);
  const [isLoadingProgs, setIsLoadingProgs] = useState(false);
  const [isSavingSetup,  setIsSavingSetup]  = useState(false);
  const [setupError,     setSetupError]     = useState('');

  // Profile loaded from /users by email
  const [profile,           setProfile]           = useState<UserRecord | null>(null);
  const [isLoadingProfile,  setIsLoadingProfile]  = useState(true);

  // ── Load profile by email (works after sign-out + re-login) ─────────────
  useEffect(() => {
    if (!user?.email) { setIsLoadingProfile(false); return; }
    getDocs(query(collection(db, 'users'), where('email', '==', user.email), limit(1)))
      .then(snap => {
        if (!snap.empty) setProfile(snap.docs[0].data() as UserRecord);
        setIsLoadingProfile(false);
      })
      .catch(() => setIsLoadingProfile(false));
  }, [user?.email, db]);

  // ── Load departments for setup ───────────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db, 'departments'))
      .then(snap => setAllDepts(
        snap.docs.map(d => d.data() as { deptID: string; departmentName: string })
          .sort((a, b) => a.departmentName.localeCompare(b.departmentName))
      ));
  }, [db]);

  // ── Load programs when dept changes ─────────────────────────────────────
  useEffect(() => {
    if (!setupDeptId) { setDeptPrograms([]); return; }
    setIsLoadingProgs(true);
    setSetupProgram('');
    getDocs(query(collection(db, 'programs'), where('deptID', '==', setupDeptId)))
      .then(snap => setDeptPrograms(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgramRecord))
          .sort((a, b) => a.code.localeCompare(b.code))
      ))
      .finally(() => setIsLoadingProgs(false));
  }, [setupDeptId, db]);

  // ── Save setup ───────────────────────────────────────────────────────────
  const handleSaveSetup = async () => {
    setSetupError('');
    if (!setupStudentId.trim()) { setSetupError('Student ID is required.'); return; }
    if (!setupDeptId)           { setSetupError('Please select your department.'); return; }
    if (!user?.email)           return;

    // Validate student ID format
    const idRegex = /^\d{2}-\d{5}-\d{3}$/;
    if (!idRegex.test(setupStudentId.trim())) {
      setSetupError('Student ID format must be YY-XXXXX-ZZZ (e.g. 24-12864-481)');
      return;
    }

    // Check if student ID is already taken
    const existing = await getDocs(query(collection(db, 'users'), where('id', '==', setupStudentId.trim()), limit(1)));
    // Allow if the doc found is their own (same email)
    if (!existing.empty && existing.docs[0].data().email !== user.email) {
      setSetupError('This Student ID is already registered to another account.');
      return;
    }

    setIsSavingSetup(true);
    try {
      const newId = setupStudentId.trim();
      const newData: UserRecord = {
        id:         newId,
        firstName:  profile?.firstName  || user.displayName?.split(' ').slice(0, -1).join(' ') || '',
        middleName: profile?.middleName || '',
        lastName:   profile?.lastName   || user.displayName?.split(' ').slice(-1)[0] || '',
        email:      user.email!,
        role:       'visitor',
        status:     'pending',
        deptID:     setupDeptId,
        program:    setupProgram || '',
        addedAt:    new Date().toISOString(),
      };
      // Write ONLY to the real student ID doc — no TEMP- doc ever created
      await setDoc(doc(db, 'users', newId), newData, { merge: false });
      setProfile(newData);
    } finally {
      setIsSavingSetup(false);
    }
  };

  // Setup is complete when profile exists with a real student ID and deptID
  const setupComplete = !!profile &&
    !!profile.deptID &&
    profile.deptID !== '' &&
    !!profile.id &&
    profile.id.trim() !== '' &&
    !profile.id.startsWith('TEMP-');

  // Use profile.id for log queries (studentId in library_logs)
  const logStudentId = profile?.id || '';
  const logsQ = useMemoFirebase(
    () => logStudentId
      ? query(collection(db, 'library_logs'), where('studentId', '==', logStudentId),
          orderBy('checkInTimestamp', 'desc'), limit(500))
      : null,
    [db, logStudentId]
  );
  const { data: logs } = useCollection<LibraryLogRecord>(logsQ);

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : user?.displayName || 'Visitor';
  const initials = profile
    ? `${(profile.firstName || 'V')[0]}${(profile.lastName || 'V')[0]}`
    : (user?.displayName || 'V').substring(0, 2).toUpperCase();

  const analytics = useMemo(() => {
    if (!logs) return { weekly: [], totalHours: 0 };
    const start = startOfDay(parseISO(startDate));
    const end   = endOfDay(parseISO(endDate));
    const days  = eachDayOfInterval({ start, end });
    const dateStats: Record<string, number> = {};
    let totalMinutes = 0;
    days.forEach(d => { if (format(d, 'EEE') !== 'Sun') dateStats[format(d, 'MMM dd')] = 0; });
    logs.forEach(l => {
      const ci = parseISO(l.checkInTimestamp);
      if (isWithinInterval(ci, { start, end }) && format(ci, 'EEE') !== 'Sun') {
        const key = format(ci, 'MMM dd');
        if (key in dateStats) dateStats[key]++;
      }
      if (l.checkOutTimestamp)
        totalMinutes += differenceInMinutes(parseISO(l.checkOutTimestamp), parseISO(l.checkInTimestamp));
    });
    return {
      weekly: Object.entries(dateStats).map(([name, visits]) => ({ name, visits })),
      totalHours: Math.floor(totalMinutes / 60),
    };
  }, [logs, startDate, endDate]);

  const navItems = [
    { id: 'overview',  label: 'Dashboard', icon: LayoutDashboard },
    { id: 'history',   label: 'History',   icon: History },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  ];

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isUserLoading || isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 size={32} className="animate-spin opacity-60" />
          <p className="text-sm font-semibold opacity-60 uppercase tracking-widest">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) { onExit(); return null; }

  // ── SETUP SCREEN ─────────────────────────────────────────────────────────
  if (!setupComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6" style={{ fontFamily: "'DM Sans',sans-serif" }}>
        <div className="w-full max-w-md space-y-4">
          {/* Banner */}
          <div className="p-4 rounded-2xl border border-amber-200 flex items-start gap-3"
            style={{ background: 'rgba(255,255,255,0.95)' }}>
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 text-sm">Complete Your Registration</p>
              <p className="text-slate-500 text-xs mt-0.5">
                Enter your Student ID and academic information. An admin will verify your account.
              </p>
            </div>
          </div>

          {/* Setup card */}
          <div style={{ ...cardStyle, background: 'rgba(255,255,255,0.97)' }} className="p-6 space-y-5">
            {/* Welcome */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white"
                style={{ background: 'linear-gradient(135deg,hsl(43,85%,50%),hsl(38,90%,40%))' }}>
                {initials}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-base" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Welcome, {profile?.firstName || user.displayName?.split(' ')[0] || 'Student'}!
                </p>
                <p className="text-slate-400 text-xs">{user.email}</p>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Student ID */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                <IdCard size={11} /> Student ID *
              </label>
              <Input
                placeholder="e.g. XX-YYYYY-ZZZs"
                value={setupStudentId}
                onChange={e => { setSetupStudentId(e.target.value); setSetupError(''); }}
                className="h-12 rounded-xl border-slate-200 bg-slate-50 font-mono font-semibold"
              />
              <p className="text-xs text-slate-400 mt-1">Format: YY-XXXXX-ZZZ</p>
            </div>

            {/* Department */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                <Building2 size={11} /> College / Department *
              </label>
              <Select value={setupDeptId} onValueChange={setSetupDeptId}>
                <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50 font-semibold text-sm">
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

            {/* Program */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                <GraduationCap size={11} /> Program
                {!setupDeptId && <span className="text-amber-500 font-normal normal-case">(Select Department first)</span>}
              </label>
              <Select value={setupProgram} onValueChange={setSetupProgram}
                disabled={!setupDeptId || isLoadingProgs}>
                <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50 font-semibold text-sm disabled:opacity-50">
                  <SelectValue placeholder={!setupDeptId ? 'Select department first' : isLoadingProgs ? 'Loading...' : 'Select your program'} />
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

            {/* Error */}
            {setupError && (
              <p className="text-sm text-red-500 font-medium bg-red-50 px-3 py-2 rounded-xl">{setupError}</p>
            )}

            <button onClick={handleSaveSetup}
              disabled={!setupStudentId.trim() || !setupDeptId || isSavingSetup}
              className="w-full h-12 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
              style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
              {isSavingSetup ? <Loader2 size={16} className="animate-spin" /> : <><ArrowRight size={15} /> Continue to Dashboard</>}
            </button>

            <button onClick={onExit} className="w-full text-center text-slate-400 text-xs font-medium hover:text-slate-600 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN VISITOR DASHBOARD ────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      {/* Pending banner */}
      {profile?.status === 'pending' && (
        <div className="relative z-20 px-4 py-2.5 flex items-center justify-center gap-2"
          style={{ background: 'rgba(245,158,11,0.9)', backdropFilter: 'blur(10px)' }}>
          <AlertTriangle size={14} className="text-white flex-shrink-0" />
          <p className="text-white text-xs font-semibold">
            Your account is pending admin verification. Visit history is being tracked.
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 relative z-10"
          style={{ background: `linear-gradient(180deg,hsl(221,72%,18%),hsl(221,72%,24%))` }}>
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg,hsl(43,85%,50%),hsl(38,90%,40%))' }}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm truncate">{displayName}</p>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'hsl(43,85%,50%,0.2)', color: 'hsl(43,85%,70%)' }}>
                  {profile?.status === 'pending' ? 'Pending' : 'Visitor'}
                </span>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{
                  color: activeTab === item.id ? 'white' : 'rgba(255,255,255,0.5)',
                  background: activeTab === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                }}>
                <item.icon size={16} /> {item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-white/10">
            <button onClick={onExit}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl font-semibold text-sm text-white/50 hover:text-white hover:bg-white/10 transition-all">
              <LogOut size={15} /> Exit
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 relative z-10">
          <div style={cardStyle} className="p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Visitor Portal</p>
              <h2 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                {navItems.find(n => n.id === activeTab)?.label}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: 'hsl(221,72%,22%,0.07)', color: navy }}>
                {profile?.id} · {profile?.deptID} · {profile?.program || 'No program'}
              </span>
              <button onClick={onExit} className="hidden lg:flex w-9 h-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 transition-all">
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Total Visits',  value: logs?.length ?? 0,          icon: LogIn,    color: navy },
                  { label: 'Study Hours',   value: `${analytics.totalHours}h`, icon: Clock,    color: '#059669' },
                  { label: 'Today',         value: logs?.filter(l => isToday(parseISO(l.checkInTimestamp))).length ?? 0, icon: Activity, color: '#7c3aed' },
                ].map(s => (
                  <div key={s.label} style={cardStyle} className="p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{ background: s.color }}>
                      <s.icon size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>{s.value}</p>
                      <p className="text-slate-400 text-xs font-medium">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={cardStyle} className="overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "'Playfair Display',serif" }}>Recent Visits</h3>
                </div>
                {!logs || logs.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm italic">No visits yet.</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {logs.slice(0, 5).map(l => {
                      const ci = parseISO(l.checkInTimestamp);
                      const noTap = !l.checkOutTimestamp && !isToday(ci);
                      const mins = l.checkOutTimestamp ? differenceInMinutes(parseISO(l.checkOutTimestamp), ci) : null;
                      return (
                        <div key={l.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{l.purpose}</p>
                            <p className="text-slate-400 text-xs">{format(ci, 'MMM d, h:mm a')}</p>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{
                              background: l.checkOutTimestamp ? '#f0fdf4' : noTap ? '#fef2f2' : '#eff6ff',
                              color: l.checkOutTimestamp ? '#059669' : noTap ? '#ef4444' : '#3b82f6',
                            }}>
                            {mins !== null ? `${mins}m` : noTap ? 'NO TAP' : 'ACTIVE'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* History */}
          {activeTab === 'history' && (
            <div style={cardStyle} className="overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "'Playfair Display',serif" }}>Visit History</h3>
                <p className="text-slate-400 text-xs mt-0.5">{logs?.length || 0} total records</p>
              </div>
              {!logs || logs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm italic">No visit history yet.</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {logs.map(l => {
                    const ci = parseISO(l.checkInTimestamp);
                    const noTap = !l.checkOutTimestamp && !isToday(ci);
                    const mins = l.checkOutTimestamp ? differenceInMinutes(parseISO(l.checkOutTimestamp), ci) : null;
                    return (
                      <div key={l.id} className="px-4 py-3.5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{l.purpose}</p>
                            <p className="text-slate-400 text-xs mt-0.5">
                              {format(ci, 'MMM d, h:mm a')} → {l.checkOutTimestamp ? format(parseISO(l.checkOutTimestamp), 'h:mm a') : noTap ? 'NO TAP' : 'ACTIVE'}
                            </p>
                          </div>
                          {mins !== null && (
                            <span className="font-bold text-sm flex-shrink-0" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                              {mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Analytics */}
          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <div style={cardStyle} className="p-4 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "'Playfair Display',serif" }}>Visit Frequency</h3>
                <div className="flex gap-2">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="h-9 text-sm font-semibold rounded-xl border border-slate-200 bg-slate-50 px-3 flex-1" />
                  <span className="text-slate-300 self-center text-sm">to</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="h-9 text-sm font-semibold rounded-xl border border-slate-200 bg-slate-50 px-3 flex-1" />
                </div>
                <div style={{ height: '200px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.weekly} margin={{ left: -30, right: 8, top: 4, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeOpacity={0.07} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="visits" radius={[5, 5, 0, 0]} barSize={22}>
                        {analytics.weekly.map((e, i) => <Cell key={i} fill={e.visits > 0 ? navy : '#e2e8f0'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div style={cardStyle} className="p-4 text-center">
                  <p className="font-bold text-3xl text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>{logs?.length || 0}</p>
                  <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-wide">Total Visits</p>
                </div>
                <div style={cardStyle} className="p-4 text-center">
                  <p className="font-bold text-3xl text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>{analytics.totalHours}h</p>
                  <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-wide">Study Hours</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden z-50 border-t border-white/10"
        style={{ background: 'rgba(10,26,77,0.95)', backdropFilter: 'blur(20px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)}
              className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all flex-1"
              style={{ color: activeTab === item.id ? 'hsl(43,85%,60%)' : 'rgba(255,255,255,0.4)' }}>
              <item.icon size={18} />
              <span className="text-xs font-semibold">{item.label}</span>
            </button>
          ))}
          <button onClick={onExit}
            className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all flex-1"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <LogOut size={18} />
            <span className="text-xs font-semibold">Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}