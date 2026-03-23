"use client";

import { useMemo, useState, useCallback } from 'react';
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell,
  Pie, PieChart, Legend, ReferenceLine, ResponsiveContainer,
  Tooltip, Line, ComposedChart,
} from 'recharts';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import {
  format, subDays, parseISO, startOfDay, endOfDay,
  isWithinInterval, eachDayOfInterval, differenceInCalendarDays,
  startOfMonth, differenceInMinutes, getHours, getDay,
} from 'date-fns';
import {
  Users, TrendingUp, Sparkles, BarChart3, TrendingDown, Minus,
  PieChart as PieIcon, Filter, X, GitCompareArrows, Clock,
} from 'lucide-react';
import { LibraryLogRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { OccupancyHeatmap } from './OccupancyHeatmap';

const navy    = 'hsl(221,72%,22%)';
const COLOR_A = 'hsl(221,72%,38%)';
const COLOR_B = 'hsl(25,90%,52%)';

const COLORS = [
  'hsl(221,72%,22%)', 'hsl(221,55%,42%)', 'hsl(262,83%,58%)',
  'hsl(189,79%,38%)', 'hsl(43,85%,50%)',  'hsl(221,83%,68%)',
  'hsl(10,80%,55%)',  'hsl(150,60%,40%)',
];

const DEPT_ORDER = [
  'LIBRARY','STAFF','ABM','CAS','CBA','CEA','CED','CICS',
  'CMT','COA','COC','COM','COMS','CON','CPT','CRIM','CRT','SOIR',
];

const BAR_PALETTE = [
  'hsl(221,72%,32%)', 'hsl(262,70%,55%)', 'hsl(189,75%,38%)',
  'hsl(43,90%,48%)',  'hsl(10,75%,52%)',  'hsl(150,60%,38%)',
  'hsl(330,65%,52%)', 'hsl(25,85%,50%)',
];

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

const statCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1.25rem',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

type DatePreset = 'today' | '7d' | '30d' | 'month' | 'custom';
type RoleFilter  = 'all' | 'student' | 'staff';
type VisitStatus = 'all' | 'completed' | 'active';

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today',  label: 'Today'        },
  { id: '7d',     label: 'Last 7 Days'  },
  { id: '30d',    label: 'Last 30 Days' },
  { id: 'month',  label: 'This Month'   },
  { id: 'custom', label: 'Custom'       },
];

function getPresetRange(preset: DatePreset) {
  const today = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  switch (preset) {
    case 'today': return { start: fmt(today),              end: fmt(today) };
    case '7d':    return { start: fmt(subDays(today, 6)),  end: fmt(today) };
    case '30d':   return { start: fmt(subDays(today, 29)), end: fmt(today) };
    case 'month': return { start: fmt(startOfMonth(today)),end: fmt(today) };
    default:      return { start: fmt(subDays(today, 6)),  end: fmt(today) };
  }
}

function fmtDur(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 12px', boxShadow: '0 4px 16px rgba(10,26,77,0.12)', fontFamily: "'DM Sans',sans-serif" }}>
      {label && <p style={{ fontSize: 14, fontWeight: 700, color: navy, marginBottom: 4 }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ fontSize: 15, fontWeight: 600, color: '#475569' }}>
          {p.name && !['visits','value','a','b','trend','A trend','B trend'].includes(p.name) ? `${p.name}: ` : ''}
          <span style={{ fontWeight: 800, color: p.color || navy }}>{p.value}</span>{' '}visit{p.value !== 1 ? 's' : ''}
        </p>
      ))}
    </div>
  );
}

function DonutLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  return (
    <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)}
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function CompareCard({ title, labelA, labelB, valueA, valueB, fmt = (v: number) => String(v), icon, note }: {
  title: string; labelA: string; labelB: string; valueA: number | string; valueB: number | string;
  fmt?: (v: number) => string; icon: React.ReactNode; note?: string;
}) {
  const numA = typeof valueA === 'number' ? valueA : 0;
  const numB = typeof valueB === 'number' ? valueB : 0;
  const pct  = numA > 0 ? Math.round(((numB - numA) / numA) * 100) : null;
  return (
    <div style={statCard}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">{icon}<span>{title}</span></div>
        {pct !== null && (
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
            style={pct > 0 ? { background: 'rgba(5,150,105,0.1)', color: '#059669' } : pct < 0 ? { background: 'rgba(220,38,38,0.1)', color: '#dc2626' } : { background: 'rgba(100,116,139,0.1)', color: '#64748b' }}>
            {pct > 0 ? '+' : ''}{pct}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate" style={{ color: COLOR_A }}>{labelA}</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>{typeof valueA === 'number' ? fmt(valueA) : valueA}</div>
        </div>
        <div className="flex items-center justify-center"><span className="text-slate-300 font-bold text-sm">vs</span></div>
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate" style={{ color: COLOR_B }}>{labelB}</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>{typeof valueB === 'number' ? fmt(valueB) : valueB}</div>
        </div>
      </div>
      {typeof valueA === 'number' && typeof valueB === 'number' && (valueA + valueB) > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: '#f1f5f9' }}>
          <div className="h-full rounded-l-full transition-all duration-500" style={{ width: `${Math.round((numA / (numA + numB)) * 100)}%`, background: COLOR_A }} />
          <div className="h-full flex-1 rounded-r-full" style={{ background: COLOR_B }} />
        </div>
      )}
      {note && <p className="text-[10px] text-slate-400 font-medium text-center">{note}</p>}
    </div>
  );
}

