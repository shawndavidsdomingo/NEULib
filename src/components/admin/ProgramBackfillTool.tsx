"use client";

/**
 * ProgramBackfillTool
 *
 * One-time migration: fills in the `program` field on library_log documents
 * that were written before the snapshot fix was deployed.
 *
 * Algorithm:
 *   1. Fetch all /users → build studentId → program map
 *   2. Fetch all /library_logs where `program` is missing (undefined / empty)
 *   3. For each stale log, write program = userMap[log.studentId] if found
 *   4. Commit in batches of 400 (Firestore limit is 500 per batch)
 *
 * Safety:
 *   - Read-only preview mode shows exactly what will change before committing
 *   - Only writes `program` — never touches studentId, deptID, timestamps
 *   - Super-admin only (enforced by parent; hidden from regular admins)
 *   - Idempotent: re-running after completion finds 0 stale logs and does nothing
 */

import { useState, useMemo } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, writeBatch, doc, getDocs, query, limit } from 'firebase/firestore';
import { LibraryLogRecord } from '@/lib/firebase-schema';
import { AlertTriangle, CheckCircle2, Database, Loader2, Play, Eye, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

type Phase = 'idle' | 'scanning' | 'previewing' | 'running' | 'done' | 'error';

interface StaleLog {
  id:          string;
  studentId:   string;
  studentName: string;
  deptID:      string;
  currentProg: string; // '' or undefined
  newProg:     string; // resolved from user map — '' if user not found
}

export function ProgramBackfillTool() {
  const db = useFirestore();
  const { toast } = useToast();

  const [phase,        setPhase]        = useState<Phase>('idle');
  const [staleLogs,    setStaleLogs]    = useState<StaleLog[]>([]);
  const [skippedCount, setSkippedCount] = useState(0); // logs where user not found
  const [progress,     setProgress]     = useState(0); // batches committed
  const [totalBatches, setTotalBatches] = useState(0);
  const [errorMsg,     setErrorMsg]     = useState('');

  // Live user map — fetched reactively so it's always fresh
  const usersRef = useMemoFirebase(() => collection(db, 'users'), [db]);
  const { data: allUsers } = useCollection<{ id: string; program?: string }>(usersRef);

  const userProgramMap = useMemo(() => {
    const m: Record<string, string> = {};
    (allUsers || []).forEach(u => { if (u.id && u.program) m[u.id] = u.program; });
    return m;
  }, [allUsers]);

  // ── Step 1: Scan — find all stale logs ──────────────────────────────────
  const handleScan = async () => {
    setPhase('scanning');
    setStaleLogs([]);
    setSkippedCount(0);
    setErrorMsg('');
    try {
      // Fetch all logs — no server-side filter for missing field (Firestore
      // can't query for missing fields), so we pull everything and filter client-side
      const snap = await getDocs(collection(db, 'library_logs'));

      const stale: StaleLog[] = [];
      let skipped = 0;

      snap.docs.forEach(d => {
        const data = d.data() as LibraryLogRecord & { program?: string };
        // Stale = program field missing or empty string
        if (data.program && data.program.trim() !== '') return;

        const resolvedProg = userProgramMap[data.studentId] || '';
        if (!resolvedProg) {
          // User no longer exists or has no program — skip but count
          skipped++;
          return;
        }

        stale.push({
          id:          d.id,
          studentId:   data.studentId,
          studentName: data.studentName || data.studentId,
          deptID:      data.deptID || '—',
          currentProg: data.program || '',
          newProg:     resolvedProg,
        });
      });

      setStaleLogs(stale);
      setSkippedCount(skipped);
      setPhase('previewing');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Scan failed');
      setPhase('error');
    }
  };

  // ── Step 2: Commit — write program to stale logs in batches ─────────────
  const handleCommit = async () => {
    if (!staleLogs.length) return;
    setPhase('running');
    setProgress(0);

    const BATCH_SIZE = 400;
    const batches    = Math.ceil(staleLogs.length / BATCH_SIZE);
    setTotalBatches(batches);

    try {
      for (let b = 0; b < batches; b++) {
        const slice = staleLogs.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        const batch = writeBatch(db);
        slice.forEach(log => {
          // ONLY write the program field — nothing else is touched
          batch.update(doc(db, 'library_logs', log.id), { program: log.newProg });
        });
        await batch.commit();
        setProgress(b + 1);
      }
      setPhase('done');
      toast({
        title:       'Backfill Complete',
        description: `${staleLogs.length} log record${staleLogs.length !== 1 ? 's' : ''} updated successfully.`,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Commit failed');
      setPhase('error');
    }
  };

  const handleReset = () => {
    setPhase('idle');
    setStaleLogs([]);
    setSkippedCount(0);
    setProgress(0);
    setErrorMsg('');
  };

  const usersReady = allUsers && allUsers.length > 0;

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* Header card */}
      <div style={card} className="p-5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl flex-shrink-0" style={{ background: `${navy}10` }}>
            <Database size={20} style={{ color: navy }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
              Program Field Backfill
            </h2>
            <p className="text-slate-500 text-sm mt-1 leading-relaxed">
              One-time migration to fill in the <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">program</code> field
              on library log records written before the snapshot fix was deployed.
              Logs created after the fix already have this field and will be skipped automatically.
            </p>

            {/* Warning banner */}
            <div className="mt-3 flex items-start gap-2.5 p-3 rounded-xl"
              style={{ background: 'hsl(43,85%,55%,0.10)', border: '1px solid hsl(43,85%,55%,0.25)' }}>
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'hsl(38,90%,40%)' }} />
              <div className="text-xs font-medium leading-relaxed" style={{ color: 'hsl(38,90%,35%)' }}>
                <strong>Before running:</strong> This tool reads the student's <em>current</em> program from their
                user record and writes it to old logs. If a student has changed their program since those logs
                were created, the backfilled value will reflect their <em>current</em> program, not what they
                were enrolled in at the time. For most cases this is accurate enough. Run this only once.
              </div>
            </div>
          </div>
        </div>

        {/* Status + actions */}
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          {/* User map readiness */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <span className={`w-2 h-2 rounded-full ${usersReady ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
            {usersReady ? `${allUsers!.length} users loaded` : 'Loading user data…'}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {phase !== 'idle' && phase !== 'running' && (
              <button onClick={handleReset}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                <RotateCcw size={12} /> Reset
              </button>
            )}

            {(phase === 'idle' || phase === 'error') && (
              <button onClick={handleScan} disabled={!usersReady}
                className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-40"
                style={{ background: navy }}>
                <Eye size={14} /> Scan for Stale Logs
              </button>
            )}

            {phase === 'previewing' && staleLogs.length > 0 && (
              <button onClick={handleCommit}
                className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                style={{ background: '#059669' }}>
                <Play size={14} /> Commit {staleLogs.length} Updates
              </button>
            )}

            {phase === 'previewing' && staleLogs.length === 0 && (
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <CheckCircle2 size={16} /> All logs already have program data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scanning spinner */}
      {phase === 'scanning' && (
        <div style={card} className="py-12 flex items-center justify-center gap-3 text-slate-400">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm font-medium">Scanning library logs…</span>
        </div>
      )}

      {/* Running progress */}
      {phase === 'running' && (
        <div style={card} className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin flex-shrink-0" size={18} style={{ color: navy }} />
            <p className="font-semibold text-slate-700 text-sm">
              Writing batch {progress} of {totalBatches}…
            </p>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${(progress / totalBatches) * 100}%`, background: navy }} />
          </div>
          <p className="text-xs text-slate-400 font-medium">
            {Math.round((progress / totalBatches) * staleLogs.length)} / {staleLogs.length} records written
          </p>
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div style={{ ...card, border: '1px solid rgba(5,150,105,0.2)' }}
          className="p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-emerald-50 flex-shrink-0">
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-slate-900">Backfill complete</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {staleLogs.length} log record{staleLogs.length !== 1 ? 's' : ''} updated.
              {skippedCount > 0 && ` ${skippedCount} skipped (user not found or no program).`}
              {' '}The Report Hub Program column will now show values for all historical logs.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{ ...card, border: '1px solid rgba(220,38,38,0.2)' }}
          className="p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-red-50 flex-shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <p className="font-bold text-slate-900">Migration failed</p>
            <p className="text-sm text-slate-500 mt-0.5 font-mono">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Preview table */}
      {phase === 'previewing' && staleLogs.length > 0 && (
        <div style={card} className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
                Preview — {staleLogs.length} records to update
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {skippedCount > 0 && `${skippedCount} additional log${skippedCount !== 1 ? 's' : ''} will be skipped (user not found or no program set).  ·  `}
                Review before committing. Only the <code className="font-mono">program</code> field will be written.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 h-10 bg-slate-50/80">
                  <th className="pl-5 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Student</th>
                  <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">Student ID</th>
                  <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">Dept</th>
                  <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">Current Program</th>
                  <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 pr-5">Will be set to</th>
                </tr>
              </thead>
              <tbody>
                {staleLogs.slice(0, 200).map(log => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50" style={{ height: 48 }}>
                    <td className="pl-5">
                      <span className="font-semibold text-slate-800 text-sm">{log.studentName}</span>
                    </td>
                    <td>
                      <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                        {log.studentId}
                      </span>
                    </td>
                    <td>
                      <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg"
                        style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {log.deptID}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-300 italic">
                        {log.currentProg || '(empty)'}
                      </span>
                    </td>
                    <td className="pr-5">
                      <span className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                        style={{ background: 'hsl(262,83%,58%,0.08)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>
                        {log.newProg}
                      </span>
                    </td>
                  </tr>
                ))}
                {staleLogs.length > 200 && (
                  <tr>
                    <td colSpan={5} className="pl-5 py-3 text-xs font-medium text-slate-400 italic">
                      … and {staleLogs.length - 200} more records (preview capped at 200 rows)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}