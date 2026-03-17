"use client";

import { useMemo, useState } from 'react';
import { format, parseISO, isToday } from 'date-fns';
import {
  AlertTriangle, Bell, BellOff, CheckCircle2, Search,
  Filter, ArrowUpDown, ArrowUp, ArrowDown, Loader2, Clock,
  MessageSquare, X, Edit3, BellRing, Users,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { LibraryLogRecord, UserRecord, DEPARTMENTS, PROGRAMS } from '@/lib/firebase-schema';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type SortField = 'name' | 'id' | 'dept' | 'program' | 'timestamp' | 'status';
type SortDir   = 'asc' | 'desc';

interface EnrichedRow {
  logId:        string;
  studentId:    string;
  studentName:  string;
  deptID:       string;
  deptName:     string;
  program:      string;
  timestamp:    string;
  notifId:      string;
  notified:     boolean;
  acknowledged: boolean;
}

// ─── Preset messages ──────────────────────────────────────────────────────────
// [DATE] is replaced with the actual missed clock-in date at send time.
const PRESETS: { label: string; body: string }[] = [
  {
    label: 'Standard System Alert',
    body:  'System Alert: You failed to tap out on [DATE]. Please ensure you complete your checkout to maintain accurate records.',
  },
  {
    label: 'Friendly Reminder',
    body:  'Friendly Reminder: Our records show you did not tap out on [DATE]. Kindly remember to complete your checkout next time to keep your attendance accurate.',
  },
  {
    label: 'Formal Notice',
    body:  'Notice: A missed tap-out has been recorded for your account on [DATE]. This may affect your library attendance data. Please approach the library counter if you have any concerns.',
  },
  {
    label: 'Polite Follow-Up',
    body:  "Hello! It looks like you forgot to tap out on [DATE]. No worries — just a gentle heads-up so your records stay up to date. Please make sure to tap out before leaving next time.",
  },
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const navy = 'hsl(221,72%,22%)';

const card: React.CSSProperties = {
  background:     'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border:         '1px solid rgba(255,255,255,0.9)',
  boxShadow:      '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius:   '1rem',
};

const thStyle =
  'text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 select-none cursor-pointer';

// ─── Component ────────────────────────────────────────────────────────────────
export function MissedTapOutTab() {
  const db       = useFirestore();
  const { toast } = useToast();

  // ── Filters / sort ──
  const [search,        setSearch]        = useState('');
  const [deptFilter,    setDeptFilter]    = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [sortField,     setSortField]     = useState<SortField>('timestamp');
  const [sortDir,       setSortDir]       = useState<SortDir>('desc');

  // ── Message modal state ──
  const [targetRow, setTargetRow] = useState<EnrichedRow | null>(null);
  const [presetIdx, setPresetIdx] = useState<number | 'custom'>(0);
  const [customMsg, setCustomMsg] = useState('');
  const [sending,   setSending]   = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkModal,   setBulkModal]   = useState(false);
  const [bulkPreset,  setBulkPreset]  = useState<number | 'custom'>(0);
  const [bulkCustom,  setBulkCustom]  = useState('');

  // ── Live data ──
  const logsQuery = useMemoFirebase(
    () => query(collection(db, 'library_logs'), orderBy('checkInTimestamp', 'desc')),
    [db]
  );
  const { data: allLogs, isLoading: logsLoading } =
    useCollection<LibraryLogRecord>(logsQuery);

  const usersRef = useMemoFirebase(() => collection(db, 'users'), [db]);
  const { data: allUsers } = useCollection<UserRecord>(usersRef);

  const notifsQuery = useMemoFirebase(
    () => query(collection(db, 'notifications')),
    [db]
  );
  const { data: allNotifs } = useCollection<any>(notifsQuery);

  // ── Lookup maps ──
  const userMap = useMemo(() => {
    const m: Record<string, UserRecord> = {};
    (allUsers || []).forEach(u => { m[u.id] = u; });
    return m;
  }, [allUsers]);

  const notifMap = useMemo(() => {
    const m: Record<string, { notified: boolean; acknowledged: boolean }> = {};
    (allNotifs || []).forEach((n: any) => {
      if (n.type === 'no_tap_warning') {
        m[n.logId] = { notified: true, acknowledged: !!n.read };
      }
    });
    return m;
  }, [allNotifs]);

  // ── Enriched rows ──
  const rows: EnrichedRow[] = useMemo(() => {
    if (!allLogs) return [];
    const seen = new Set<string>();
    return allLogs
      .filter(l => {
        if (l.checkOutTimestamp) return false;
        if (isToday(parseISO(l.checkInTimestamp))) return false;
        if (seen.has(l.studentId)) return false;
        seen.add(l.studentId);
        return true;
      })
      .map(l => {
        const user       = userMap[l.studentId];
        const deptID     = l.deptID || user?.deptID || '';
        const program    = user?.program || '—';
        const notifState = notifMap[l.id] || { notified: false, acknowledged: false };
        return {
          logId:        l.id,
          studentId:    l.studentId,
          studentName:
            l.studentName ||
            [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
            l.studentId,
          deptID,
          deptName:     DEPARTMENTS[deptID] || deptID || '—',
          program,
          timestamp:    l.checkInTimestamp,
          notifId:      `warn_${l.studentId}_${l.id}`,
          notified:     notifState.notified,
          acknowledged: notifState.acknowledged,
        };
      });
  }, [allLogs, userMap, notifMap]);

  // ── Filter options ──
  const deptOptions = useMemo(() =>
    [...new Set(rows.map(r => r.deptID).filter(Boolean))].sort(),
    [rows]
  );
  const programOptions = useMemo(() => {
    const base =
      deptFilter !== 'all'
        ? (PROGRAMS[deptFilter] || []).map(p => p.code)
        : [...new Set(rows.map(r => r.program).filter(p => p !== '—'))];
    return [...new Set(base)].sort();
  }, [rows, deptFilter]);

  // ── Filtered + sorted ──
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    let out = rows.filter(r => {
      const mS = !s || r.studentName.toLowerCase().includes(s) || r.studentId.toLowerCase().includes(s);
      const mD = deptFilter    === 'all' || r.deptID  === deptFilter;
      const mP = programFilter === 'all' || r.program === programFilter;
      const mSt =
        statusFilter === 'all'          ? true :
        statusFilter === 'pending'      ? !r.notified :
        statusFilter === 'notified'     ? r.notified && !r.acknowledged :
        /* acknowledged */                r.acknowledged;
      return mS && mD && mP && mSt;
    });

    return [...out].sort((a, b) => {
      let va = '', vb = '';
      if      (sortField === 'name')      { va = a.studentName; vb = b.studentName; }
      else if (sortField === 'id')        { va = a.studentId;   vb = b.studentId; }
      else if (sortField === 'dept')      { va = a.deptID;      vb = b.deptID; }
      else if (sortField === 'program')   { va = a.program;     vb = b.program; }
      else if (sortField === 'timestamp') { va = a.timestamp;   vb = b.timestamp; }
      else if (sortField === 'status') {
        va = a.acknowledged ? '2' : a.notified ? '1' : '0';
        vb = b.acknowledged ? '2' : b.notified ? '1' : '0';
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, deptFilter, programFilter, statusFilter, sortField, sortDir]);

  // ── Sort helper ──
  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="ml-1 opacity-30 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={12} className="ml-1 text-primary inline" />
      : <ArrowDown size={12} className="ml-1 text-primary inline" />;
  };

  // ── Open / close modal ──
  const openModal = (row: EnrichedRow) => {
    setTargetRow(row);
    setPresetIdx(0);
    setCustomMsg('');
  };
  const closeModal = () => {
    if (sending) return;
    setTargetRow(null);
    setCustomMsg('');
    setPresetIdx(0);
  };

  // ── Resolve final message (replace [DATE] placeholder) ──
  const resolveMessage = (row: EnrichedRow, idx: number | 'custom', custom: string) => {
    const dateStr = format(parseISO(row.timestamp), 'MMMM d, yyyy');
    if (idx === 'custom') return custom.trim();
    return PRESETS[idx as number].body.replace('[DATE]', dateStr);
  };

  // ── Send ──
  const handleSend = async () => {
    if (!targetRow) return;
    if (presetIdx === 'custom' && !customMsg.trim()) {
      toast({ title: 'Enter a message first', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      await setDoc(doc(db, 'notifications', targetRow.notifId), {
        studentId:   targetRow.studentId,
        studentName: targetRow.studentName,
        logId:       targetRow.logId,
        type:        'no_tap_warning',
        message:     resolveMessage(targetRow, presetIdx, customMsg),
        sentAt:      new Date().toISOString(),
        read:        false,
      });
      toast({ title: 'Notification Sent', description: `${targetRow.studentName} has been notified.` });
      closeModal();
    } catch {
      toast({ title: 'Failed to Send', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // ── Summary ──
  const pendingCount      = rows.filter(r => !r.notified).length;
  const notifiedCount     = rows.filter(r => r.notified && !r.acknowledged).length;
  const acknowledgedCount = rows.filter(r => r.acknowledged).length;

  // ── Rows that need notifying ──
  const pendingRows = rows.filter(r => !r.notified);

  // ── Bulk notify handler ──
  const handleBulkNotify = async () => {
    if (pendingRows.length === 0) return;
    if (bulkPreset === 'custom' && !bulkCustom.trim()) {
      toast({ title: 'Enter a message first', variant: 'destructive' }); return;
    }
    setBulkSending(true);
    let sent = 0;
    for (const row of pendingRows) {
      try {
        const dateStr = format(parseISO(row.timestamp), 'MMMM d, yyyy');
        const message = bulkPreset === 'custom'
          ? bulkCustom.trim()
          : PRESETS[bulkPreset as number].body.replace('[DATE]', dateStr);
        await setDoc(doc(db, 'notifications', row.notifId), {
          studentId: row.studentId, studentName: row.studentName,
          logId: row.logId, type: 'no_tap_warning',
          message, sentAt: new Date().toISOString(), read: false,
        });
        sent++;
      } catch { /* continue */ }
    }
    toast({ title: `Bulk Notification Sent`, description: `${sent} of ${pendingRows.length} students notified.` });
    setBulkModal(false);
    setBulkSending(false);
    setBulkCustom('');
    setBulkPreset(0);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* ── Header / filter card ── */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: 'hsl(38,90%,48%)' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Missed Tap-Outs
              </h2>
              <p className="text-slate-400 font-medium text-sm mt-0.5">
                Students who checked in but never tapped out
              </p>
            </div>
          </div>
          {/* Summary pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-center px-3 py-1.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)' }}>
              <p className="font-bold text-base text-red-600">{pendingCount}</p>
              <p className="text-slate-400 font-semibold" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pending</p>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)' }}>
              <p className="font-bold text-base text-amber-600">{notifiedCount}</p>
              <p className="text-slate-400 font-semibold" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Notified</p>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl" style={{ background: 'rgba(5,150,105,0.08)' }}>
              <p className="font-bold text-base text-emerald-600">{acknowledgedCount}</p>
              <p className="text-slate-400 font-semibold" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Acknowledged</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search name or student ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
            />
          </div>
          <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setProgramFilter('all'); }}>
            <SelectTrigger className="h-9 w-40 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
              <div className="flex items-center gap-1.5">
                <Filter size={11} style={{ color: navy }} />
                <SelectValue placeholder="All Colleges" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-64">
              <SelectItem value="all" className="font-semibold text-xs">All Colleges</SelectItem>
              {deptOptions.map(d => (
                <SelectItem key={d} value={d} className="font-semibold text-xs">
                  <span className="font-bold mr-1" style={{ color: navy }}>[{d}]</span>
                  {DEPARTMENTS[d] || d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={programFilter} onValueChange={setProgramFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
              <SelectValue placeholder="All Programs" />
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-64">
              <SelectItem value="all" className="font-semibold text-xs">All Programs</SelectItem>
              {programOptions.map(p => (
                <SelectItem key={p} value={p} className="font-semibold text-xs">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {([
              { value: 'all',          label: 'All'          },
              { value: 'pending',      label: 'Pending'      },
              { value: 'notified',     label: 'Notified'     },
              { value: 'acknowledged', label: 'Acknowledged' },
            ] as const).map(s => (
              <button key={s.value} onClick={() => setStatusFilter(s.value)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
                style={statusFilter === s.value ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-slate-400 text-xs font-medium ml-auto">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Bulk notify bar */}
        {pendingCount > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <BellRing size={15} />
              <span>{pendingCount} student{pendingCount !== 1 ? 's' : ''} awaiting notification</span>
            </div>
            <button
              onClick={() => { setBulkModal(true); setBulkPreset(0); setBulkCustom(''); }}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl text-white transition-all active:scale-95"
              style={{ background: 'hsl(0,72%,51%)' }}>
              <Users size={13} /> Notify All Pending
            </button>
          </div>
        )}
      </div>

      {/* ── Table card ── */}
      <div style={card} className="overflow-hidden">
        {logsLoading ? (
          <div className="py-20 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm font-medium">Loading missed tap-out records…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(5,150,105,0.08)' }}>
              <CheckCircle2 size={28} style={{ color: '#059669' }} />
            </div>
            <p className="font-bold text-slate-700 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
              {rows.length === 0 ? 'All Clear' : 'No matches'}
            </p>
            <p className="text-slate-400 text-sm mt-1 font-medium">
              {rows.length === 0 ? 'No missed tap-outs on record.' : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-11 border-slate-100">
                  <TableHead className={`pl-5 ${thStyle}`} onClick={() => handleSort('name')}>
                    Student Name <SortIcon field="name" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => handleSort('id')}>
                    Student ID <SortIcon field="id" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => handleSort('dept')}>
                    Department <SortIcon field="dept" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => handleSort('program')}>
                    Program <SortIcon field="program" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => handleSort('timestamp')}>
                    Clock-In Time <SortIcon field="timestamp" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => handleSort('status')}>
                    Status <SortIcon field="status" />
                  </TableHead>
                  <TableHead className={`text-right pr-5 ${thStyle}`} style={{ cursor: 'default' }}>
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => (
                  <TableRow key={row.logId}
                    className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                    style={{ height: 64 }}>

                    {/* Name + avatar */}
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                          style={{ background: row.acknowledged ? '#059669' : row.notified ? 'hsl(38,90%,48%)' : 'hsl(0,72%,51%)' }}>
                          {row.studentName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'S'}
                        </div>
                        <span className="font-semibold text-slate-900 text-sm truncate max-w-[160px]">
                          {row.studentName}
                        </span>
                      </div>
                    </TableCell>

                    {/* ID */}
                    <TableCell>
                      <span className="font-bold text-sm" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {row.studentId}
                      </span>
                    </TableCell>

                    {/* Dept */}
                    <TableCell>
                      <span className="font-bold text-xs px-2 py-1 rounded-lg"
                        style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                        {row.deptID || '—'}
                      </span>
                    </TableCell>

                    {/* Program */}
                    <TableCell>
                      <span className="text-xs font-semibold text-slate-500">{row.program}</span>
                    </TableCell>

                    {/* Clock-In */}
                    <TableCell>
                      <p className="font-semibold text-sm text-slate-700">{format(parseISO(row.timestamp), 'MMM d, yyyy')}</p>
                      <p className="text-xs text-slate-400 font-medium">{format(parseISO(row.timestamp), 'h:mm a')}</p>
                    </TableCell>

                    {/* Status badge */}
                    <TableCell>
                      {row.acknowledged ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                          style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>
                          <CheckCircle2 size={12} /> Acknowledged
                        </span>
                      ) : row.notified ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                          style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>
                          <Bell size={12} className="animate-pulse" /> Notified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                          style={{ background: 'rgba(239,68,68,0.09)', color: '#ef4444' }}>
                          <BellOff size={12} /> Pending
                        </span>
                      )}
                    </TableCell>

                    {/* Action button */}
                    <TableCell className="text-right pr-5">
                      {row.acknowledged ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
                          style={{ background: 'rgba(5,150,105,0.08)', color: '#059669' }}>
                          <CheckCircle2 size={13} /> Done
                        </span>
                      ) : row.notified ? (
                        <button onClick={() => openModal(row)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all active:scale-95"
                          style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#d97706', background: 'rgba(245,158,11,0.06)' }}>
                          <Bell size={12} /> Re-notify
                        </button>
                      ) : (
                        <button onClick={() => openModal(row)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-white transition-all active:scale-95"
                          style={{ background: navy }}>
                          <Bell size={12} /> Notify
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer summary */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400">
            <Clock size={13} />
            <span>{rows.length} total missed tap-out{rows.length !== 1 ? 's' : ''}</span>
            <span className="text-red-400">· {pendingCount} awaiting notification</span>
            {notifiedCount     > 0 && <span className="text-amber-500">· {notifiedCount} notified, awaiting acknowledgement</span>}
            {acknowledgedCount > 0 && <span className="text-emerald-600">· {acknowledgedCount} acknowledged</span>}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MESSAGE PICKER MODAL
          Opens when admin clicks "Notify" or "Re-notify" on any row.
      ══════════════════════════════════════════════════════════════════════ */}
      {targetRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            {/* Modal header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4"
              style={{ background: `${navy}06` }}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{ background: navy }}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Send Notification
                  </h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    To: <span className="font-bold text-slate-800">{targetRow.studentName}</span>
                    <span className="font-mono text-xs text-slate-400 ml-2">· {targetRow.studentId}</span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(38,90%,42%)' }}>
                    Missed tap-out on{' '}
                    <strong>{format(parseISO(targetRow.timestamp), 'MMMM d, yyyy')}</strong>{' '}
                    at {format(parseISO(targetRow.timestamp), 'h:mm a')}
                  </p>
                </div>
              </div>
              <button onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-700 flex-shrink-0 mt-0.5">
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">

              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Choose a preset or write a custom message
              </p>

              {/* Preset cards */}
              {PRESETS.map((preset, i) => {
                const preview = preset.body.replace(
                  '[DATE]',
                  format(parseISO(targetRow.timestamp), 'MMMM d, yyyy')
                );
                const active = presetIdx === i;
                return (
                  <button key={i} onClick={() => setPresetIdx(i)}
                    className="w-full text-left p-4 rounded-xl border-2 transition-all space-y-1.5"
                    style={{
                      borderColor: active ? navy       : '#e2e8f0',
                      background:  active ? `${navy}08` : 'white',
                    }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm" style={{ color: active ? navy : '#1e293b' }}>
                        {preset.label}
                      </p>
                      {active && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: navy }}>✓</span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: active ? `${navy}bb` : '#64748b' }}>
                      {preview}
                    </p>
                  </button>
                );
              })}

              {/* Custom option */}
              <button onClick={() => setPresetIdx('custom')}
                className="w-full text-left p-4 rounded-xl border-2 transition-all"
                style={{
                  borderColor: presetIdx === 'custom' ? navy       : '#e2e8f0',
                  background:  presetIdx === 'custom' ? `${navy}08` : 'white',
                }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Edit3 size={14} style={{ color: presetIdx === 'custom' ? navy : '#94a3b8' }} />
                    <p className="font-bold text-sm" style={{ color: presetIdx === 'custom' ? navy : '#1e293b' }}>
                      Write a custom message…
                    </p>
                  </div>
                  {presetIdx === 'custom' && (
                    <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: navy }}>✓</span>
                  )}
                </div>
              </button>

              {/* Custom textarea — visible only when custom is selected */}
              {presetIdx === 'custom' && (
                <textarea
                  value={customMsg}
                  onChange={e => setCustomMsg(e.target.value)}
                  placeholder={`e.g. "Please note that your tap-out was not recorded on ${format(parseISO(targetRow.timestamp), 'MMMM d, yyyy')}. Kindly see the library desk."`}
                  rows={4}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border-2 text-sm font-medium resize-none outline-none transition-colors"
                  style={{ borderColor: navy, background: `${navy}04`, color: '#1e293b', lineHeight: '1.6' }}
                />
              )}

              {/* Live message preview */}
              {(presetIdx !== 'custom' || customMsg.trim()) && (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <MessageSquare size={10} /> Message Preview
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">
                    {resolveMessage(targetRow, presetIdx, customMsg)}
                  </p>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-white">
              <button onClick={closeModal} disabled={sending}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || (presetIdx === 'custom' && !customMsg.trim())}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                style={{ background: navy }}>
                {sending
                  ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                  : <><Bell size={15} /> Send Notification</>}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ══ BULK NOTIFY MODAL ══ */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div className="px-6 py-5 border-b border-red-100 flex items-start justify-between gap-4"
              style={{ background: 'rgba(239,68,68,0.05)' }}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl text-white flex-shrink-0" style={{ background: 'hsl(0,72%,51%)' }}>
                  <BellRing size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                    Notify All Pending
                  </h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Sending to <span className="font-bold text-red-600">{pendingRows.length} student{pendingRows.length !== 1 ? 's' : ''}</span> who have not been notified
                  </p>
                </div>
              </div>
              <button onClick={() => setBulkModal(false)} disabled={bulkSending}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-400 flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            {/* Body — same preset picker as single notify */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Choose a preset or write a custom message
              </p>
              {PRESETS.map((preset, i) => {
                const active = bulkPreset === i;
                return (
                  <button key={i} onClick={() => setBulkPreset(i)}
                    className="w-full text-left p-4 rounded-xl border-2 transition-all space-y-1.5"
                    style={{ borderColor: active ? navy : '#e2e8f0', background: active ? `${navy}08` : 'white' }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm" style={{ color: active ? navy : '#1e293b' }}>{preset.label}</p>
                      {active && <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: navy }}>✓</span>}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: active ? `${navy}bb` : '#64748b' }}>
                      {preset.body.replace('[DATE]', '<their missed date>')}
                    </p>
                  </button>
                );
              })}
              <button onClick={() => setBulkPreset('custom')}
                className="w-full text-left p-4 rounded-xl border-2 transition-all"
                style={{ borderColor: bulkPreset === 'custom' ? navy : '#e2e8f0', background: bulkPreset === 'custom' ? `${navy}08` : 'white' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Edit3 size={14} style={{ color: bulkPreset === 'custom' ? navy : '#94a3b8' }} />
                    <p className="font-bold text-sm" style={{ color: bulkPreset === 'custom' ? navy : '#1e293b' }}>Write a custom message…</p>
                  </div>
                  {bulkPreset === 'custom' && <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: navy }}>✓</span>}
                </div>
              </button>
              {bulkPreset === 'custom' && (
                <textarea value={bulkCustom} onChange={e => setBulkCustom(e.target.value)}
                  placeholder="Type your message here… Note: [DATE] placeholders are NOT substituted for custom bulk messages."
                  rows={4} autoFocus
                  className="w-full px-4 py-3 rounded-xl border-2 text-sm font-medium resize-none outline-none"
                  style={{ borderColor: navy, background: `${navy}04`, color: '#1e293b', lineHeight: '1.6' }} />
              )}
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-medium text-amber-700 flex items-start gap-2">
                <BellRing size={13} className="flex-shrink-0 mt-0.5" />
                <span>Each student will receive an individual notification with their specific missed date filled in automatically.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-white">
              <button onClick={() => setBulkModal(false)} disabled={bulkSending}
                className="flex-1 h-11 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleBulkNotify}
                disabled={bulkSending || (bulkPreset === 'custom' && !bulkCustom.trim())}
                className="flex-1 h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                style={{ background: 'hsl(0,72%,51%)' }}>
                {bulkSending
                  ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                  : <><BellRing size={15} /> Send to All {pendingRows.length}</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}