"use client";

import { useMemo, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ShieldAlert, LogOut, GraduationCap } from 'lucide-react';
import { useUser, useDoc, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, where, limit, getDocs, doc } from 'firebase/firestore';
import { UserRecord } from '@/lib/firebase-schema';
import SuperAdminDashboard from './SuperAdminDashboard';
import StaffDashboard from './StaffDashboard';

const SUPER_ADMIN_EMAIL = "shawndavidsobremontedomingo@gmail.com";

interface AdminDashboardProps {
  onExit?: () => void;
  resolvedUser?: UserRecord | null;
  onSwitchToStudent?: () => void;
}

export default function AdminDashboard({ onExit, resolvedUser, onSwitchToStudent }: AdminDashboardProps) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  // Subscribe live to the user's record so role/status changes reflect immediately
  // If resolvedUser was restored from sessionStorage (id=''), look up by email instead
  const userDocRef = useMemoFirebase(() => {
    if (!db) return null;
    if (resolvedUser?.id) return doc(db, 'users', resolvedUser.id);
    return null; // will be re-resolved via email below
  }, [db, resolvedUser?.id]);

  const { data: liveUser, isLoading: isDocLoading } = useDoc<UserRecord>(userDocRef);
  // On reload, resolvedUser may be a minimal stub (id=''). Re-resolve by email from auth.
  const [rehydratedUser, setRehydratedUser] = useState<UserRecord | null>(null);
  useEffect(() => {
    if (!user?.email || (resolvedUser?.id && resolvedUser.id !== '') || !db) return;
    import('firebase/firestore').then(({ getDocs, query, collection, where, limit }) => {
      getDocs(query(collection(db, 'users'), where('email', '==', user.email), limit(1)))
        .then(snap => { if (!snap.empty) setRehydratedUser(snap.docs[0].data() as UserRecord); })
        .catch(() => {});
    });
  }, [user?.email, resolvedUser?.id, db]);
  const activeUser = liveUser ?? rehydratedUser ?? resolvedUser ?? null;

  const isLoading = isUserLoading || (!!resolvedUser?.id && isDocLoading);

  const isSuperAdmin = useMemo(() => {
    if (isLoading) return false;
    if (user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return true;
    return activeUser?.role === 'super_admin';
  }, [isLoading, user, activeUser]);

  const hasAdminAccess = useMemo(() => {
    if (isLoading) return true;
    if (activeUser?.role === 'admin' || activeUser?.role === 'super_admin') return true;
    if (user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return true;
    return false;
  }, [isLoading, activeUser, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-6">
          <div className="p-8 glass-panel rounded-full">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          </div>
          <p className="text-slate-500 font-bold text-sm tracking-widest uppercase animate-pulse">Verifying Identity...</p>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-xl w-full text-center p-14 space-y-10 bg-white/70 backdrop-blur-3xl rounded-[4rem] shadow-2xl border-white/40 border">
          <div className="flex flex-col items-center gap-8">
            <div className="w-28 h-28 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center text-red-600">
              <ShieldAlert size={64} strokeWidth={1.5} />
            </div>
            <div className="space-y-4">
              <h2 className="text-5xl font-bold font-headline text-slate-900">Access Restricted</h2>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-[0.4em]">Unauthorized Entry Logged</p>
            </div>
          </div>
          <div className="p-10 bg-white/40 rounded-[2.5rem] border border-white/60 text-left space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white rounded-2xl shadow-sm"><GraduationCap size={22} className="text-primary" /></div>
              <div>
                <p className="text-slate-700 font-medium">Email: <span className="font-bold font-mono">{user?.email || '(unknown)'}</span></p>
                <p className="text-slate-500 text-sm mt-1">Not recognized in the <strong>NEU Library Staff Registry</strong>.</p>
              </div>
            </div>
            <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 flex gap-3">
              <div className="w-2 bg-amber-400 rounded-full" />
              <p className="text-xs font-medium text-amber-700">Contact a Super Admin to register your email in the Staff Access Registry.</p>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Button className="w-full gap-3 rounded-[2rem] font-bold text-xl" onClick={onExit}><ArrowLeft size={24} /> Return to Home</Button>
            <Button variant="ghost" className="text-slate-400 font-bold uppercase tracking-widest text-[11px] gap-2" onClick={onExit}><LogOut size={16} /> Sign Out</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (isSuperAdmin) return <SuperAdminDashboard onExit={onExit} adminData={activeUser as any} user={user} onSwitchToStudent={onSwitchToStudent} />;
  return <StaffDashboard onExit={onExit} adminData={activeUser as any} user={user} onSwitchToStudent={onSwitchToStudent} />;
}