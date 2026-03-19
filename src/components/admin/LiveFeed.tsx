"use client";

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, parseISO, startOfDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Loader2 } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { LibraryLogRecord, DEPARTMENTS } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';

export function LiveFeed() {
  const db = useFirestore();

  const todayStart = useMemo(() => startOfDay(new Date()).toISOString(), []);

  const logsQuery = useMemoFirebase(() => {
    return query(
      collection(db, 'library_logs'),
      where('checkInTimestamp', '>=', todayStart),
      orderBy('checkInTimestamp', 'desc'),
      limit(100)
    );
  }, [db, todayStart]);

  const { data: todayAllLogs, isLoading } = useCollection<LibraryLogRecord>(logsQuery);

  // Filters to only show those who haven't tapped out
  const recentLogs = useMemo(() => 
    todayAllLogs?.filter(l => !l.checkOutTimestamp) ?? [], 
    [todayAllLogs]
  );

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
              <div className="grid grid-cols-[2fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-5 py-2 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visitor</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Purpose</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden sm:block">ID Number</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Entry</span>
              </div>

              {/* List Items */}
              {recentLogs.map((log) => {
                const isStaff = log.deptID === 'LIBRARY' || log.studentId.toUpperCase().includes('STAFF');
                
                return (
                  <div key={log.id} className="grid grid-cols-[2fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-5 py-3.5 items-center hover:bg-slate-50/80 transition-colors group">
                    {/* Name + Dept */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm"
                        style={{ background: isStaff ? 'linear-gradient(135deg, #64748b, #475569)' : `linear-gradient(135deg, ${navy}, #3b82f6)` }}
                      >
                        {(log.studentName || 'S').charAt(0)}
                      </div>
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

                    {/* ID — desktop only */}
                    <span className="text-xs font-bold text-slate-400 hidden sm:block group-hover:text-slate-600 transition-colors" style={{ fontFamily: "'DM Mono',monospace" }}>
                      {log.studentId}
                    </span>

                    {/* Time In */}
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-900" style={{ color: navy }}>
                        {format(parseISO(log.checkInTimestamp), 'h:mm a')}
                      </p>
                      <p className="text-[9px] font-medium text-slate-400 uppercase">Just now</p>
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