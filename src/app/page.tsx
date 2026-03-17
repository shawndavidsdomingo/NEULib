"use client";

/**
 * page.tsx — Main router
 * 
 * All users now live in /users collection.
 * Admin login: Google → match by email field where role = 'admin' | 'super_admin'
 * Student login: Google → match by email field where role = 'student'
 * Visitor: auto-register in /users with role = 'visitor', status = 'pending'
 */

import { useState, useEffect } from 'react';
import TerminalView from '@/components/terminal/TerminalView';
import AdminDashboard from '@/components/admin/AdminDashboard';
import StudentDashboard from '@/components/student/StudentDashboard';
import VisitorDashboard from '@/components/student/VisitorDashboard';
import { ShieldCheck, UserCheck, Loader2, UserCircle, ArrowRight, Radio, X } from 'lucide-react';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, limit } from 'firebase/firestore';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { UserRecord } from '@/lib/firebase-schema';

type AppView = 'selection' | 'terminal' | 'admin' | 'student' | 'visitor';

// Roles that can switch between admin and student views without re-auth
const SWITCHABLE_ROLES: string[] = ['admin', 'super_admin'];

const SUPER_ADMIN_EMAIL = "shawndavidsobremontedomingo@gmail.com";

export default function Home() {
  const [view, setViewRaw]                            = useState<AppView>('selection');
  const [resolvedUser, setResolvedUser]               = useState<UserRecord | null>(null);
  const [hydrated, setHydrated]                       = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen]       = useState(false);
  const [isAuthenticating, setIsAuthenticating]       = useState(false);
  const [notRegisteredEmail, setNotRegisteredEmail]   = useState<string | null>(null);
  const [wrongDomainEmail,   setWrongDomainEmail]    = useState<string | null>(null);

  const { user, isUserLoading } = useUser();
  const auth  = useAuth();
  const db    = useFirestore();
  const { toast } = useToast();

  const setView = (v: AppView) => {
    setViewRaw(v);
    if (v === 'selection' || v === 'terminal') {
      sessionStorage.removeItem('neu_view');
      sessionStorage.removeItem('neu_user_email');
      sessionStorage.removeItem('neu_user_role');
    } else {
      sessionStorage.setItem('neu_view', v);
    }
  };

  // Persist resolvedUser role to session so reload works
  const setResolvedUserAndSave = (u: UserRecord | null) => {
    setResolvedUser(u);
    if (u) {
      sessionStorage.setItem('neu_user_email', u.email || '');
      sessionStorage.setItem('neu_user_role', u.role || '');
    }
  };

  useEffect(() => {
    const savedView  = sessionStorage.getItem('neu_view') as AppView | null;
    const savedEmail = sessionStorage.getItem('neu_user_email');
    const savedRole  = sessionStorage.getItem('neu_user_role') as UserRecord['role'] | null;
    if (savedView) setViewRaw(savedView);
    // Restore minimal resolvedUser so dashboards don't show "Access Restricted"
    // The full record will be re-fetched once Firebase auth resolves
    if (savedEmail && savedRole && savedView === 'admin') {
      setResolvedUser({ id: '', email: savedEmail, role: savedRole, firstName: '', lastName: '', status: 'active' } as UserRecord);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!isUserLoading && !user && (view === 'student' || view === 'visitor' || view === 'admin')) {
      setView('selection');
    }
  }, [user, isUserLoading, hydrated]);

  // ── Resolve user from /users by email ─────────────────────────────────────
  async function resolveUserByEmail(email: string): Promise<UserRecord | null> {
    const snap = await getDocs(
      query(collection(db, 'users'), where('email', '==', email), limit(1))
    );
    if (!snap.empty) return snap.docs[0].data() as UserRecord;
    return null;
  }

  // ── Google login ───────────────────────────────────────────────────────────
  const handleGoogleLogin = async (targetView: 'admin' | 'student') => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result       = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      const email        = firebaseUser.email!;

      const userRecord = await resolveUserByEmail(email);

      // ── Admin path ────────────────────────────────────────────────────
      if (targetView === 'admin') {
        const isWhitelisted = email.toLowerCase() === SUPER_ADMIN_EMAIL;

        if (userRecord && (userRecord.role === 'admin' || userRecord.role === 'super_admin')) {
          setResolvedUserAndSave(userRecord);
          setView('admin');
          setIsAdminLoginOpen(false);
          return;
        }
        if (isWhitelisted) {
          setView('admin');
          setIsAdminLoginOpen(false);
          return;
        }
        await signOut(auth);
        setNotRegisteredEmail(firebaseUser.email || '');
        setIsAdminLoginOpen(false);
        return;
      }

      // ── Student path ──────────────────────────────────────────────────
      // Admins can also access student portal — save role so switch button appears
      if (userRecord && (userRecord.role === 'admin' || userRecord.role === 'super_admin')) {
        setResolvedUserAndSave(userRecord);
        setView('student');
        return;
      }

      // Allow super admin email even outside the org domain
      if (!email.endsWith('@neu.edu.ph') && email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
        await signOut(auth);
        setWrongDomainEmail(email);
        return;
      }

      if (userRecord && userRecord.role === 'student') {
        setResolvedUser(userRecord);
        setView('student');
        return;
      }

      if (userRecord && userRecord.role === 'visitor') {
        setResolvedUser(userRecord);
        setView('visitor');
        return;
      }

      // Brand new user — route to VisitorDashboard which handles registration.
      // Pass basic info via state; VisitorDashboard creates the /users doc
      // only after the student enters their real Student ID.
      // This prevents TEMP- ghost docs from showing up in the pending list.
      const nameParts = (firebaseUser.displayName || '').trim().split(' ');
      const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      const firstName = nameParts.slice(0, nameParts.length > 1 ? -1 : 1).join(' ');
      setResolvedUser({
        id: '', firstName, middleName: '', lastName,
        email, role: 'visitor', status: 'pending',
      } as UserRecord);
      setView('visitor');

    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        toast({ title: "Authentication Failed", description: err?.message || "Please try again.", variant: "destructive" });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleExit = () => { setView('selection'); setResolvedUser(null); };

  // Helper: is the resolved user an admin/super_admin?
  const resolvedIsAdmin = !!(resolvedUser && (resolvedUser.role === 'admin' || resolvedUser.role === 'super_admin'));

  if (view !== 'selection') {
    if (view === 'terminal') return <TerminalView onComplete={handleExit} />;
    if (view === 'admin')    return <AdminDashboard onExit={handleExit} resolvedUser={resolvedUser} onSwitchToStudent={() => setView('student')} />;
    if (view === 'visitor')  return <VisitorDashboard onExit={handleExit} />;
    // Only pass onSwitchToAdmin when the logged-in user is actually an admin/super_admin
    return (
      <StudentDashboard
        onExit={handleExit}
        resolvedUser={resolvedUser}
        onSwitchToAdmin={resolvedIsAdmin ? () => setView('admin') : undefined}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <header className="relative z-10 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="neu-seal flex-shrink-0 overflow-hidden" style={{ width: 36, height: 36, padding: 0 }}>
            <img src="/neu_logo.png" alt="NEU" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>New Era University</p>
            <p className="text-white/50 font-medium" style={{ fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Library Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}>
          <div className="live-dot" style={{ width: 6, height: 6 }} />
          <span className="text-white/70 font-semibold" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Online</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-4">
        <div className="w-full max-w-4xl text-center space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="neu-seal overflow-hidden" style={{ width: 120, height: 120, padding: 0 }}>
              <img src="/neu_logo.png" alt="NEU" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            </div>
            <div className="space-y-2">
              <h1 className="hero-title text-3xl sm:text-5xl md:text-6xl">NEU Library Portal</h1>
              <p className="hero-subtitle" style={{ letterSpacing: '0.25em', fontSize: '0.6rem' }}>Institutional Access & Presence Management</p>
              <div className="flex items-center justify-center gap-3 pt-1">
                <div className="h-px w-10" style={{ background: 'linear-gradient(90deg,transparent,rgba(200,160,40,0.5))' }} />
                <span className="text-white/40 text-xs">✦</span>
                <div className="h-px w-10" style={{ background: 'linear-gradient(90deg,rgba(200,160,40,0.5),transparent)' }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button onClick={() => setView('terminal')} className="kiosk-button">
              <div className="kiosk-icon-wrapper"><UserCheck size={30} /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Visitor Kiosk</h2>
                <p className="text-slate-400 mt-1 font-semibold text-sm">Check-in / Check-out</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,26,77,0.07)', color: 'hsl(221,72%,22%)' }}>
                <Radio size={9} className="animate-pulse" /> RFID / ID Scan
              </div>
            </button>

            <button onClick={() => handleGoogleLogin('student')} className="kiosk-button" disabled={isAuthenticating}>
              <div className="kiosk-icon-wrapper">
                {isAuthenticating ? <Loader2 size={30} className="animate-spin" /> : <UserCircle size={30} />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Student Portal</h2>
                <p className="text-slate-400 mt-1 font-semibold text-sm">Attendance & Analytics</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,26,77,0.07)', color: 'hsl(221,72%,22%)' }}>
                @neu.edu.ph Login
              </div>
            </button>

            <button className="kiosk-button" onClick={() => setIsAdminLoginOpen(true)}>
              <div className="kiosk-icon-wrapper"><ShieldCheck size={30} /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Playfair Display',serif" }}>Staff Console</h2>
                <p className="text-slate-400 mt-1 font-semibold text-sm">Administrative Access</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,26,77,0.07)', color: 'hsl(221,72%,22%)' }}>
                <ArrowRight size={9} /> Staff Login
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── Wrong domain popup ── */}
      {wrongDomainEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5 text-center animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center" style={{ fontSize: "2.5rem" }}>
              {"😔"}
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Sorry!
              </h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                <span className="font-bold font-mono text-slate-700">{wrongDomainEmail}</span> is not an institutional account.
              </p>
              <p className="text-slate-400 text-sm">
                Please sign in with your <span className="font-bold text-primary">@neu.edu.ph</span> Google account to access the Student Portal.
              </p>
            </div>
            <button
              onClick={() => setWrongDomainEmail(null)}
              className="w-full h-12 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Not Registered as Staff card ── */}
      {notRegisteredEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(43,85%,52%,0.12)' }}>
              <ShieldCheck size={32} style={{ color: 'hsl(43,85%,40%)' }} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>Not Registered as Staff</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                <span className="font-bold font-mono text-slate-800">{notRegisteredEmail}</span> is not in the Staff Registry.
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-left space-y-1.5">
              <p className="text-sm font-bold text-blue-800">To get access:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside font-medium">
                <li>Contact a <strong>Super Admin</strong></li>
                <li>Ask them to register your email in the <strong>Staff Access Registry</strong></li>
                <li>Return and sign in again</li>
              </ol>
            </div>
            <button onClick={() => setNotRegisteredEmail(null)}
              className="w-full h-12 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
              <ArrowRight size={15} className="rotate-180" /> Back to Portal
            </button>
          </div>
        </div>
      )}

      <footer className="relative z-10 text-center py-4 px-4">
        <p className="text-white/30 text-xs">© {new Date().getFullYear()} New Era University Library · No. 9 Central Avenue, Quezon City</p>
      </footer>

      <Dialog open={isAdminLoginOpen} onOpenChange={setIsAdminLoginOpen}>
        <DialogContent className="border-none shadow-2xl p-0 overflow-hidden [&>button]:hidden" style={{ borderRadius: '1.25rem', width: 'calc(100vw - 2rem)', maxWidth: '420px' }}>
          <div className="p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg,hsl(221,72%,18%),hsl(221,60%,30%))' }}>
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <button onClick={() => setIsAdminLoginOpen(false)} className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 hover:bg-white/20" style={{ background: 'rgba(255,255,255,0.12)' }} aria-label="Close">
              <X size={15} className="text-white" />
            </button>
            <div className="relative z-10 flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }}><ShieldCheck size={22} className="text-white" /></div>
              <div>
                <DialogTitle className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>Staff Access</DialogTitle>
                <DialogDescription className="text-white/55 font-medium" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Authorized Personnel Only</DialogDescription>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5 bg-white">
            <div className="text-center space-y-1 pb-2">
              <p className="text-slate-600 text-sm font-medium leading-relaxed">Sign in with your institutional Google account to access the Staff Console.</p>
              <p className="text-[10px] text-slate-400">Only registered staff members will be granted access.</p>
            </div>
            <button
              onClick={() => handleGoogleLogin('admin')}
              disabled={isAuthenticating}
              className="w-full h-14 rounded-xl border-2 border-slate-200 font-bold text-base text-slate-700 flex items-center justify-center gap-3 active:scale-95 transition-all hover:border-primary/30 hover:bg-slate-50 disabled:opacity-60"
            >
              {isAuthenticating
                ? <Loader2 size={20} className="animate-spin text-primary" />
                : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
              }
              {isAuthenticating ? 'Signing in...' : 'Sign in with Google'}
            </button>
            <p className="text-center text-xs text-slate-400">Access is monitored and logged for security.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}