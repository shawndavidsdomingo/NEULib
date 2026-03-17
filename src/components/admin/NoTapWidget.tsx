"use client";

import { useMemo, useState } from 'react';
import { format, parseISO, isToday, differenceInMinutes } from 'date-fns';
import { Bell, AlertTriangle, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, doc, setDoc } from 'firebase/firestore';
import { LibraryLogRecord } from '@/lib/firebase-schema';
import { useToast } from '@/hooks/use-toast';

const navy = 'hsl(221,72%,22%)';

const PRESET_MESSAGES = [
  'Please remember to tap out when leaving the library.',
  'Reminder: Kindly tap your ID at the exit terminal before leaving.',
  'This is a courtesy reminder to tap out at the library exit.',
  'You appear to still be checked in. Please tap out if you have already left.',
];

export function NoTapWidget() {
  const db = useFirestore();
  const { toast } = useToast();
  const [notifying,   setNotifying]   = useState<string | null>(null);
  const [warnTarget,  setWarnTarget]  = useState<LibraryLogRecord | null>(null);
  const [chosenMsg,   setChosenMsg]   = useState<number | 'custom'>(0);
  const [customMsg,   setCustomMsg]   = useState('');
  const [collapsed,   setCollapsed]   = useState(false);

  const logsQuery = useMemoFirebase(
    () => query(collection(db, 'library_logs'), orderBy('checkInTimestamp', 'desc')),
    [db]
  );
  const { data: allLogs } = useCollection<LibraryLogRecord>(logsQuery);

  const sentNotifsQuery = useMemoFirebase(
    () => query(collection(db, 'notifications'), where('type', '==', 'no_tap_warning')),
    [db]
  );
  const { data: sentNotifs } = useCollection<any>(sentNotifsQuery);

  // Match warnings by logId so old warnings from previous days
  // don't suppress newly-created no-tap alerts
  const warnedLogIds = useMemo(() =>
    new Set((sentNotifs || []).map((n: any) => n.logId)),
    [sentNotifs]
  );

  const now = new Date();
  const formatDur = (checkIn: string) => {
    const diff = differenceInMinutes(now, parseISO(checkIn));
    return diff < 60 ? `${diff}m` : `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  // Only show TRUE no-tap-outs:
  // - Previous day logs with no checkout (marked as "No Tap" in status)
  // Do NOT include "long stay" (students currently inside for 60+ min) —
  // those are legitimate active sessions
  const noTapAlerts = useMemo(() => {
    const previousNoTap = (allLogs || []).filter(l =>
      !l.checkOutTimestamp && !isToday(parseISO(l.checkInTimestamp))
    );
    const seen = new Set<string>();
    return previousNoTap.filter(l => {
      if (seen.has(l.studentId)) return false;
      seen.add(l.studentId);
      return true;
    });
  }, [allLogs]);

  const unwarnedAlerts = noTapAlerts.filter(l => !warnedLogIds.has(l.id));

  const sendWarning = async (log: LibraryLogRecord, msgIdx: number | 'custom') => {
    const message = msgIdx === 'custom'
      ? customMsg.trim()
      : PRESET_MESSAGES[msgIdx as number];
    if (!message) { toast({ title: 'Enter a message first', variant: 'destructive' }); return; }
    setNotifying(log.id);
    try {
      await setDoc(doc(db, 'notifications', `warn_${log.studentId}_${log.id}`), {
        studentId:   log.studentId,
        studentName: log.studentName,
        logId:       log.id,
        type:        'no_tap_warning',
        message,
        sentAt:      new Date().toISOString(),
        read:        false,
      });
      toast({ title: 'Warning Sent', description: `${log.studentName} has been notified.` });
    } catch {
      toast({ title: 'Failed to Send', variant: 'destructive' });
    } finally {
      setNotifying(null);
      setWarnTarget(null);
      setCustomMsg('');
      setChosenMsg(0);
    }
  };

  if (unwarnedAlerts.length === 0) {
    return (
      <div className="school-card p-5 flex flex-col items-center justify-center gap-3 text-center h-full min-h-[140px]">
        <div className="p-3 rounded-2xl" style={{ background: '#d1fae520' }}>
          <CheckCircle size={22} style={{ color: '#059669' }} />
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm">All Clear</p>
          <p className="text-slate-400 text-xs mt-0.5">No missed tap-outs</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="school-card overflow-hidden">
        {/* Header — collapsible */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full px-4 py-3 border-b border-amber-100 flex items-center gap-2 text-left"
          style={{ background: 'rgba(254,243,199,0.6)' }}>
          <AlertTriangle size={16} style={{ color: '#d97706' }} />
          <p className="font-bold text-amber-800 text-sm flex-1">
            {unwarnedAlerts.length} missed tap-out{unwarnedAlerts.length !== 1 ? 's' : ''}
          </p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full mr-2"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#92400e' }}>
            Action needed
          </span>
          {collapsed
            ? <ChevronDown size={15} style={{ color: '#d97706' }} />
            : <ChevronUp   size={15} style={{ color: '#d97706' }} />}
        </button>

        {!collapsed && (
          <div className="divide-y divide-slate-50">
            {unwarnedAlerts.map(log => (
              <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{log.studentName}</p>
                  <p className="text-amber-600 text-xs font-medium mt-0.5">
                    Checked in {format(parseISO(log.checkInTimestamp), 'MMM d, h:mm a')} · {formatDur(log.checkInTimestamp)} ago
                  </p>
                </div>
                <button
                  onClick={() => { setWarnTarget(log); setChosenMsg(0); setCustomMsg(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex-shrink-0"
                  style={{ background: 'hsl(43,85%,52%)', color: 'hsl(221,72%,15%)' }}>
                  <Bell size={12} /> Warn
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message picker */}
      {warnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: 'hsl(43,85%,52%)' }}>
                <Bell size={18} style={{ color: 'hsl(221,72%,15%)' }} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Send Warning
                </h3>
                <p className="text-slate-400 text-sm">
                  To: <span className="font-semibold text-slate-700">{warnTarget.studentName}</span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-slate-500 font-semibold text-sm">Choose a preset or write your own:</p>
              {PRESET_MESSAGES.map((msg, i) => (
                <button key={i} onClick={() => setChosenMsg(i)}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all"
                  style={{
                    borderColor: chosenMsg === i ? navy : '#e2e8f0',
                    background:  chosenMsg === i ? `${navy}0f` : 'white',
                    color:       chosenMsg === i ? navy : '#475569',
                  }}>
                  {msg}
                </button>
              ))}

              {/* Custom message option */}
              <button onClick={() => setChosenMsg('custom')}
                className="w-full text-left px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all"
                style={{
                  borderColor: chosenMsg === 'custom' ? navy : '#e2e8f0',
                  background:  chosenMsg === 'custom' ? `${navy}0f` : 'white',
                  color:       chosenMsg === 'custom' ? navy : '#475569',
                }}>
                ✏️ Write custom message...
              </button>
              {chosenMsg === 'custom' && (
                <textarea
                  value={customMsg}
                  onChange={e => setCustomMsg(e.target.value)}
                  placeholder="Type your warning message here..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border-2 text-sm font-medium resize-none outline-none"
                  style={{ borderColor: navy, background: `${navy}04` }}
                  autoFocus
                />
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setWarnTarget(null); setCustomMsg(''); setChosenMsg(0); }}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button
                onClick={() => sendWarning(warnTarget, chosenMsg)}
                disabled={!!notifying || (chosenMsg === 'custom' && !customMsg.trim())}
                className="flex-1 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                style={{ background: navy, color: 'white' }}>
                {notifying ? <Loader2 size={15} className="animate-spin" /> : <><Bell size={15} /> Send Warning</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}