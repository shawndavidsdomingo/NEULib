"use client";

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Loader2, ShieldAlert, LogOut, GraduationCap, ArrowLeft, Ban } from 'lucide-react';
import { useUser, useDoc, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, where, limit, getDocs, doc } from 'firebase/firestore';
import { UserRecord } from '@/lib/firebase-schema';
import UnifiedAdminDashboard from './UnifiedAdminDashboard';

const SUPER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || "shawndavidsobremontedomingo@gmail.com";

interface AdminDashboardProps {
  onExit?: () => void;
  resolvedUser?: UserRecord | null;
  onSwitchToStudent?: () => void;
}

export default function AdminDashboard({ onExit, resolvedUser, onSwitchToStudent }: AdminDashboardProps) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  // Subscribe live to the user record — detects role/status changes in real time
  const userDocRef = useMemoFirebase(() => {
    if (!db || !resolvedUser?.id) return null;
    return doc(db, 'users', resolvedUser.id);
  }, [db, resolvedUser?.id]);

  const { data: liveUser, isLoading: isDocLoading } = useDoc<UserRecord>(userDocRef);

  // Re-hydrate on reload when resolvedUser.id is empty (e.g. sessionStorage stub)
  const [rehydratedUser, setRehydratedUser] = useState<UserRecord | null>(null);
  useEffect(() => {
    if (!user?.email || (resolvedUser?.id && resolvedUser.id !== '') || !db) return;
    getDocs(query(collection(db, 'users'), where('email', '==', user.email), limit(1)))
      .then(snap => { if (!snap.empty) setRehydratedUser(snap.docs[0].data() as UserRecord); })
      .catch(() => {});
  }, [user?.email, resolvedUser?.id, db]);

  const activeUser = liveUser ?? rehydratedUser ?? resolvedUser ?? null;
  const isLoading  = isUserLoading || (!!resolvedUser?.id && isDocLoading);

  // ── Real-time block detection ─────────────────────────────────────────────
  // If the admin was previously active and their status is now 'blocked', show the blocked popup
  const [wasAdminBefore, setWasAdminBefore] = useState(false);
  const [showBlockedPopup, setShowBlockedPopup] = useState(false);

  useEffect(() => {
    if (activeUser?.role === 'admin' || activeUser?.role === 'super_admin') {
      setWasAdminBefore(true);
    }
  }, [activeUser?.role]);

  useEffect(() => {
    if (wasAdminBefore && activeUser?.status === 'blocked') {
      setShowBlockedPopup(true);
    }
  }, [wasAdminBefore, activeUser?.status]);

  const handleBlockedConfirm = useCallback(() => {
    setShowBlockedPopup(false);
    onExit?.();
  }, [onExit]);

  // ── Access checks ─────────────────────────────────────────────────────────
  const isSuperAdmin = useMemo(() => {
    if (isLoading) return false;
    if (user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
    return activeUser?.role === 'super_admin';
  }, [isLoading, user, activeUser]);

  const hasAdminAccess = useMemo(() => {
    if (isLoading) return true;
    if (activeUser?.status === 'blocked') return false;
    if (activeUser?.role === 'admin' || activeUser?.role === 'super_admin') return true;
    if (user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
    return false;
  }, [isLoading, activeUser, user]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-6">
          <div className="p-8 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Loader2 className="w-16 h-16 text-white animate-spin" />
          </div>
          <p className="text-white/70 font-bold text-sm tracking-widest uppercase animate-pulse">
            Verifying Identity...
          </p>
        </div>
      </div>
    );
  }

  // ── Blocked — tried to enter admin dashboard ──────────────────────────────
  if (!hasAdminAccess && activeUser?.status === 'blocked') {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="max-w-md w-full text-center p-10 space-y-8 rounded-3xl shadow-2xl"
            style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(226,232,240,0.8)' }}>
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <Ban size={40} className="text-red-500" />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Admin Access Blocked
              </h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Your administrator account has been blocked. You can still use the library kiosk as a regular visitor.
              </p>
              <p className="text-xs font-bold text-red-400 uppercase tracking-widest">
                Contact a Super Administrator to resolve this.
              </p>
            </div>
            <button onClick={onExit}
              className="w-full h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
              <ArrowLeft size={16} /> Return to Kiosk
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── No access — not an admin at all ──────────────────────────────────────
  if (!hasAdminAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="max-w-md w-full text-center p-10 space-y-8 rounded-3xl shadow-2xl"
          style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(226,232,240,0.8)' }}>
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(239,68,68,0.1)' }}>
            <ShieldAlert size={40} className="text-red-500" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              Access Restricted
            </h2>
            <p className="text-slate-500 text-sm font-semibold">
              {user?.email || '(unknown)'}
            </p>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              Your account is not registered in the NEU Library Staff Registry.
            </p>
            <div className="p-4 rounded-xl text-left text-xs font-medium text-amber-700"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
              Contact a Super Administrator to be added to the Staff Registry.
            </div>
          </div>
          <button onClick={onExit}
            className="w-full h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
            <ArrowLeft size={16} /> Return to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Blocked while active — popup overlay ─────────────────────────────────
  return (
    <>
      <UnifiedAdminDashboard
        onExit={onExit}
        adminData={activeUser}
        user={user}
        isSuperAdmin={isSuperAdmin}
        onSwitchToStudent={onSwitchToStudent}
      />

      {/* Real-time blocked popup — shown when an active admin gets blocked */}
      {showBlockedPopup && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'scaleIn 0.3s ease-out' }}>
            <div className="px-7 py-8 text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Ban size={32} className="text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Sorry, you have been BLOCKED as an admin.
                </h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Your administrator access has been revoked. Contact the Super Administrator for assistance.
                </p>
              </div>
              <button onClick={handleBlockedConfirm}
                className="w-full h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                Understood — Go to Kiosk
              </button>
            </div>
          </div>
          <style>{`@keyframes scaleIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }`}</style>
        </div>
      )}
    </>
  );
}