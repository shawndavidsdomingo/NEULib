"use client";

import { useMemo, useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, parseISO, isToday, differenceInMinutes, startOfDay } from 'date-fns';
import { Loader2, Users, Search, Filter, Radio, Clock, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { LibraryLogRecord, DepartmentRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.88)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

interface ProgramRecord { id: string; deptID: string; code: string; name: string; }
interface VisitPurpose  { id: string; label: string; active: boolean; }

export function CurrentVisitors() {
  const db  = useFirestore();
  const [now, setNow] = useState(new Date());

  const [search,         setSearch]         = useState('');
  const [deptFilter,     setDeptFilter]     = useState('All Departments');
  const [programFilter,  setProgramFilter]  = useState('All Programs');
  const [purposeFilter,  setPurposeFilter]  = useState('All Purposes');
  const [statusFilter,   setStatusFilter]   = useState('Inside');

  const [sortField, setSortField] = useState<'studentName' | 'studentId' | 'deptID' | 'purpose' | 'checkInTimestamp' | 'duration'>('checkInTimestamp');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="ml-1 opacity-30 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={11} className="ml-1 inline" style={{ color: navy }} />
      : <ArrowDown size={11} className="ml-1 inline" style={{ color: navy }} />;
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayStart = useMemo(() => startOfDay(new Date()).toISOString(), []);

  const logsQuery = useMemoFirebase(
    () => query(
      collection(db, 'library_logs'),
      where('checkInTimestamp', '>=', todayStart),
      orderBy('checkInTimestamp', 'desc')
    ),
    [db, todayStart]
  );
  const { data: allLogs, isLoading } = useCollection<LibraryLogRecord>(logsQuery);

  const deptRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptRef);

  const programsRef = useMemoFirebase(() => collection(db, 'programs'), [db]);
  const { data: allPrograms } = useCollection<ProgramRecord>(programsRef);

  const purposesRef = useMemoFirebase(() => collection(db, 'visit_purposes'), [db]);
  const { data: purposeDocs } = useCollection<VisitPurpose>(purposesRef);

  const livePurposes = useMemo(() => {
    if (!purposeDocs || purposeDocs.length === 0)
      return ['All Purposes', 'Reading Books', 'Research', 'Computer Use', 'Assignments'];
    return ['All Purposes', ...purposeDocs.map(p => p.label).sort()];
  }, [purposeDocs]);

  // 1. SORT PROGRAMS: Staff/Faculty first, then ID A-Z
  const deptPrograms = useMemo(() => {
    if (!allPrograms || deptFilter === 'All Departments') return [];
    return allPrograms
      .filter(p => p.deptID === deptFilter)
      .sort((a, b) => {
        const aIsStaff = a.code.toUpperCase().includes('STAFF') ? 0 : 1;
        const bIsStaff = b.code.toUpperCase().includes('STAFF') ? 0 : 1;
        if (aIsStaff !== bIsStaff) return aIsStaff - bIsStaff;
        return a.code.localeCompare(b.code);
      });
  }, [allPrograms, deptFilter]);

  // Reset program filter when dept changes
  useEffect(() => { setProgramFilter('All Programs'); }, [deptFilter]);

  const todayLogs       = useMemo(() => allLogs ?? [], [allLogs]);
  const currentlyInside = useMemo(() =>
    todayLogs.filter(l => !l.checkOutTimestamp && isToday(parseISO(l.checkInTimestamp))),
    [todayLogs]
  );

  // 2. FILTER LOGS: Updated to include Program matching
  const filteredLogs = useMemo(() => {
    const s = search.toLowerCase();
    return todayLogs.filter(l => {
      const matchSearch  = !s || (l.studentName || '').toLowerCase().includes(s) || l.studentId.toLowerCase().includes(s);
      const matchDept    = deptFilter    === 'All Departments' || l.deptID   === deptFilter;
      const matchPurpose = purposeFilter === 'All Purposes'    || l.purpose  === purposeFilter;
      
      // Basic check: Does the studentId or a metadata field contain the program code?
      const matchProgram = programFilter === 'All Programs' || l.studentId.toUpperCase().includes(programFilter.toUpperCase());

      const matchStatus  = statusFilter === 'All'
        || (statusFilter === 'Inside'    && !l.checkOutTimestamp && isToday(parseISO(l.checkInTimestamp)))
        || (statusFilter === 'Completed' && !!l.checkOutTimestamp);
        
      return matchSearch && matchDept && matchPurpose && matchStatus && matchProgram;
    });
  }, [todayLogs, search, deptFilter, programFilter, purposeFilter, statusFilter]);

  const formatDur = (checkIn: string, checkOut?: string) => {
    const diff = differenceInMinutes(checkOut ? parseISO(checkOut) : now, parseISO(checkIn));
    return diff < 60 ? `${diff}m` : `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort((a, b) => {
      let va = '', vb = '';
      if      (sortField === 'studentName')      { va = a.studentName || ''; vb = b.studentName || ''; }
      else if (sortField === 'studentId')        { va = a.studentId;  vb = b.studentId; }
      else if (sortField === 'deptID')           { va = a.deptID;     vb = b.deptID; }
      else if (sortField === 'purpose')          { va = a.purpose;    vb = b.purpose; }
      else if (sortField === 'checkInTimestamp') { va = a.checkInTimestamp; vb = b.checkInTimestamp; }
      else if (sortField === 'duration') {
        const da  = differenceInMinutes(a.checkOutTimestamp ? parseISO(a.checkOutTimestamp) : now, parseISO(a.checkInTimestamp));
        const db2 = differenceInMinutes(b.checkOutTimestamp ? parseISO(b.checkOutTimestamp) : now, parseISO(b.checkInTimestamp));
        return sortDir === 'asc' ? da - db2 : db2 - da;
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredLogs, sortField, sortDir, now]);

  const thStyle = "text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80";

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* Header Card */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <Users size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Library Presence
              </h2>
              <p className="text-slate-400 font-medium text-sm mt-0.5">Today's visitation log</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-center px-3 py-1.5 rounded-xl" style={{ background: `${navy}08` }}>
              <p className="font-bold text-lg" style={{ color: navy }}>{currentlyInside.length}</p>
              <p className="text-slate-400 font-semibold" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Inside</p>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl" style={{ background: 'rgba(5,150,105,0.07)' }}>
              <p className="font-bold text-sm text-emerald-600">{todayLogs.length}</p>
              <p className="text-slate-400 font-semibold" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
              <Radio size={10} className="animate-pulse" /> Live
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search name or ID..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium" />
          </div>

          {/* 3. SORT DEPTS: Library First, then ID A-Z */}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Filter size={11} style={{ color: navy, flexShrink: 0 }} />
                <span className="truncate font-bold">
                  {deptFilter === 'All Departments' ? 'All Colleges' : deptFilter}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="All Departments" className="font-semibold text-sm">All Colleges</SelectItem>
              {depts?.slice().sort((a, b) => {
                if (a.deptID === 'LIBRARY') return -1;
                if (b.deptID === 'LIBRARY') return 1;
                return a.deptID.localeCompare(b.deptID);
              }).map(d => (
                <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                  <span className="font-bold mr-1.5" style={{ color: navy }}>[{d.deptID}]</span>
                  {d.departmentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Program filter: already sorted by useMemo above */}
          {deptFilter !== 'All Departments' && deptPrograms.length > 0 && (
            <Select value={programFilter} onValueChange={setProgramFilter}>
              <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
                <span className="truncate font-bold" style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.7rem' }}>
                  {programFilter === 'All Programs' ? 'All Programs' : programFilter}
                </span>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="All Programs" className="font-semibold text-sm">All Programs</SelectItem>
                {deptPrograms.map(p => (
                  <SelectItem key={p.code} value={p.code} className="font-semibold text-sm">
                    <span className="font-bold mr-1.5 font-mono" style={{ color: navy }}>{p.code}</span>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={purposeFilter} onValueChange={setPurposeFilter}>
            <SelectTrigger className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {livePurposes.map(p => (
                <SelectItem key={p} value={p} className="font-semibold text-sm">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {(['All', 'Inside', 'Completed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={statusFilter === s ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                {s}
              </button>
            ))}
          </div>

          <p className="text-slate-400 text-xs font-medium ml-auto">
            {filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Table Card */}
      <div style={card} className="overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm font-medium">Synchronizing presence data...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center">
            <Clock size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm font-medium">No records match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-11 border-slate-100">
                  <TableHead className={`pl-5 cursor-pointer select-none hover:bg-slate-100 ${thStyle}`} onClick={() => toggleSort('studentName')}>
                    Student <SortIcon field="studentName" />
                  </TableHead>
                  <TableHead className={`cursor-pointer select-none hover:bg-slate-100 ${thStyle}`} onClick={() => toggleSort('studentId')}>
                    ID <SortIcon field="studentId" />
                  </TableHead>
                  <TableHead className={`cursor-pointer select-none hover:bg-slate-100 ${thStyle}`} onClick={() => toggleSort('deptID')}>
                    Dept <SortIcon field="deptID" />
                  </TableHead>
                  <TableHead className={`cursor-pointer select-none hover:bg-slate-100 ${thStyle}`} onClick={() => toggleSort('purpose')}>
                    Purpose <SortIcon field="purpose" />
                  </TableHead>
                  <TableHead className={`cursor-pointer select-none hover:bg-slate-100 ${thStyle}`} onClick={() => toggleSort('checkInTimestamp')}>
                    Time In <SortIcon field="checkInTimestamp" />
                  </TableHead>
                  <TableHead className={`cursor-pointer select-none hover:bg-slate-100 ${thStyle}`} onClick={() => toggleSort('duration')}>
                    Time Inside <SortIcon field="duration" />
                  </TableHead>
                  <TableHead className={`text-right pr-5 ${thStyle}`}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLogs.map(log => {
                  const isInside = !log.checkOutTimestamp;
                  const dur = formatDur(log.checkInTimestamp, log.checkOutTimestamp);
                  return (
                    <TableRow key={log.id}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                      style={{ height: '60px' }}>

                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                            style={{ background: isInside ? `linear-gradient(135deg,${navy},hsl(221,60%,35%))` : '#94a3b8' }}>
                            {(log.studentName || 'S').split(',')[0]?.trim()[0] || 'S'}
                          </div>
                          <span className="font-semibold text-slate-900 text-base truncate max-w-[160px]">
                            {log.studentName || 'Scholar'}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="font-bold text-lg" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {log.studentId}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="font-bold text-xs px-2.5 py-1 rounded-lg whitespace-nowrap"
                          style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                          {log.deptID}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="text-sm font-semibold px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600">
                          {log.purpose}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="text-base font-medium text-slate-600">
                          {format(parseISO(log.checkInTimestamp), 'h:mm a')}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="font-bold text-base" style={{ color: isInside ? '#3b82f6' : '#64748b', fontFamily: "'DM Mono',monospace" }}>
                          {dur}
                        </span>
                      </TableCell>

                      <TableCell className="text-right pr-5">
                        {isInside ? (
                          <span className="text-sm font-bold px-3 py-1.5 rounded-full flex items-center gap-1 ml-auto w-fit"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                            Inside
                          </span>
                        ) : (
                          <span className="text-sm font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-500">
                            Done
                          </span>
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