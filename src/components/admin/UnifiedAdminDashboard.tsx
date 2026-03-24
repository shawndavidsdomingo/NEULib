"use client";

import { useState, useEffect, useRef } from 'react';
import { LiveClock } from '@/components/LiveClock';
import { OverviewDashboard } from './OverviewDashboard';
import { UserManagement } from './UserManagement';
import { TemporaryVisitorManagement } from './TemporaryVisitorManagement';
import { LiveFeed } from './LiveFeed';
import { ReportModule } from './ReportModule';
import { AdminAccessManagement } from './AdminAccessManagement';
import { DepartmentManagement } from './DepartmentManagement';
import { CurrentVisitors } from './CurrentVisitors';
import { AuditLogTab } from './AuditLogTab';
import { LogHistory } from './LogHistory';
import { PurposeManagement } from './PurposeManagement';
import { CredentialRequestsTab } from './CredentialRequestsTab';
import { ReportScheduler } from './ReportScheduler';
import { KioskAnnouncements } from './KioskAnnouncements';
import { BranchManagement } from './BranchManagement';
import {
  Users, LayoutDashboard, FileText, LogOut, ShieldCheck,
  Clock, Building2, MapPin, Scan, Menu, X as XIcon,
  ClipboardList, History, BookOpen, Shield, LucideIcon,
  CalendarClock, Megaphone, GitBranch,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserRecord } from '@/lib/firebase-schema';
import { User } from 'firebase/auth';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ── Branch types (inline — avoids circular import) ──────────────────────────
interface BranchRecord {
  id: string; name: string; isDefault: boolean; address?: string; capacity?: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: '🏠 General',
    items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    title: '📊 Monitoring',
    items: [
      { id: 'presence', label: 'Live Presence', icon: MapPin },
      { id: 'history',  label: 'Log History',   icon: History },
    ],
  },
  {
    title: '🗂 Records',
    items: [
      { id: 'users',    label: 'Registry',      icon: Users },
      { id: 'temp',     label: 'Pending',        icon: Clock },
      { id: 'purposes', label: 'Visit Purposes', icon: BookOpen },
      { id: 'requests', label: 'Requests',       icon: ClipboardList },
    ],
  },
  {
    title: '👥 Staff & Organisation',
    items: [
      { id: 'access',      label: 'Staff Access',  icon: ShieldCheck },
      { id: 'departments', label: 'Departments',   icon: Building2 },
    ],
  },
  {
    title: '📑 Reporting & Auditing',
    items: [
      { id: 'reports',   label: 'Reports',          icon: FileText },
      { id: 'schedules', label: 'Report Schedules', icon: CalendarClock },
      { id: 'auditlog',  label: 'Audit Log',        icon: Shield, superAdminOnly: true },
    ],
  },
  {
    title: '⚙ Library Management',
    items: [
      { id: 'announcements', label: 'Announcements',  icon: Megaphone },  // all admins
      { id: 'branches',      label: 'Branches',       icon: GitBranch, superAdminOnly: true },
    ],
  },
];

const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

interface UnifiedAdminDashboardProps {
  suppressBranchPicker?: boolean;
  onSwitchToStudent?: () => void;
  onExit?: () => void;
  adminData?: UserRecord | null;
  user: User | null;
  isSuperAdmin: boolean;
}

const navy     = 'hsl(221,72%,22%)';
const navyGrad = 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,72%,24%))';

const SUPER_ADMIN_EMAIL = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'shawndavidsobremontedomingo@gmail.com').toLowerCase();

