"use client";

import { useState, useMemo } from 'react';
import { format, parseISO, isToday, differenceInMinutes, startOfDay, subDays } from 'date-fns';
import { History, Search, Filter, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { LibraryLogRecord, DepartmentRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background:     'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border:         '1px solid rgba(255,255,255,0.9)',
  boxShadow:      '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius:   '1rem',
};

type SortField = 'studentName' | 'checkInTimestamp' | 'checkOutTimestamp' | 'duration' | 'deptID' | 'purpose' | 'status';

function formatDur(ci: string, co?: string) {
  if (!co) return '—';
  const m = differenceInMinutes(parseISO(co), parseISO(ci));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Auto-format student IDs: XX-XXXXX-XXX
function formatId(id: string) {
  if (!id) return '—';
  const d = id.replace(/\D/g, '');
  if (d.length < 3)  return id;
  if (d.length < 8)  return `${d.slice(0,2)}-${d.slice(2)}`;
  return `${d.slice(0,2)}-${d.slice(2,7)}-${d.slice(7,10)}`;
}

export function LogHistory() {
  const db = useFirestore();

  const [search,        setSearch]        = useState('');
  const [deptFilter,    setDeptFilter]    = useState('All Departments');
  const [statusFilter,  setStatusFilter]  = useState('All');
  const [dateRange,     setDateRange]     = useState('7');   // days back, or 'all'
  const [sortField,     setSortField]     = useState<SortField>('checkInTimestamp');
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc');

  const deptRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptRef);

  const cutoff = dateRange === 'all'
    ? '2024-01-01T00:00:00.000Z'
    : subDays(startOfDay(new Date()), parseInt(dateRange)).toISOString();

  const logsQ = useMemoFirebase(
    () => query(
      collection(db, 'library_logs'),
      where('checkInTimestamp', '>=', cutoff),
      orderBy('checkInTimestamp', 'desc'),
      limit(500)
    ),
    [db, cutoff]
  );
  const { data: allLogs, isLoading } = useCollection<LibraryLogRecord>(logsQ);

  const filtered = useMemo(() => {
    if (!allLogs) return [];
    const s = search.toLowerCase();
    return allLogs.filter(l => {
      const matchS  = !s || (l.studentName||'').toLowerCase().includes(s) || l.studentId.toLowerCase().includes(s);
      const matchD  = deptFilter === 'All Departments' || l.deptID === deptFilter;
      const ci      = parseISO(l.checkInTimestamp);
      const noTap   = !l.checkOutTimestamp && !isToday(ci);
      const matchSt = statusFilter === 'All'
        || (statusFilter === 'Active'    && !l.checkOutTimestamp && isToday(ci))
        || (statusFilter === 'Completed' && !!l.checkOutTimestamp)
        || (statusFilter === 'No Tap'    && noTap);
      return matchS && matchD && matchSt;
    }).sort((a, b) => {
      let va = '', vb = '';
      if      (sortField === 'studentName')       { va = a.studentName||''; vb = b.studentName||''; }
      else if (sortField === 'checkInTimestamp')   { va = a.checkInTimestamp; vb = b.checkInTimestamp; }
      else if (sortField === 'checkOutTimestamp')  { va = a.checkOutTimestamp||''; vb = b.checkOutTimestamp||''; }
      else if (sortField === 'deptID')             { va = a.deptID; vb = b.deptID; }
      else if (sortField === 'purpose')            { va = a.purpose; vb = b.purpose; }
      else if (sortField === 'duration') {
        const da = a.checkOutTimestamp ? differenceInMinutes(parseISO(a.checkOutTimestamp), parseISO(a.checkInTimestamp)) : -1;
        const db2 = b.checkOutTimestamp ? differenceInMinutes(parseISO(b.checkOutTimestamp), parseISO(b.checkInTimestamp)) : -1;
        return sortDir === 'asc' ? da - db2 : db2 - da;
      }
      else if (sortField === 'status') {
        const stat = (l: LibraryLogRecord) => l.checkOutTimestamp ? 'done' : isToday(parseISO(l.checkInTimestamp)) ? 'active' : 'notap';
        va = stat(a); vb = stat(b);
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allLogs, search, deptFilter, statusFilter, sortField, sortDir]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="ml-1 opacity-30 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={11} className="ml-1 inline" style={{ color: navy }} />
      : <ArrowDown size={11} className="ml-1 inline" style={{ color: navy }} />;
  };

  const thStyle = 'text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 cursor-pointer select-none hover:bg-slate-100 transition-colors';

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* Filter card */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}><History size={18} /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Log History
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">Complete visitor session records</p>
            </div>
          </div>
          <p className="text-slate-400 text-xs font-medium">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium" />
          </div>

          {/* Date range */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-9 w-32 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="1"   className="text-xs font-semibold">Today</SelectItem>
              <SelectItem value="7"   className="text-xs font-semibold">Last 7 Days</SelectItem>
              <SelectItem value="30"  className="text-xs font-semibold">Last 30 Days</SelectItem>
              <SelectItem value="all" className="text-xs font-semibold">All Time</SelectItem>
            </SelectContent>
          </Select>

          {/* Dept */}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <Filter size={11} style={{ color: navy }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="All Departments" className="text-xs font-semibold">All Colleges</SelectItem>
              {depts?.sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
                <SelectItem key={d.deptID} value={d.deptID} className="text-xs font-semibold">
                  [{d.deptID}] {d.departmentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {(['All', 'Active', 'Completed', 'No Tap'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={statusFilter === s ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={card} className="overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={18} /><span className="text-sm font-medium">Loading history…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <History size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm font-medium">No records match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-11 border-slate-100">
                  <TableHead className={`pl-5 ${thStyle}`} onClick={() => toggleSort('studentName')}>
                    Student <SortIcon field="studentName" />
                  </TableHead>
                  <TableHead className={thStyle} style={{ cursor: 'default' }}>
                    Student ID
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => toggleSort('deptID')}>
                    Dept <SortIcon field="deptID" />
                  </TableHead>
                  <TableHead className={`hidden md:table-cell ${thStyle}`} onClick={() => toggleSort('purpose')}>
                    Purpose <SortIcon field="purpose" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => toggleSort('checkInTimestamp')}>
                    Time In <SortIcon field="checkInTimestamp" />
                  </TableHead>
                  <TableHead className={`hidden sm:table-cell ${thStyle}`} onClick={() => toggleSort('checkOutTimestamp')}>
                    Time Out <SortIcon field="checkOutTimestamp" />
                  </TableHead>
                  <TableHead className={`hidden sm:table-cell ${thStyle}`} onClick={() => toggleSort('duration')}>
                    Duration <SortIcon field="duration" />
                  </TableHead>
                  <TableHead className={`text-right pr-5 ${thStyle}`} onClick={() => toggleSort('status')}>
                    Status <SortIcon field="status" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(l => {
                  const ci    = parseISO(l.checkInTimestamp);
                  const noTap = !l.checkOutTimestamp && !isToday(ci);
                  const active = !l.checkOutTimestamp && isToday(ci);
                  return (
                    <TableRow key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ height: 60 }}>

                      {/* Name */}
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                            style={{ background: active ? `linear-gradient(135deg,${navy},hsl(221,60%,35%))` : '#94a3b8' }}>
                            {(l.studentName||'S').split(',')[0]?.trim()[0]||'S'}
                          </div>
                          <span className="font-semibold text-slate-900 text-sm truncate max-w-[120px] sm:max-w-none">
                            {l.studentName || 'Student'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Student ID — formatted */}
                      <TableCell>
                        <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
                          style={{ background: '#f1f5f9', color: '#475569' }}>
                          {formatId(l.studentId)}
                        </span>
                      </TableCell>

                      {/* Dept */}
                      <TableCell>
                        <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg font-mono"
                          style={{ background: `${navy}0d`, color: navy }}>
                          {l.deptID}
                        </span>
                      </TableCell>

                      {/* Purpose */}
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                          {l.purpose}
                        </span>
                      </TableCell>

                      {/* Time In */}
                      <TableCell>
                        <p className="text-sm font-medium text-slate-700">{format(ci, 'h:mm a')}</p>
                        <p className="text-xs text-slate-400 font-medium">{format(ci, 'MMM d')}</p>
                      </TableCell>

                      {/* Time Out */}
                      <TableCell className="hidden sm:table-cell">
                        {l.checkOutTimestamp ? (
                          <div>
                            <p className="text-sm font-medium text-slate-700">{format(parseISO(l.checkOutTimestamp), 'h:mm a')}</p>
                            <p className="text-xs text-slate-400 font-medium">{format(parseISO(l.checkOutTimestamp), 'MMM d')}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">—</span>
                        )}
                      </TableCell>

                      {/* Duration */}
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm font-bold font-mono" style={{ color: l.checkOutTimestamp ? '#475569' : '#3b82f6' }}>
                          {formatDur(l.checkInTimestamp, l.checkOutTimestamp)}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-right pr-5">
                        {l.checkOutTimestamp ? (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-500">Done</span>
                        ) : noTap ? (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-red-50 text-red-500">No Tap</span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-blue-50 text-blue-600 animate-pulse">Active</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
