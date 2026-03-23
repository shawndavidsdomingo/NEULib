"use client";

import { useMemo } from 'react';
import { StudentAvatar } from '@/components/ui/StudentAvatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, parseISO, startOfDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Loader2, GitBranch } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { LibraryLogRecord, DEPARTMENTS } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';

export function LiveFeed({ branchId }: { branchId?: string | null }) {
  const db = useFirestore();

  // Branch name lookup
  const branchesRef = useMemoFirebase(() => collection(db, 'branches'), [db]);
  const { data: allBranches } = useCollection<{ id: string; name: string }>(branchesRef);
  const branchNameMap = useMemo(
    () => Object.fromEntries((allBranches || []).map(b => [b.id, b.name])),
    [allBranches]
  );

  const todayStart = useMemo(() => startOfDay(new Date()).toISOString(), []);

  const logsQuery = useMemoFirebase(() => query(
    collection(db, 'library_logs'),
    where('checkInTimestamp', '>=', todayStart),
    orderBy('checkInTimestamp', 'desc'),
    limit(200)
  ), [db, todayStart]);

  const { data: todayAllLogs, isLoading } = useCollection<LibraryLogRecord>(logsQuery);

  // Client-side: open sessions only, filtered by branch
  const recentLogs = useMemo(() =>
    (todayAllLogs ?? []).filter(l => {
      if (l.checkOutTimestamp) return false;
      if (branchId && (l as any).branchId && (l as any).branchId !== branchId) return false;
      return true;
    }),
    [todayAllLogs, branchId]
  );

  // For "All Branches" view — build a branch label map from the logs themselves
  const branchLabelMap = useMemo(() => {
    const map: Record<string, number> = {};
    (todayAllLogs ?? []).filter(l => !l.checkOutTimestamp).forEach(l => {
      const bid = (l as any).branchId;
      if (bid) map[bid] = (map[bid] || 0) + 1;
    });
    return map;
  }, [todayAllLogs]);

  const showBranchColumn = !branchId && Object.keys(branchLabelMap).length > 1;

  return (
    <Card className="school-card bg-white/40 border-slate-200/60 rounded-3xl overflow-hidden shadow-sm backdrop-blur-md">
      <CardHeader className="border-b border-slate-100/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
            <Activity size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <CardTitle className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Live Traffic
              </CardTitle>
            </div>
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {recentLogs.length} {recentLogs.length === 1 ? 'Person' : 'People'} currently inside
              {!branchId && Object.keys(branchLabelMap).length > 1 && (
                <span className="ml-2 normal-case font-semibold text-slate-400">· All Branches</span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="animate-spin mb-3" size={24} />
              <p className="text-xs font-bold uppercase tracking-widest">Syncing Feed...</p>
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="p-20 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Activity size={20} className="text-slate-200" />
              </div>
              <p className="text-slate-400 text-sm font-medium italic">Library is currently empty.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {/* Table Header */}
              <div className={`grid gap-2 px-5 py-2 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm ${showBranchColumn ? 'grid-cols-[2fr_1fr_1fr_1fr]' : 'grid-cols-[2fr_1fr_1fr_1fr]'}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visitor</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Purpose</span>
                {showBranchColumn
                  ? <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Branch</span>
                  : <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden sm:block">ID Number</span>
                }
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Entry</span>
              </div>

              {/* List Items */}
              {recentLogs.map((log) => {
                const isStaff = log.deptID === 'LIBRARY' || log.studentId.toUpperCase().includes('STAFF');
                const logBranchId = (log as any).branchId as string | undefined;

                return (
                  <div key={log.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-5 py-3.5 items-center hover:bg-slate-50/80 transition-colors group">
                    {/* Name + Dept */}
                    <div className="flex items-center gap-3 min-w-0">
                      <StudentAvatar
                        name={log.studentName || 'S'}
                        avatarUrl={(log as any).avatarUrl}
                        fallbackBg={isStaff ? 'linear-gradient(135deg,#64748b,#475569)' : `linear-gradient(135deg,${navy},#3b82f6)`}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate leading-none mb-1">
                          {log.studentName || 'Scholar'}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-tight">
                          {DEPARTMENTS[log.deptID] || log.deptID}
                        </p>
                      </div>
                    </div>

                    {/* Purpose */}
                    <div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-600 uppercase">
                        {log.purpose}
                      </span>
                    </div>

                    {/* Branch (all-branches view) OR Student ID */}
                    {showBranchColumn ? (
                      <div className="flex items-center gap-1">
                        <GitBranch size={10} className="text-slate-300 flex-shrink-0" />
                        <span className="text-xs font-bold truncate" style={{ color: navy }}>
                          {logBranchId ? (branchNameMap[logBranchId] ?? logBranchId) : '—'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-slate-400 hidden sm:block group-hover:text-slate-600 transition-colors font-mono">
                        {log.studentId}
                      </span>
                    )}

                    {/* Time In */}
                    <div className="text-right">
                      <p className="text-xs font-bold" style={{ color: navy }}>
                        {format(parseISO(log.checkInTimestamp), 'h:mm a')}
                      </p>
                      <p className="text-[9px] font-medium text-slate-400 uppercase">Today</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}