export function OverviewDashboard({ branchId }: { branchId?: string | null }) {
  const db = useFirestore();

  const [preset,     setPreset]     = useState<DatePreset>('7d');
  const [startDate,  setStartDate]  = useState(getPresetRange('7d').start);
  const [endDate,    setEndDate]    = useState(getPresetRange('7d').end);
  const [deptFilter, setDeptFilter] = useState('all');
  const [progFilter, setProgFilter] = useState('all');
  const [showCustom, setShowCustom] = useState(false);
  const [focusDay,   setFocusDay]   = useState<string | null>(null);
  const [roleFilter,  setRoleFilter]  = useState<RoleFilter>('all');
  const [visitStatus, setVisitStatus] = useState<VisitStatus>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [aDept, setADept] = useState('all'); const [aProg, setAProg] = useState('all');
  const [bDept, setBDept] = useState('all'); const [bProg, setBProg] = useState('all');

  // Simple query — branch filtering applied client-side to avoid composite index
  const logsRef = useMemoFirebase(() => collection(db, 'library_logs'), [db]);
  const deptsRef    = useMemoFirebase(() => collection(db, 'departments'),  [db]);
  const programsRef = useMemoFirebase(() => collection(db, 'programs'),     [db]);
  const usersRef    = useMemoFirebase(() => collection(db, 'users'),        [db]);
  const branchesRef = useMemoFirebase(() => collection(db, 'branches'),     [db]);
  const { data: allBranches } = useCollection<{ id: string; name: string }>(branchesRef);
  const allBranchNames = useMemo(
    () => Object.fromEntries((allBranches || []).map(b => [b.id, b.name])),
    [allBranches]
  );

  const { data: allLogs, isLoading } = useCollection<LibraryLogRecord>(logsRef);
  const { data: depts }              = useCollection<DepartmentRecord>(deptsRef);
  const { data: allPrograms }        = useCollection<ProgramRecord>(programsRef);
  const { data: allUsers }           = useCollection<{ id: string; role: string }>(usersRef);

  const userRoleMap = useMemo(() => {
    const m: Record<string, string> = {};
    (allUsers || []).forEach(u => { m[u.id] = u.role; });
    return m;
  }, [allUsers]);

  const isStaffLog = useCallback((l: LibraryLogRecord) => {
    const role = userRoleMap[l.studentId];
    return role === 'admin' || role === 'super_admin'
      || (l as any).program?.toUpperCase().includes('STAFF')
      || l.deptID === 'LIBRARY';
  }, [userRoleMap]);

  const sortedDepts = useMemo(() => {
    if (!depts) return [];
    return [...depts].sort((a, b) => {
      const ai = DEPT_ORDER.indexOf(a.deptID); const bi = DEPT_ORDER.indexOf(b.deptID);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1; if (bi !== -1) return 1;
      return a.deptID.localeCompare(b.deptID);
    });
  }, [depts]);

  function sortProgs(progs: ProgramRecord[]) {
    return [...progs].sort((a, b) => {
      const aS = a.code.toUpperCase().includes('STAFF') ? 0 : 1;
      const bS = b.code.toUpperCase().includes('STAFF') ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return a.name.localeCompare(b.name);
    });
  }

  const availablePrograms = useMemo(() =>
    deptFilter !== 'all' && allPrograms ? sortProgs(allPrograms.filter(p => p.deptID === deptFilter)) : [],
    [deptFilter, allPrograms]);

  const aPrograms = useMemo(() => aDept !== 'all' && allPrograms ? sortProgs(allPrograms.filter(p => p.deptID === aDept)) : [], [aDept, allPrograms]);
  const bPrograms = useMemo(() => {
    if (bDept === 'all' || !allPrograms) return [];
    const base = allPrograms.filter(p => p.deptID === bDept);
    const filtered = aDept === bDept && aProg !== 'all' ? base.filter(p => p.code !== aProg) : base;
    return sortProgs(filtered);
  }, [bDept, aDept, aProg, allPrograms]);

  const startDt   = useMemo(() => startOfDay(parseISO(startDate)), [startDate]);
  const endDt     = useMemo(() => endOfDay(parseISO(endDate)),     [endDate]);
  const totalDays = Math.max(1, differenceInCalendarDays(endDt, startDt) + 1);

  const prevStart = useMemo(() => {
    const days = differenceInCalendarDays(endDt, startDt) + 1;
    return startOfDay(subDays(startDt, days));
  }, [startDt, endDt]);
  const prevEnd = useMemo(() => endOfDay(subDays(startDt, 1)), [startDt]);

  const applyPreset = useCallback((id: DatePreset) => {
    setPreset(id); setFocusDay(null); setRoleFilter('all'); setVisitStatus('all');
    if (id !== 'custom') { const r = getPresetRange(id); setStartDate(r.start); setEndDate(r.end); setShowCustom(false); }
    else setShowCustom(true);
  }, []);

  const inRange = useCallback((l: LibraryLogRecord) => {
    if (!isWithinInterval(parseISO(l.checkInTimestamp), { start: startDt, end: endDt })) return false;
    // Branch filter — client-side; logs without branchId show in All Branches view
    if (branchId && (l as any).branchId && (l as any).branchId !== branchId) return false;
    return true;
  }, [startDt, endDt, branchId]);

  const passesRoleFilter = useCallback((l: LibraryLogRecord) => {
    if (roleFilter === 'all') return true;
    const staff = isStaffLog(l);
    return roleFilter === 'staff' ? staff : !staff;
  }, [roleFilter, isStaffLog]);

  const passesVisitStatus = useCallback((l: LibraryLogRecord) => {
    const isLibraryClosed = l.autoCheckout && (l as any).checkoutReason === 'library_closed';
    if (visitStatus === 'all')       return true;
    // 'completed' = properly checked out (not auto-closed as library_closed)
    if (visitStatus === 'completed') return !!l.checkOutTimestamp && !isLibraryClosed;
    // 'active' = currently inside (no checkout, not auto-closed)
    if (visitStatus === 'active')    return !l.checkOutTimestamp && !isLibraryClosed;
    return true;
  }, [visitStatus]);

  const periodLogs = useMemo(() => {
    if (!allLogs) return [];
    return allLogs.filter(l => {
      if (!inRange(l)) return false;
      if (deptFilter !== 'all' && l.deptID !== deptFilter) return false;
      if (progFilter !== 'all' && (l as any).program !== progFilter) return false;
      if (!passesRoleFilter(l)) return false;
      if (!passesVisitStatus(l)) return false;
      return true;
    });
  }, [allLogs, inRange, deptFilter, progFilter, passesRoleFilter, passesVisitStatus]);

  const prevPeriodLogs = useMemo(() => {
    if (!allLogs) return [];
    return allLogs.filter(l => {
      const d = parseISO(l.checkInTimestamp);
      if (!isWithinInterval(d, { start: prevStart, end: prevEnd })) return false;
      if (deptFilter !== 'all' && l.deptID !== deptFilter) return false;
      if (!passesRoleFilter(l)) return false;
      return true;
    });
  }, [allLogs, prevStart, prevEnd, deptFilter, passesRoleFilter]);

  const focusLogs = useMemo(() =>
    focusDay ? periodLogs.filter(l => format(parseISO(l.checkInTimestamp), 'MMM dd') === focusDay) : periodLogs,
    [periodLogs, focusDay]);

  const filterSeg = useCallback((dept: string, prog: string) => {
    if (!allLogs) return [];
    return allLogs.filter(l => {
      if (!inRange(l)) return false;
      if (dept !== 'all' && l.deptID !== dept) return false;
      if (prog !== 'all' && (l as any).program !== prog) return false;
      if (!passesRoleFilter(l)) return false;
      if (!passesVisitStatus(l)) return false;
      return true;
    });
  }, [allLogs, inRange, passesRoleFilter, passesVisitStatus]);

  const aLogs = useMemo(() => filterSeg(aDept, aProg), [filterSeg, aDept, aProg]);
  const bLogs = useMemo(() => filterSeg(bDept, bProg), [filterSeg, bDept, bProg]);

  const totalVisits = periodLogs.length;
  const avgDaily    = totalVisits / totalDays;

  // ── Average session duration ───────────────────────────────────────────────
  const avgSessionMins = useMemo(() => {
    const completed = periodLogs.filter(l => l.checkOutTimestamp);
    if (!completed.length) return null;
    const totalMins = completed.reduce((sum, l) =>
      sum + differenceInMinutes(parseISO(l.checkOutTimestamp!), parseISO(l.checkInTimestamp)), 0);
    return Math.round(totalMins / completed.length);
  }, [periodLogs]);

  const topPurpose = useMemo(() => {
    const c: Record<string, number> = {};
    focusLogs.forEach(l => { c[l.purpose] = (c[l.purpose] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  }, [focusLogs]);

  const trendPct = useMemo(() => {
    const prev = prevPeriodLogs.length;
    if (!prev) return null;
    return Math.round(((totalVisits - prev) / prev) * 100);
  }, [totalVisits, prevPeriodLogs]);

  const periodLabel = useMemo(() => {
    const rangeStr = (() => {
      switch (preset) {
        case 'today': return 'Today'; case '7d': return 'Last 7 Days';
        case '30d': return 'Last 30 Days'; case 'month': return 'This Month';
        default: {
          const s = format(parseISO(startDate), 'MMM d'); const e = format(parseISO(endDate), 'MMM d');
          return s === e ? s : `${s} – ${e}`;
        }
      }
    })();
    return rangeStr;
  }, [preset, startDate, endDate]);

  // Branch label shown in chart titles
  const branchLabel = (branchId && allBranchNames[branchId])
    ? ` · ${allBranchNames[branchId]}`
    : !branchId ? ' · All Branches' : '';

  // Days to exclude from chart based on branch schedule (closed days)
  const closedDayNames = useMemo(() => {
    const branch = (allBranches || []).find(b => b.id === branchId);
    const sched  = (branch as any)?.schedule as Record<string, { closed: boolean }> | undefined;
    if (!sched) return new Set(['Sun']); // default: exclude Sunday only
    const dayMap: Record<string, string> = {
      sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
    };
    const closed = new Set<string>();
    Object.entries(sched).forEach(([key, val]) => { if (val.closed) closed.add(dayMap[key] || ''); });
    return closed;
  }, [allBranches, branchId]);

  const allDays = useMemo(() =>
    eachDayOfInterval({ start: startDt, end: endDt }).filter(d => !closedDayNames.has(format(d, 'EEE'))),
    [startDt, endDt, closedDayNames]);

  const chartData = useMemo(() => {
    const stats: Record<string, { visits: number; a: number; b: number }> = {};
    allDays.forEach(d => { stats[format(d, 'MMM dd')] = { visits: 0, a: 0, b: 0 }; });
    periodLogs.forEach(l => { const k = format(parseISO(l.checkInTimestamp), 'MMM dd'); if (k in stats) stats[k].visits++; });
    if (compareMode) {
      aLogs.forEach(l => { const k = format(parseISO(l.checkInTimestamp), 'MMM dd'); if (k in stats) stats[k].a++; });
      bLogs.forEach(l => { const k = format(parseISO(l.checkInTimestamp), 'MMM dd'); if (k in stats) stats[k].b++; });
    }
    return Object.entries(stats).map(([name, v]) => ({ name, ...v }));
  }, [allDays, periodLogs, compareMode, aLogs, bLogs]);

  const avgLine = chartData.length ? Math.round(chartData.reduce((s, d) => s + d.visits, 0) / chartData.length) : 0;
  const peakDay = chartData.reduce((a, b) => b.visits > a.visits ? b : a, { name: '—', visits: 0, a: 0, b: 0 });

  const deptBreakdown = useMemo(() => {
    const c: Record<string, number> = {};
    focusLogs.forEach(l => { const k = l.deptID || 'N/A'; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [focusLogs]);

  const purposeBreakdown = useMemo(() => {
    const c: Record<string, number> = {};
    focusLogs.forEach(l => { c[l.purpose] = (c[l.purpose] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([name, visits], i) => ({ name, visits, fill: COLORS[i % COLORS.length] }));
  }, [focusLogs]);

  const aDeptBreakdown = useMemo(() => { const c: Record<string,number>={}; aLogs.forEach(l=>{const k=l.deptID||'N/A';c[k]=(c[k]||0)+1;}); return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value})); }, [aLogs]);
  const bDeptBreakdown = useMemo(() => { const c: Record<string,number>={}; bLogs.forEach(l=>{const k=l.deptID||'N/A';c[k]=(c[k]||0)+1;}); return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value})); }, [bLogs]);

  const abPurposeKeys = useMemo(() => { const s=new Set<string>(); [...aLogs,...bLogs].forEach(l=>s.add(l.purpose)); return Array.from(s).sort(); }, [aLogs,bLogs]);
  const aPurposeBreakdown = useMemo(() => { const c: Record<string,number>={}; aLogs.forEach(l=>{c[l.purpose]=(c[l.purpose]||0)+1;}); return abPurposeKeys.map(name=>({name,a:c[name]||0})); }, [aLogs,abPurposeKeys]);
  const bPurposeBreakdown = useMemo(() => { const c: Record<string,number>={}; bLogs.forEach(l=>{c[l.purpose]=(c[l.purpose]||0)+1;}); return abPurposeKeys.map(name=>({name,b:c[name]||0})); }, [bLogs,abPurposeKeys]);
  const abPurposeMerged = useMemo(() => abPurposeKeys.map(name=>({name,a:aPurposeBreakdown.find(x=>x.name===name)?.a??0,b:bPurposeBreakdown.find(x=>x.name===name)?.b??0})), [abPurposeKeys,aPurposeBreakdown,bPurposeBreakdown]);

  const aTotal=aLogs.length; const bTotal=bLogs.length;
  const aAvg=parseFloat((aTotal/totalDays).toFixed(1)); const bAvg=parseFloat((bTotal/totalDays).toFixed(1));

  function peakOfLogs(logs: LibraryLogRecord[]): [string,number] {
    const c: Record<string,number>={};
    logs.forEach(l=>{const k=format(parseISO(l.checkInTimestamp),'MMM dd');c[k]=(c[k]||0)+1;});
    return (Object.entries(c).sort((a,b)=>b[1]-a[1])[0] as [string,number])||['—',0];
  }
  function topPurposeOf(logs: LibraryLogRecord[]) {
    const c: Record<string,number>={};
    logs.forEach(l=>{c[l.purpose]=(c[l.purpose]||0)+1;});
    return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
  }

  const aPeak=useMemo(()=>peakOfLogs(aLogs),[aLogs]);
  const bPeak=useMemo(()=>peakOfLogs(bLogs),[bLogs]);
  const aTopPurp=useMemo(()=>topPurposeOf(aLogs),[aLogs]);
  const bTopPurp=useMemo(()=>topPurposeOf(bLogs),[bLogs]);

  const aLabel = aDept==='all'?'All Depts':aProg!=='all'?aProg:aDept;
  const bLabel = bDept==='all'?'All Depts':bProg!=='all'?bProg:bDept;
  const focusLabel = focusDay ? `Day: ${focusDay}` : periodLabel;
  const roleLabel   = roleFilter==='student'?' · Students':roleFilter==='staff'?' · Staff':'';
  const statusLabel = visitStatus==='completed'?' · Completed':visitStatus==='active'?' · Inside only':'';

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 rounded-2xl bg-white/40" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(4)].map((_,i)=><div key={i} className="h-32 rounded-2xl bg-white/40"/>)}</div>
        <div className="h-64 rounded-2xl bg-white/40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="h-72 rounded-2xl bg-white/40"/><div className="h-72 rounded-2xl bg-white/40"/></div>
        <div className="h-48 rounded-2xl bg-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ── Control Room ── */}
      <div className="p-3 sm:p-4 rounded-2xl flex flex-wrap items-center gap-2 sm:gap-3"
        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 2px 12px rgba(10,26,77,0.07)' }}>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest flex-shrink-0" style={{ color: navy }}>
          <Filter size={12} /> Control Room
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
          {DATE_PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={preset===p.id?{background:navy,color:'white'}:{color:'#64748b'}}>{p.label}</button>
          ))}
        </div>
        {(preset==='custom'||showCustom) && (
          <div className="flex items-center gap-2">
            <input type="date" value={startDate} onChange={e=>{setStartDate(e.target.value);setFocusDay(null);}}
              style={{height:34,padding:'0 10px',borderRadius:10,border:'1px solid #e2e8f0',background:'white',fontSize:'0.82rem',fontWeight:600,color:'#1e293b',outline:'none',width:140}}/>
            <span className="text-slate-300 text-xs font-bold">→</span>
            <input type="date" value={endDate} onChange={e=>{setEndDate(e.target.value);setFocusDay(null);}}
              style={{height:34,padding:'0 10px',borderRadius:10,border:'1px solid #e2e8f0',background:'white',fontSize:'0.82rem',fontWeight:600,color:'#1e293b',outline:'none',width:140}}/>
          </div>
        )}
        <div className={compareMode?'opacity-40 pointer-events-none select-none':''} title={compareMode?'Unavailable in Compare Mode':undefined}>
          <Select value={deptFilter} onValueChange={v=>{setDeptFilter(v);setProgFilter('all');setFocusDay(null);}} disabled={compareMode}>
            <SelectTrigger className="h-9 w-44 bg-white rounded-xl border-slate-200 font-semibold text-xs">
              <span className="truncate font-bold" style={{fontFamily:"'DM Mono',monospace",fontSize:'0.8rem'}}>{deptFilter==='all'?'All Colleges':deptFilter}</span>
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-64">
              <SelectItem value="all" className="text-xs font-semibold">All Colleges</SelectItem>
              {sortedDepts.map(d=>(
                <SelectItem key={d.deptID} value={d.deptID} className="text-xs font-semibold">
                  <span className="font-bold mr-1" style={{color:navy,fontFamily:"'DM Mono',monospace"}}>{d.deptID}</span>{' - '}{d.departmentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {deptFilter!=='all'&&!compareMode&&(
          <Select value={progFilter} onValueChange={v=>{setProgFilter(v);setFocusDay(null);}}>
            <SelectTrigger className="h-9 w-44 bg-white rounded-xl border-slate-200 font-semibold text-xs">
              <span className="truncate font-bold" style={{fontFamily:"'DM Mono',monospace",fontSize:'0.8rem'}}>{progFilter==='all'?'All Programs':progFilter}</span>
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-64">
              <SelectItem value="all" className="text-xs font-semibold">All Programs</SelectItem>
              {availablePrograms.map(p=>(
                <SelectItem key={p.code} value={p.code} className="text-xs font-semibold">
                  <span className="font-bold mr-1" style={{color:navy,fontFamily:"'DM Mono',monospace"}}>{p.code}</span>{p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Role filter */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
          {([{id:'all',label:'All roles'},{id:'student',label:'Students'},{id:'staff',label:'Staff / Faculty'}] as {id:RoleFilter;label:string}[]).map(r=>(
            <button key={r.id} onClick={()=>{setRoleFilter(r.id);setFocusDay(null);}}
              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={roleFilter===r.id?{background:navy,color:'white'}:{color:'#64748b'}}>{r.label}</button>
          ))}
        </div>
        {/* Visit status filter */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
          {([
            {id:'all'       as const, label:'All visits' },
            {id:'completed' as const, label:'Completed'  },
            {id:'active'    as const, label:'Inside only'},
          ] as {id:VisitStatus;label:string}[]).map(s=>(
            <button key={s.id} onClick={()=>{setVisitStatus(s.id);setFocusDay(null);}}
              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={visitStatus===s.id
                ? {background: s.id==='active' ? '#059669' : s.id==='completed' ? '#64748b' : navy, color:'white'}
                : {color:'#64748b'}}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={()=>{setCompareMode(m=>!m);setFocusDay(null);}}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 border"
          style={compareMode?{background:navy,color:'white',borderColor:navy}:{background:'white',color:navy,borderColor:`${navy}30`}}>
          <GitCompareArrows size={13}/>{compareMode?'Exit Compare':'Compare'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {focusDay&&(
            <button onClick={()=>setFocusDay(null)}
              className="flex items-center gap-1 h-8 px-3 rounded-xl text-xs font-bold border transition-all"
              style={{background:'rgba(10,26,77,0.07)',color:navy,borderColor:`${navy}20`}}>
              <X size={11}/> Clear Day Filter
            </button>
          )}
          <span className="text-xs font-semibold text-slate-400">{focusLogs.length} record{focusLogs.length!==1?'s':''}{roleLabel}{statusLabel}</span>
        </div>
      </div>

      {/* Compare selectors */}
      {compareMode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl"
          style={{background:'rgba(255,255,255,0.85)',backdropFilter:'blur(12px)',border:`1px solid ${navy}18`}}>
          {([{dept:aDept,prog:aProg,setDept:setADept,setProg:setAProg,progs:aPrograms,color:COLOR_A,label:'Group A'},{dept:bDept,prog:bProg,setDept:setBDept,setProg:setBProg,progs:bPrograms,color:COLOR_B,label:'Group B'}]).map(g=>(
            <div key={g.label} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest pb-1"
                style={{color:g.color,borderBottom:`2px solid ${g.color}`}}>
                <div className="w-2.5 h-2.5 rounded-full" style={{background:g.color}}/>{g.label}
              </div>
              <Select value={g.dept} onValueChange={v=>{g.setDept(v);g.setProg('all');}}>
                <SelectTrigger className="h-9 bg-white rounded-xl border-slate-200 text-xs">
                  <span className="font-bold truncate" style={{fontFamily:"'DM Mono',monospace",fontSize:'0.8rem'}}>{g.dept==='all'?'All Colleges':g.dept}</span>
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  <SelectItem value="all" className="text-xs font-semibold">All Colleges</SelectItem>
                  {sortedDepts.map(d=>(
                    <SelectItem key={d.deptID} value={d.deptID} className="text-xs font-semibold">
                      <span className="font-bold mr-1" style={{color:g.color,fontFamily:"'DM Mono',monospace"}}>{d.deptID}</span>{d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {g.dept!=='all'&&(
                <Select value={g.prog} onValueChange={g.setProg}>
                  <SelectTrigger className="h-9 bg-white rounded-xl border-slate-200 text-xs">
                    <span className="font-bold truncate" style={{fontFamily:"'DM Mono',monospace",fontSize:'0.8rem'}}>{g.prog==='all'?'All Programs':g.prog}</span>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-60">
                    <SelectItem value="all" className="text-xs font-semibold">All Programs</SelectItem>
                    {g.progs.map(p=>(
                      <SelectItem key={p.code} value={p.code} className="text-xs font-semibold">
                        <span className="font-bold mr-1" style={{color:g.color,fontFamily:"'DM Mono',monospace"}}>{p.code}</span>{p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Stat cards ── */}
      {!compareMode ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total visitors */}
          <div style={statCard}>
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-2xl text-white" style={{background:`linear-gradient(135deg,${navy},hsl(221,60%,35%))`,boxShadow:`0 6px 18px ${navy}30`}}><Users size={22}/></div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">{focusDay||periodLabel}{roleLabel}{statusLabel}</span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">{focusDay?'Day Visitors':'Period Visitors'}</p>
              <p className="text-3xl sm:text-4xl font-bold text-slate-900" style={{fontFamily:"'Playfair Display',serif"}}>{focusDay?focusLogs.length:totalVisits}</p>
            </div>
          </div>
          {/* Daily avg */}
          <div style={statCard}>
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-2xl text-white" style={{background:'linear-gradient(135deg,#2563eb,#3b82f6)',boxShadow:'0 6px 18px #2563eb30'}}><BarChart3 size={22}/></div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide">Daily Avg</span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Avg Daily Traffic</p>
              <p className="text-3xl sm:text-4xl font-bold text-slate-900" style={{fontFamily:"'Playfair Display',serif"}}>{avgDaily.toFixed(1)}</p>
              <p className="text-xs text-slate-400 font-medium mt-1">{totalVisits} visits ÷ {totalDays} day{totalDays!==1?'s':''}</p>
            </div>
          </div>
          {/* Purpose + avg duration */}
          <div style={statCard}>
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-2xl text-white" style={{background:'linear-gradient(135deg,hsl(262,83%,52%),hsl(262,83%,65%))',boxShadow:'0 6px 18px hsl(262,83%,52%,0.25)'}}><Sparkles size={22}/></div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide">Top Activity</span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Primary Purpose</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight" style={{fontFamily:"'Playfair Display',serif"}}>{topPurpose}</p>
              {avgSessionMins !== null && (
                <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1">
                  <Clock size={10} style={{color:navy}} />
                  Avg session: <span className="font-bold ml-0.5" style={{color:navy}}>{fmtDur(avgSessionMins)}</span>
                </p>
              )}
            </div>
          </div>
          {/* Trend */}
          <div style={statCard}>
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-2xl text-white"
                style={{background:trendPct===null?'linear-gradient(135deg,#64748b,#94a3b8)':trendPct>=0?'linear-gradient(135deg,#059669,#10b981)':'linear-gradient(135deg,#dc2626,#ef4444)',boxShadow:trendPct===null?'0 6px 18px #64748b25':trendPct>=0?'0 6px 18px #05966925':'0 6px 18px #dc262625'}}>
                {trendPct===null?<Minus size={22}/>:trendPct>=0?<TrendingUp size={22}/>:<TrendingDown size={22}/>}
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wide">vs Prior</span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Trend</p>
              <p className="text-3xl sm:text-4xl font-bold text-slate-900" style={{fontFamily:"'Playfair Display',serif"}}>{trendPct===null?'—':`${trendPct>=0?'+':''}${trendPct}%`}</p>
              <p className="text-xs text-slate-400 font-medium mt-1">{prevPeriodLogs.length} visits prior period</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <CompareCard title="Total Attendance" labelA={aLabel} labelB={bLabel} valueA={aTotal} valueB={bTotal} icon={<Users size={12}/>} note={`Combined: ${aTotal+bTotal} visits`}/>
          <CompareCard title="Daily Average" labelA={aLabel} labelB={bLabel} valueA={aAvg} valueB={bAvg} fmt={v=>v.toFixed(1)} icon={<BarChart3 size={12}/>} note={`Over ${totalDays} day${totalDays!==1?'s':''}`}/>
          <div style={statCard}>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest"><TrendingUp size={12}/><span>Peak Day</span></div>
            <div className="grid grid-cols-2 gap-2">
              {([{side:'a',label:aLabel,peak:aPeak,color:COLOR_A},{side:'b',label:bLabel,peak:bPeak,color:COLOR_B}] as const).map(({side,label,peak,color})=>(
                <div key={side} className="text-center p-2 rounded-xl" style={{background:`${color}08`}}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate" style={{color}}>{label}</div>
                  <div className="text-base font-bold text-slate-900" style={{fontFamily:"'Playfair Display',serif"}}>{peak[0]}</div>
                  <div className="text-xs font-bold mt-0.5" style={{color}}>{peak[1]} visits</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">{aPeak[0]===bPeak[0]&&aPeak[0]!=='—'?'Same peak day':'Mismatched peaks'}</p>
          </div>
          <div style={statCard}>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest"><Sparkles size={12}/><span>Usage Alignment</span></div>
            <div className="grid grid-cols-2 gap-2">
              {([{side:'a',label:aLabel,purpose:aTopPurp,color:COLOR_A},{side:'b',label:bLabel,purpose:bTopPurp,color:COLOR_B}] as const).map(({side,label,purpose,color})=>(
                <div key={side} className="text-center p-2 rounded-xl" style={{background:`${color}08`}}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate" style={{color}}>{label}</div>
                  <div className="text-xs font-bold text-slate-900 leading-tight">{purpose}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">{aTopPurp===bTopPurp&&aTopPurp!=='—'?`Both: ${aTopPurp}`:aTopPurp!=='—'&&bTopPurp!=='—'?'Different primary uses':'Top activity comparison'}</p>
          </div>
        </div>
      )}

      {/* ── Attendance chart ── */}
      <div style={card}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <BarChart3 size={18} style={{color:navy}}/>
            <div>
              <h3 className="font-bold text-slate-900 text-lg" style={{fontFamily:"'Playfair Display',serif"}}>Academic Attendance</h3>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mt-0.5">{branchLabel && branchLabel + " · "}{periodLabel}{roleLabel}{statusLabel} · {compareMode?'Compare mode active':'Click a bar to cross-filter'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
            {!compareMode?(
              <><div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{background:navy}}/> Visits</div>
              <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 rounded-full" style={{background:'hsl(10,80%,55%)'}}/> Trend</div>
              <div className="flex items-center gap-1.5"><div className="w-7 h-px border-t-2 border-dashed" style={{borderColor:'#f59e0b'}}/> Avg ({avgLine})</div></>
            ):(
              <><div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{background:COLOR_A}}/> {aLabel}</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{background:COLOR_B}}/> {bLabel}</div></>
            )}
            {focusDay&&<span className="px-2 py-1 rounded-full text-white text-[10px] font-bold" style={{background:navy}}>📍 {focusDay}</span>}
          </div>
        </div>
        <div style={{padding:'16px 16px 8px 4px',height:260}}>
          <ResponsiveContainer width="100%" height="100%">
            {!compareMode?(
              <ComposedChart data={chartData} margin={{top:4,right:8,left:-16,bottom:8}}
                onClick={d=>{if(d?.activeLabel)setFocusDay(p=>p===d.activeLabel?null:d.activeLabel!);}} style={{cursor:'pointer'}}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.07}/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#94a3b8',fontSize:15,fontWeight:700}} dy={6}/>
                <YAxis tickLine={false} axisLine={false} tick={{fill:'#94a3b8',fontSize:15,fontWeight:700}}/>
                <Tooltip content={<ChartTooltip/>} cursor={{fill:'rgba(10,26,77,0.04)',strokeWidth:0}}/>
                {avgLine>0&&<ReferenceLine y={avgLine} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} label={{value:`Avg ${avgLine}`,position:'right',fontSize:11,fontWeight:700,fill:'#f59e0b'}}/>}
                <Bar dataKey="visits" radius={[5,5,0,0]} barSize={36} cursor="pointer">
                  {chartData.map((e,i)=>(
                    <Cell key={i} fill={e.visits>0?BAR_PALETTE[i%BAR_PALETTE.length]:'#e2e8f0'}
                      opacity={focusDay&&e.name!==focusDay?0.2:1}
                      stroke={focusDay&&e.name===focusDay?'rgba(255,255,255,0.6)':'none'} strokeWidth={2}/>
                  ))}
                </Bar>
                <Line type="monotone" dataKey="visits" name="trend" stroke="hsl(10,80%,55%)" strokeWidth={2}
                  dot={{r:3,fill:'hsl(10,80%,55%)',strokeWidth:0}} activeDot={{r:5,strokeWidth:0}}/>
              </ComposedChart>
            ):(
              <ComposedChart data={chartData} margin={{top:4,right:8,left:-16,bottom:8}}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.07}/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#94a3b8',fontSize:15,fontWeight:700}} dy={6}/>
                <YAxis tickLine={false} axisLine={false} tick={{fill:'#94a3b8',fontSize:15,fontWeight:700}}/>
                <Tooltip content={<ChartTooltip/>} cursor={{fill:'rgba(10,26,77,0.03)',strokeWidth:0}}/>
                <Bar dataKey="a" name={aLabel} fill={COLOR_A} radius={[4,4,0,0]} barSize={14}/>
                <Bar dataKey="b" name={bLabel} fill={COLOR_B} radius={[4,4,0,0]} barSize={14}/>
                <Line type="monotone" dataKey="a" name="A trend" stroke={COLOR_A} strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                <Line type="monotone" dataKey="b" name="B trend" stroke={COLOR_B} strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
        <div className="px-5 pb-4 pt-1 flex items-center gap-6 border-t border-slate-50">
          {!compareMode?(
            <><div><p className="font-bold text-slate-900 text-2xl" style={{fontFamily:"'Playfair Display',serif"}}>{totalVisits}</p><p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Total Visits</p></div>
            <div><p className="font-bold text-slate-900 text-2xl" style={{fontFamily:"'Playfair Display',serif"}}>{peakDay.visits}</p><p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Peak Day</p></div>
            {avgSessionMins!==null&&<div><p className="font-bold text-sm" style={{color:navy}}>{fmtDur(avgSessionMins)}</p><p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Avg Duration</p></div>}
            <div className="ml-auto text-right"><p className="font-bold text-sm" style={{color:navy}}>{peakDay.name}</p><p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Busiest</p></div></>
          ):(
            <><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:COLOR_A}}/><span className="font-bold text-slate-900">{aTotal}</span><span className="text-xs text-slate-400">({aLabel})</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:COLOR_B}}/><span className="font-bold text-slate-900">{bTotal}</span><span className="text-xs text-slate-400">({bLabel})</span></div>
            <div className="ml-auto"><span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={bTotal>aTotal?{background:'rgba(5,150,105,0.1)',color:'#059669'}:bTotal<aTotal?{background:'rgba(220,38,38,0.1)',color:'#dc2626'}:{background:'rgba(100,116,139,0.1)',color:'#64748b'}}>
              {bTotal===aTotal?'Tied':`${bTotal>aTotal?'+':''}${bTotal-aTotal} visit gap`}</span></div></>
          )}
        </div>
      </div>

      {/* ── Segmentation charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Department */}
        <div style={card}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <PieIcon size={16} style={{color:navy}}/>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{fontFamily:"'Playfair Display',serif"}}>By Department</h3>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mt-0.5">{compareMode?`${aLabel} vs ${bLabel}`:focusLabel}{roleLabel}{statusLabel}</p>
              </div>
            </div>
          </div>
          <div style={{height:280,padding:'8px'}}>
            {!compareMode?(
              deptBreakdown.length===0?(<div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">No data</div>):(
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={deptBreakdown} cx="50%" cy="44%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" labelLine={false} label={DonutLabel} strokeWidth={0}>
                      {deptBreakdown.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} stroke="none" style={{outline:'none'}}/>)}
                    </Pie>
                    <Tooltip content={<ChartTooltip/>}/>
                    <Legend verticalAlign="bottom" height={60} iconType="circle" wrapperStyle={{fontSize:14,fontWeight:700,paddingTop:4}}/>
                  </PieChart>
                </ResponsiveContainer>
              )
            ):(
              <div className="grid grid-cols-2 h-full">
                {[{data:aDeptBreakdown,label:aLabel,color:COLOR_A},{data:bDeptBreakdown,label:bLabel,color:COLOR_B}].map(({data,label,color},si)=>(
                  <div key={si} className="flex flex-col items-center justify-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{color}}>{label}</p>
                    {data.length===0?<p className="text-xs text-slate-300 italic">No data</p>:(
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart><Pie data={data} cx="50%" cy="46%" innerRadius={36} outerRadius={62} paddingAngle={3} dataKey="value" labelLine={false} strokeWidth={0}>
                          {data.map((_,i)=><Cell key={i} fill={i===0?color:COLORS[(i+si*2)%COLORS.length]} stroke="none" style={{outline:'none'}}/>)}
                        </Pie><Tooltip content={<ChartTooltip/>}/><Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12,fontWeight:700,paddingTop:2}}/></PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* By Purpose */}
        <div style={card}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <BarChart3 size={16} style={{color:navy}}/>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{fontFamily:"'Playfair Display',serif"}}>By Visit Purpose</h3>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mt-0.5">{compareMode?`${aLabel} vs ${bLabel}`:`${focusLabel}${roleLabel}{statusLabel} · sorted by volume`}</p>
              </div>
            </div>
          </div>
          <div style={{height:280,padding:'8px 8px 8px 0'}}>
            {!compareMode?(
              purposeBreakdown.length===0?(<div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">No data</div>):(
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={purposeBreakdown} layout="vertical" margin={{left:16,right:40,top:8,bottom:8}}>
                    <CartesianGrid horizontal={false} strokeOpacity={0.05}/>
                    <XAxis type="number" hide/>
                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize:14,fontWeight:600,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ChartTooltip/>} cursor={false}/>
                    <Bar dataKey="visits" radius={[0,6,6,0]} barSize={30} cursor="pointer" activeBar={false}
                      label={{position:'right',fontSize:12,fontWeight:700,fill:'#64748b',formatter:(v:any)=>v>0?v:''}}>
                      {purposeBreakdown.map((e,i)=><Cell key={`c-${i}`} fill={e.fill||'#64748b'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            ):(
              abPurposeMerged.length===0?(<div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">No data</div>):(
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={abPurposeMerged} layout="vertical" margin={{left:16,right:40,top:8,bottom:8}}>
                    <CartesianGrid horizontal={false} strokeOpacity={0.05}/>
                    <XAxis type="number" hide/>
                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize:14,fontWeight:600,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ChartTooltip/>} cursor={false}/>
                    <Bar dataKey="a" name={aLabel} fill={COLOR_A} radius={[0,4,4,0]} barSize={11} label={{position:'right',fontSize:11,fontWeight:700,fill:COLOR_A,formatter:(v:any)=>v>0?v:''}}/>
                    <Bar dataKey="b" name={bLabel} fill={COLOR_B} radius={[0,4,4,0]} barSize={11} label={{position:'right',fontSize:11,fontWeight:700,fill:COLOR_B,formatter:(v:any)=>v>0?v:''}}/>
                  </BarChart>
                </ResponsiveContainer>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Occupancy heatmap ── */}
      {periodLogs.length > 0 && (
        <div style={card}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl text-white" style={{background:navy}}><BarChart3 size={16}/></div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg" style={{fontFamily:"'Playfair Display',serif"}}>Occupancy heatmap</h3>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mt-0.5">
                {branchLabel && branchLabel + " · "}{periodLabel}{roleLabel}{statusLabel} · visits by day of week and hour
              </p>
            </div>
          </div>
          <div className="p-5">
            <OccupancyHeatmap logs={periodLogs} />
          </div>
        </div>
      )}

    </div>
  );
}