export default function UnifiedAdminDashboard({
  onExit, adminData, user, isSuperAdmin: isSuperAdminProp, onSwitchToStudent, suppressBranchPicker,
}: UnifiedAdminDashboardProps) {
  // ── Resolve isSuperAdmin: prop OR role on adminData OR email match ────────
  // This ensures the hardcoded super admin email always gets super admin access
  // even when their Firestore doc has role='admin' or doesn't exist yet.
  const isSuperAdmin = isSuperAdminProp
    || adminData?.role === 'super_admin'
    || (user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL);
  const [activeTab,     setActiveTab]     = useState('overview');
  const [showKioskInfo, setShowKioskInfo] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);

  // ── Branch selector state ─────────────────────────────────────────────────
  const [activeBranchId,  setActiveBranchId]  = useState<string | null>(null);
  const [branchSelected,  setBranchSelected]  = useState(false); // has the admin picked a branch this session?

  const db = useFirestore();

  // Pending visitors badge — admin only
  const pendingQuery = useMemoFirebase(
    () => isSuperAdmin ? query(collection(db, 'users'), where('status', '==', 'pending')) : null,
    [db, isSuperAdmin]
  );
  const { data: pendingUsers } = useCollection<UserRecord>(pendingQuery);
  const pendingCount = pendingUsers?.length || 0;

  // Credential requests badge — admin only
  const credReqRef = useMemoFirebase(
    () => isSuperAdmin
      ? query(collection(db, 'credential_requests'), where('status', 'in', ['pending', 'pending_verification']))
      : null,
    [db, isSuperAdmin]
  );
  const { data: pendingReqs } = useCollection<any>(credReqRef);
  const credReqCount = pendingReqs?.length || 0;

  // Live presence badge — open sessions for today.
  //
  // FIX: The previous query used where('checkOutTimestamp', '==', null) which
  // is unreliable (requires index, fails silently) and also never cleared after
  // the auto-checkout batch runs. We now fetch today's logs once per minute and
  // count those with no checkOutTimestamp client-side — same pattern as the
  // TerminalView auto-close fix.
  const [liveCount, setLiveCount] = useState(0);
  useEffect(() => {
    const fetchLiveCount = async () => {
      try {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const snap = await getDocs(query(
          collection(db, 'library_logs'),
          where('checkInTimestamp', '>=', todayStart.toISOString()),
          where('checkInTimestamp', '<=', todayEnd.toISOString()),
        ));
        const open = snap.docs.filter(d => !d.data().checkOutTimestamp).length;
        setLiveCount(open);
      } catch { /* non-fatal */ }
    };
    fetchLiveCount();
    const interval = setInterval(fetchLiveCount, 60_000);
    return () => clearInterval(interval);
  }, [db]);

  // Branches — readable by all signed-in users
  const branchesRef = useMemoFirebase(() => collection(db, 'branches'), [db]);
  const { data: branches } = useCollection<BranchRecord>(branchesRef);

  // Once branches load, show picker if not yet selected this session
  useEffect(() => {
    if (branches && branches.length > 0 && !branchSelected) {
      // Will trigger the modal — handled in JSX
    }
  }, [branches, branchSelected]);

  // ── Real-time blocked attempt alert ──────────────────────────────────────
  const { toast } = useToast();
  // Only subscribe to blocked_attempts for admin users
  // Guard: only admins should subscribe to sensitive collections
  const isAdminUser = isSuperAdmin || adminData?.role === 'admin' || adminData?.role === 'super_admin';
  const blockedAttemptsRef = useMemoFirebase(
    () => query(collection(db, 'blocked_attempts'), orderBy('timestamp', 'desc'), limit(5)),
    [db]
  );
  const { data: recentBlockedAttempts } = useCollection<any>(isAdminUser ? blockedAttemptsRef : null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const mainRef    = useRef<HTMLElement>(null);   // scroll content to top on tab change
  const navRef     = useRef<HTMLElement>(null);   // preserve sidebar scroll position

  // Scroll content area to top when tab changes (without remounting)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  useEffect(() => {
    if (!recentBlockedAttempts?.length) return;
    recentBlockedAttempts.forEach(attempt => {
      if (!attempt.id || seenIdsRef.current.has(attempt.id)) return;
      seenIdsRef.current.add(attempt.id);
      const ageSeconds = (Date.now() - new Date(attempt.timestamp).getTime()) / 1000;
      if (ageSeconds > 30) return;
      toast({
        title: '⚠ Restricted User Attempt',
        description: `${attempt.studentName || 'Unknown'} attempted entry at ${new Date(attempt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        variant: 'destructive',
      });
    });
  }, [recentBlockedAttempts, toast]);

  const displayName = adminData
    ? [adminData.firstName, adminData.middleName, adminData.lastName].filter(Boolean).join(' ')
    : user?.displayName || (isSuperAdmin ? 'Super Administrator' : 'Library Staff');
  const roleLabel = isSuperAdmin ? 'Super Admin' : 'Library Staff';
  const dept      = adminData?.deptID
    ? `${adminData.deptID}${adminData.program ? ' · ' + adminData.program : ''}`
    : roleLabel;
  const initials  = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  // Filter nav groups — hide superAdminOnly items for non-super-admins
  const navGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => !item.superAdminOnly || isSuperAdmin),
  })).filter(g => g.items.length > 0);

  const allNavItems = ALL_NAV_ITEMS.filter(item => !item.superAdminOnly || isSuperAdmin);

  const currentBranchName = activeBranchId
    ? branches?.find(b => b.id === activeBranchId)?.name ?? 'Branch'
    : 'All Branches';

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-4 sm:space-y-6">
            <OverviewDashboard branchId={activeBranchId} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
              <div className="lg:col-span-2"><LiveFeed branchId={activeBranchId} /></div>
              <div className="lg:col-span-1 flex flex-col gap-4">
                <Card className="school-card overflow-visible">
                  <CardHeader className="px-4 py-3 border-b border-slate-100">
                    <CardTitle className="text-lg font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>
                      Quick Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pb-4">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { icon: Users,    label: 'Registry',      id: 'users',    color: navy },
                        { icon: MapPin,   label: 'Live Presence', id: 'presence', color: '#059669' },
                        { icon: FileText, label: 'Reports',       id: 'reports',  color: '#d97706' },
                        { icon: Clock,    label: 'Pending',       id: 'temp',     color: '#7c3aed' },
                        { icon: Scan,     label: 'Kiosk',         id: 'kiosk',    color: '#64748b' },
                      ] as const).map(item => (
                        <button key={item.id}
                          onClick={() => item.id === 'kiosk' ? setShowKioskInfo(true) : setActiveTab(item.id)}
                          className="relative flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all text-center active:scale-95">
                          <div className="p-2.5 rounded-xl" style={{ background: `${item.color}18`, color: item.color }}>
                            <item.icon size={20} />
                          </div>
                          <span className="font-semibold text-slate-700 text-sm leading-tight">{item.label}</span>
                          {item.id === 'temp' && pendingCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold shadow"
                              style={{ background: 'hsl(43,85%,55%)', color: 'hsl(221,72%,15%)' }}>
                              {pendingCount}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        );
      case 'presence':     return <CurrentVisitors branchId={activeBranchId} />;
      case 'history':      return <LogHistory branchId={activeBranchId} />;
      case 'users':        return <UserManagement isSuperAdmin={isSuperAdmin} />;
      case 'temp':         return <TemporaryVisitorManagement isSuperAdmin={isSuperAdmin} />;
      case 'reports':      return <ReportModule isSuperAdmin={isSuperAdmin} branchId={activeBranchId} />;
      case 'schedules':    return <ReportScheduler isSuperAdmin={true} />;
      case 'purposes':     return <PurposeManagement />;
      case 'requests':     return <CredentialRequestsTab />;
      case 'access':       return <AdminAccessManagement isSuperAdmin={isSuperAdmin} />;
      case 'departments':  return <DepartmentManagement />;
      case 'auditlog':     return <AuditLogTab />;
      case 'announcements':return <KioskAnnouncements isSuperAdmin={true} />;
      case 'branches':     return isSuperAdmin ? <BranchManagement /> : null;
      default: return null;
    }
  };

  // ── Shared sidebar nav renderer ───────────────────────────────────────────
  const renderNav = (onItemClick?: () => void) => (
    <nav ref={navRef} className="flex-1 px-3 py-3 overflow-y-auto space-y-4"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}>
      {navGroups.map(group => (
        <div key={group.title}>
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-extrabold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.40)', letterSpacing: '0.10em', marginTop: 8 }}>
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map(item => (
              <button key={item.id}
                onClick={() => { setActiveTab(item.id); onItemClick?.(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
                style={{
                  background:  activeTab === item.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                  color:       activeTab === item.id ? 'white' : 'rgba(255,255,255,0.45)',
                  borderLeft:  activeTab === item.id ? '3px solid hsl(43,85%,55%)' : '3px solid transparent',
                }}
                onMouseEnter={e => {
                  if (activeTab !== item.id) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)';
                  }
                }}
                onMouseLeave={e => {
                  if (activeTab !== item.id) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)';
                  }
                }}>
                <item.icon size={17} />
                <span className="flex-1">{item.label}</span>
                {/* Live presence badge — green */}
                {item.id === 'presence' && liveCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold"
                    style={{ background: 'hsl(142,70%,40%)', color: 'white' }}>
                    {liveCount}
                  </span>
                )}
                {/* Pending visitors badge */}
                {item.id === 'temp' && pendingCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold"
                    style={{ background: 'hsl(43,85%,55%)', color: 'hsl(221,72%,15%)' }}>
                    {pendingCount}
                  </span>
                )}
                {/* Credential requests badge */}
                {item.id === 'requests' && credReqCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold"
                    style={{ background: '#ef4444', color: 'white' }}>
                    {credReqCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  // ── Bottom actions (sign out and switch to student only, branch switcher removed) ──
  const BottomActions = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="p-4 border-t border-white/10 space-y-2">
      {onSwitchToStudent && (
        <button onClick={() => { onItemClick?.(); setConfirmSwitch(true); }}
          className="w-full flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.9)', color: navy }}>Admin</span>
          <span className="text-white/30">|</span>
          <span className="text-white/50 text-[11px] font-bold">Student</span>
        </button>
      )}
      <button onClick={() => { onItemClick?.(); onExit?.(); }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left"
        style={{ color: 'rgba(255,255,255,0.35)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
        <LogOut size={17} /> Sign Out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ══ SIDEBAR (desktop) ══ */}
      <aside className="hidden lg:flex w-64 xl:w-72 flex-col flex-shrink-0 sticky top-0 h-screen"
        style={{ background: navyGrad, borderRight: '1px solid rgba(255,255,255,0.08)', boxShadow: '4px 0 32px rgba(0,0,0,0.2)' }}>

        {/* Logo */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0">
            <img src="/neu_logo.png" alt="NEU" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          </div>
          <div>
            <p className="text-white font-bold text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>NEU Library</p>
            <p className="text-white/40 font-medium" style={{ fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {isSuperAdmin ? 'Super Admin' : 'Staff Console'}
            </p>
          </div>
        </div>

        {/* User card + branch switcher */}
        <div className="p-5 border-b border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,48%))', color: 'hsl(221,72%,12%)' }}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight truncate">{displayName}</p>
              <p className="text-white/45 font-medium truncate" style={{ fontSize: '0.82rem' }}>{dept}</p>
            </div>
          </div>

          {/* Branch switcher — global context selector, lives near top */}
          {branches && branches.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <GitBranch size={12} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
              <Select
                value={activeBranchId ?? 'all'}
                onValueChange={v => { setActiveBranchId(v === 'all' ? null : v); setBranchSelected(true); }}>
                <SelectTrigger className="flex-1 h-7 text-xs font-bold rounded-lg border-0"
                  style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.75)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {branches.length > 1 && (
                    <SelectItem value="all" className="text-xs font-semibold">All Branches</SelectItem>
                  )}
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id} className="text-xs font-semibold">
                      {b.name}{b.isDefault ? ' ★' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {renderNav()}
        <BottomActions />
      </aside>

      {/* ══ MAIN ══ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="sticky top-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between border-b gap-3"
          style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(20px)', borderColor: 'rgba(10,26,77,0.08)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl transition-all active:scale-95"
              style={{ background: `${navy}0d`, color: navy }}
              aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                {allNavItems.find(n => n.id === activeTab)?.label || 'Overview'}
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5 hidden sm:block">
                {dept}
                {branches && branches.length > 0 && (
                  <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(10,26,77,0.08)', color: 'hsl(221,72%,22%)' }}>
                    {activeBranchId ? (branches.find(b => b.id === activeBranchId)?.name ?? 'Branch') : '🌐 All Branches'}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Branch selector in top bar (only if branches exist) */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {(branches?.length ?? 0) > 0 && (
              <div className="hidden sm:flex items-center gap-1.5">
                <GitBranch size={13} style={{ color: navy }} />
                <Select
                  value={activeBranchId ?? 'all'}
                  onValueChange={v => { setActiveBranchId(v === 'all' ? null : v); setBranchSelected(true); }}>
                  <SelectTrigger className="h-8 min-w-[130px] bg-white rounded-xl border-slate-200 text-xs font-bold"
                    style={{ color: navy }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {(branches?.length ?? 0) > 1 && (
                      <SelectItem value="all" className="text-xs font-semibold">All Branches</SelectItem>
                    )}
                    {(branches ?? []).map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-xs font-semibold">
                        {b.name}{b.isDefault ? ' ★' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <LiveClock variant="dark" className="hidden sm:flex" />
          </div>
        </div>

        {/* ── MOBILE DRAWER ── */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[60] lg:hidden"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', animation: 'overlayIn 0.25s ease-out' }}
              onClick={() => setMenuOpen(false)} />
            <div className="fixed top-0 left-0 bottom-0 z-[70] lg:hidden flex flex-col w-72"
              style={{ background: navyGrad, boxShadow: '4px 0 32px rgba(0,0,0,0.35)', paddingBottom: 'env(safe-area-inset-bottom,0px)', animation: 'drawerIn 0.3s cubic-bezier(0.32,0.72,0,1)' }}>
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,hsl(43,85%,55%),hsl(38,90%,48%))', color: 'hsl(221,72%,12%)' }}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm leading-tight truncate max-w-[150px]">{displayName}</p>
                    <p className="text-white/45 font-medium truncate max-w-[150px]" style={{ fontSize: '0.75rem' }}>{dept}</p>
                  </div>
                </div>
                <button onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 transition-all text-white/50 hover:text-white flex-shrink-0">
                  <XIcon size={18} />
                </button>
              </div>

              {/* Mobile drawer branch switcher */}
              {branches && branches.length > 0 && (
                <div className="px-5 py-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <GitBranch size={12} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                    <Select
                      value={activeBranchId ?? 'all'}
                      onValueChange={v => { setActiveBranchId(v === 'all' ? null : v); setBranchSelected(true); setMenuOpen(false); }}>
                      <SelectTrigger className="flex-1 h-7 text-xs font-bold rounded-lg border-0"
                        style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.75)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {branches.length > 1 && (
                          <SelectItem value="all" className="text-xs font-semibold">All Branches</SelectItem>
                        )}
                        {branches.map(b => (
                          <SelectItem key={b.id} value={b.id} className="text-xs font-semibold">
                            {b.name}{b.isDefault ? ' ★' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {renderNav(() => setMenuOpen(false))}
              <BottomActions onItemClick={() => setMenuOpen(false)} />
            </div>
          </>
        )}

        {/* Page content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-4 sm:space-y-5"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(221,72%,70%) transparent' }}>
          <div className="animate-in fade-in duration-200">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Kiosk modal */}
      {showKioskInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}><Scan size={20} /></div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Enter Visitor Kiosk</h3>
                <p className="text-slate-400 text-sm">Switch to kiosk terminal</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              Use the kiosk to <strong>check yourself in/out</strong>. Enter your <strong>Staff ID</strong> at the terminal.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowKioskInfo(false)}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={() => { setShowKioskInfo(false); onExit?.(); }}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2"
                style={{ background: navy }}>
                <Scan size={15} /> Go to Kiosk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Switch */}
      {confirmSwitch && (
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
                <Users size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Go to Student Kiosk?</h3>
                <p className="text-slate-400 text-sm">You will be signed out of admin and redirected.</p>
              </div>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              You will need to <strong>sign in again</strong> with your institutional account at the kiosk to check in as a student.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmSwitch(false)}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Stay in Admin
              </button>
              <button onClick={() => { setConfirmSwitch(false); onExit?.(); }}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: navy }}>
                Go to Kiosk
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes drawerIn {
          from { transform: translateX(-100%); opacity: 0.6; }
          to   { transform: translateX(0);     opacity: 1;   }
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes branchIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>

      {/* ══ BRANCH PICKER MODAL ══ */}
      {branches && branches.length > 0 && !branchSelected && !suppressBranchPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'branchIn 0.35s cubic-bezier(0.32,0.72,0,1)' }}>

            {/* Header */}
            <div className="px-7 pt-7 pb-5 text-center"
              style={{ background: `linear-gradient(160deg,hsl(225,70%,42%),${navy})` }}>
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                <GitBranch size={22} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
                Select Branch
              </h3>
              <p className="text-white/60 text-sm font-medium mt-1">
                Choose which library branch to monitor
              </p>
            </div>

            {/* Branch options */}
            <div className="p-5 space-y-2.5">
              {/* All Branches option */}
              {branches.length > 1 && (
                <button
                  onClick={() => { setActiveBranchId(null); setBranchSelected(true); }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] hover:border-blue-200 hover:bg-blue-50/40"
                  style={{ borderColor: '#e2e8f0', background: '#fafafa' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(10,26,77,0.07)' }}>
                    <GitBranch size={18} style={{ color: navy }} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">All Branches</p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">View data across all locations</p>
                  </div>
                </button>
              )}

              {/* Individual branches */}
              {branches.map(b => (
                <button key={b.id}
                  onClick={() => { setActiveBranchId(b.id); setBranchSelected(true); }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]"
                  style={{ borderColor: b.isDefault ? `${navy}30` : '#e2e8f0', background: b.isDefault ? `${navy}05` : '#fafafa' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = navy + '40';
                    (e.currentTarget as HTMLElement).style.background = `${navy}08`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = b.isDefault ? `${navy}30` : '#e2e8f0';
                    (e.currentTarget as HTMLElement).style.background = b.isDefault ? `${navy}05` : '#fafafa';
                  }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                    style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,35%))` }}>
                    {b.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 text-sm">{b.name}</p>
                      {b.isDefault && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'hsl(43,85%,52%,0.15)', color: 'hsl(38,90%,35%)' }}>
                          ★ Default
                        </span>
                      )}
                    </div>
                    {b.address && <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">{b.address}</p>}
                  </div>
                </button>
              ))}

              <p className="text-center text-xs text-slate-400 pt-1 font-medium">
                You can change this anytime from the top bar
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}