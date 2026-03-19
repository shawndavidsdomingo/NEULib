"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Loader2, GraduationCap, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, Upload, FileDown, ShieldOff, ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { UserRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';
import { writeAuditLog } from '@/lib/audit-logger';
import { ImportStudentDialog } from './ImportStudentDialog';
import { SuccessCard } from '@/components/ui/SuccessCard';

interface UserManagementProps { isSuperAdmin: boolean; }

const navy = 'hsl(221,72%,22%)';

// ── Sort helper: STAFF/Library pinned to top, rest alphabetical ──────────────
function sortWithStaffPinned<T>(
  items: T[],
  getKey: (item: T) => string,
  dir: 'asc' | 'desc' = 'asc'
): T[] {
  return [...items].sort((a, b) => {
    const ka = getKey(a);
    const kb = getKey(b);
    const aStaff = ka === 'LIBRARY' || ka.toUpperCase().includes('STAFF');
    const bStaff = kb === 'LIBRARY' || kb.toUpperCase().includes('STAFF');
    if (aStaff && !bStaff) return -1;
    if (!aStaff && bStaff) return 1;
    const cmp = ka.localeCompare(kb);
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function UserManagement({ isSuperAdmin }: UserManagementProps) {
  const [searchTerm,    setSearchTerm]    = useState('');
  const [deptFilter,    setDeptFilter]    = useState('All Departments');
  const [statusFilter,  setStatusFilter]  = useState('All Status');
  const [programFilter, setProgramFilter] = useState('All Programs');
  const [roleFilter,    setRoleFilter]    = useState('All');
  const [sortField,     setSortField]     = useState<'id' | 'lastName' | 'deptID' | 'program' | 'role'>('lastName');
  const [sortOrder,     setSortOrder]     = useState<'asc' | 'desc'>('asc');
  const [isImportOpen,  setIsImportOpen]  = useState(false);
  const [successCard,   setSuccessCard]   = useState<{ title: string; description: string; color?: 'green' | 'navy' | 'amber' } | null>(null);

  const { toast } = useToast();
  const db        = useFirestore();
  const { user }  = useUser();

  // Current actor's role — needed for permission enforcement
  const { data: currentUsers } = useCollection<UserRecord>(
    useMemoFirebase(() => user?.email
      ? query(collection(db, 'users'), where('email', '==', user.email))
      : null, [db, user?.email])
  );
  const currentActorRole = currentUsers?.[0]?.role ?? (isSuperAdmin ? 'super_admin' : 'admin');

  const deptsRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: dbDepartments } = useCollection<DepartmentRecord>(deptsRef);

  const studentsRef = useMemoFirebase(
    () => query(collection(db, 'users'), where('role', 'in', ['student', 'admin', 'super_admin'])),
    [db]
  );
  const { data: students, isLoading } = useCollection<UserRecord>(studentsRef);

  const programsQuery = useMemoFirebase(() => collection(db, 'programs'), [db]);
  const { data: allPrograms } = useCollection<ProgramRecord>(programsQuery);

  const programMap = useMemo(() => {
    const m: Record<string, ProgramRecord> = {};
    allPrograms?.forEach(p => {
      m[`${p.deptID}::${p.code}`] = p;
      m[`${p.deptID}::${p.name}`] = p;
    });
    return m;
  }, [allPrograms]);

  // ── Pinned dept/program dropdown lists ───────────────────────────────────
  const sortedDepts = useMemo(() => {
    if (!dbDepartments) return [];
    return sortWithStaffPinned(dbDepartments, d => d.deptID);
  }, [dbDepartments]);

  const deptPrograms = useMemo(() => {
    if (!allPrograms || deptFilter === 'All Departments') return [];
    const progs = allPrograms.filter(p => p.deptID === deptFilter);
    return sortWithStaffPinned(progs, p => p.code);
  }, [allPrograms, deptFilter]);

  // ── Role helpers ──────────────────────────────────────────────────────────
  const isStaffRecord = (u: UserRecord) =>
    u.role === 'admin' || u.role === 'super_admin' || (u.program || '').toUpperCase().includes('STAFF');

  const formatFullName = (u: UserRecord) => `${(u.lastName || '').toUpperCase()}, ${u.firstName}`;

  // ── Filtered + sorted students ────────────────────────────────────────────
  const processedStudents = useMemo(() => {
    if (!students) return [];
    return students
      .filter(s => {
        const search = searchTerm.toLowerCase();
        const matchSearch =
          formatFullName(s).toLowerCase().includes(search) ||
          (s.email || '').toLowerCase().includes(search) ||
          (s.id || '').toLowerCase().includes(search) ||
          (s.program || '').toLowerCase().includes(search);
        const matchDept    = deptFilter    === 'All Departments' || s.deptID   === deptFilter;
        const matchStatus  = statusFilter  === 'All Status'
          || (statusFilter === 'Active'  && s.status !== 'blocked')
          || (statusFilter === 'Blocked' && s.status === 'blocked');
        const matchProgram = programFilter === 'All Programs' || s.program === programFilter;
        const matchRole    = roleFilter    === 'All'
          || (roleFilter === 'Student' && !isStaffRecord(s))
          || (roleFilter === 'Staff'   && isStaffRecord(s));
        return matchSearch && matchDept && matchStatus && matchProgram && matchRole;
      })
      .sort((a, b) => {
        let vA = '', vB = '';
        if (sortField === 'role') {
          vA = isStaffRecord(a) ? 'Staff' : 'Student';
          vB = isStaffRecord(b) ? 'Staff' : 'Student';
        } else if (sortField === 'program') {
          vA = (programMap[`${a.deptID}::${a.program}`]?.name || a.program || '').toLowerCase();
          vB = (programMap[`${b.deptID}::${b.program}`]?.name || b.program || '').toLowerCase();
        } else {
          vA = ((a as any)[sortField] || '').toLowerCase();
          vB = ((b as any)[sortField] || '').toLowerCase();
        }
        // Pin STAFF/Library to top for dept sort
        if (sortField === 'deptID') {
          const aS = vA === 'library' || vA.includes('staff');
          const bS = vB === 'library' || vB.includes('staff');
          if (aS && !bS) return -1;
          if (!aS && bS) return 1;
        }
        return sortOrder === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      });
  }, [students, searchTerm, deptFilter, statusFilter, programFilter, sortField, sortOrder, roleFilter, programMap]);

  // ── Block/unblock with permission catch ───────────────────────────────────
  const toggleBlockStatus = (target: UserRecord) => {
    const targetIsAdmin = target.role === 'admin' || target.role === 'super_admin';
    const actorIsAdmin  = currentActorRole === 'admin'; // not super_admin

    // Permission catch: regular admins cannot block/unblock other admins
    if (targetIsAdmin && actorIsAdmin) {
      toast({
        title: 'Permission Denied',
        description: 'Only Super Administrators can block or unblock other Admins.',
        variant: 'destructive',
      });
      return;
    }

    // Super admins cannot lower their own role or block themselves
    if (target.role === 'super_admin' && target.id === currentUsers?.[0]?.id) {
      toast({
        title: 'Permission Denied',
        description: 'Super Administrators cannot modify their own access.',
        variant: 'destructive',
      });
      return;
    }

    const newStatus = target.status === 'blocked' ? 'active' : 'blocked';
    updateDocumentNonBlocking(doc(db, 'users', target.id), { status: newStatus });
    writeAuditLog(db, user, newStatus === 'blocked' ? 'user.block' : 'user.unblock', {
      targetId:   target.id,
      targetName: `${target.firstName} ${target.lastName}`,
      detail:     `Library access set to ${newStatus}`,
    });
    setSuccessCard({
      title: newStatus === 'blocked' ? 'Access Blocked' : 'Access Restored',
      description: `${target.firstName} ${target.lastName}'s library access is now ${newStatus === 'blocked' ? 'blocked' : 'active'}.`,
      color: newStatus === 'blocked' ? 'amber' : 'green',
    });
  };

  // ── Sort helpers ──────────────────────────────────────────────────────────
  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="ml-1.5 opacity-40" />;
    return sortOrder === 'asc'
      ? <ArrowUp   size={13} className="ml-1.5" style={{ color: navy }} />
      : <ArrowDown size={13} className="ml-1.5" style={{ color: navy }} />;
  };

  const exportCSV = () => {
    if (!students?.length) { toast({ title: 'No data to export', variant: 'destructive' }); return; }
    const headers = ['id', 'firstName', 'middleName', 'lastName', 'email', 'deptID', 'program', 'role', 'status'];
    const rows = students.map(s => [
      s.id, s.firstName || '', s.middleName || '', s.lastName || '',
      s.email || '', s.deptID || '', s.program || '', s.role || '', s.status || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `NEU_Registry_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setSuccessCard({
      title: 'CSV Exported',
      description: `${students.length} registry records downloaded successfully.`,
      color: 'navy',
    });
  };

  const thStyle = 'font-bold text-sm uppercase tracking-wide text-slate-500';

  return (
    <>
      {successCard && (
        <SuccessCard
          title={successCard.title}
          description={successCard.description}
          color={successCard.color}
          onClose={() => setSuccessCard(null)}
        />
      )}
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <Card className="school-card">
        <CardHeader className="p-5 sm:p-6 border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
                <GraduationCap size={18} />
              </div>
              <div>
                <CardTitle className="font-bold text-slate-900 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
                  Library Registry
                </CardTitle>
                <CardDescription className="text-slate-400 font-semibold text-xs uppercase tracking-wide mt-0.5">
                  Immutable Academic Records
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Search name, ID, program..."
                  className="pl-9 w-48 sm:w-56 h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>

              {/* Dept — pinned LIBRARY/STAFF */}
              <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setProgramFilter('All Programs'); }}>
                <SelectTrigger className="w-36 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Filter size={13} className="flex-shrink-0" style={{ color: navy }} />
                    <span className="truncate font-bold" style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.8rem' }}>
                      {deptFilter === 'All Departments' ? 'Dept' : deptFilter}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="All Departments" className="font-semibold">All Departments</SelectItem>
                  {sortedDepts.map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="font-semibold">
                      <span className="font-bold mr-2" style={{ fontFamily: "'DM Mono',monospace" }}>{d.deptID}</span>
                      {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Program — only when dept selected, pinned STAFF */}
              {deptFilter !== 'All Departments' && (
                <Select value={programFilter} onValueChange={setProgramFilter}>
                  <SelectTrigger className="w-40 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                    <SelectValue placeholder="All Programs" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-60">
                    <SelectItem value="All Programs" className="font-semibold">All Programs</SelectItem>
                    {deptPrograms.map(p => (
                      <SelectItem key={p.code} value={p.code} className="font-semibold text-sm py-2">
                        <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded whitespace-nowrap inline-block"
                          style={{ background: 'hsl(221,72%,22%,0.08)', color: 'hsl(221,72%,22%)', fontFamily: "'DM Mono',monospace" }}>
                          {p.code}
                        </span>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Status */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="All Status"  className="font-semibold">All Status</SelectItem>
                  <SelectItem value="Active"       className="font-semibold">Active</SelectItem>
                  <SelectItem value="Blocked"      className="font-semibold">Blocked</SelectItem>
                </SelectContent>
              </Select>

              {/* Role */}
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-36 h-10 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="All"     className="font-semibold">All Roles</SelectItem>
                  {/* Pinned: Staff first */}
                  <SelectItem value="Staff"   className="font-semibold">Staff / Faculty</SelectItem>
                  <SelectItem value="Student" className="font-semibold">Student</SelectItem>
                </SelectContent>
              </Select>

              {/* Export + Import */}
              <div className="flex items-center gap-1">
                <button onClick={() => setIsImportOpen(true)}
                  className="h-10 px-3 rounded-xl font-semibold text-sm gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center transition-all rounded-r-none border-r-0">
                  <Upload size={14} /> Import
                </button>
                <button onClick={exportCSV}
                  className="h-10 px-3 rounded-xl font-semibold text-sm gap-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center transition-all rounded-l-none">
                  <FileDown size={14} /> Export
                </button>
              </div>
            </div>
          </div>
          <p className="text-slate-400 text-xs font-medium mt-3">
            {processedStudents.length} record{processedStudents.length !== 1 ? 's' : ''} found
            <span className="ml-2 text-amber-500 font-semibold">· Read-only registry — use Credential Requests to edit data</span>
          </p>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/70">
                {/* Columns: Student | ID Number | Dept | Program | Role | Access | Library Access */}
                <TableRow className="border-b border-slate-100 h-12">
                  <TableHead className={`pl-5 cursor-pointer hover:bg-slate-100/60 ${thStyle}`} onClick={() => toggleSort('lastName')}>
                    <div className="flex items-center">Student <SortIcon field="lastName" /></div>
                  </TableHead>
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 ${thStyle}`} onClick={() => toggleSort('id')}>
                    <div className="flex items-center">ID Number <SortIcon field="id" /></div>
                  </TableHead>
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 ${thStyle}`} onClick={() => toggleSort('deptID')}>
                    <div className="flex items-center">Dept <SortIcon field="deptID" /></div>
                  </TableHead>
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 ${thStyle} hidden md:table-cell`} onClick={() => toggleSort('program')}>
                    <div className="flex items-center">Program <SortIcon field="program" /></div>
                  </TableHead>
                  <TableHead className={`cursor-pointer hover:bg-slate-100/60 ${thStyle}`} onClick={() => toggleSort('role')}>
                    Role <SortIcon field="role" />
                  </TableHead>
                  <TableHead className={thStyle}>Access</TableHead>
                  {/* Library Access toggle — the only action allowed */}
                  <TableHead className={`text-center ${thStyle}`}>Library Access</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <Loader2 className="animate-spin inline-block" style={{ color: navy }} size={24} />
                    </TableCell>
                  </TableRow>
                ) : processedStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center text-slate-400 text-sm italic font-medium">
                      No matching records.
                    </TableCell>
                  </TableRow>
                ) : (
                  processedStudents.map(s => {
                    const programEntry = programMap[`${s.deptID}::${s.program}`] || null;
                    const isBlocked    = s.status === 'blocked';
                    const isAdmin      = s.role === 'admin' || s.role === 'super_admin';
                    const isSuperAdminRecord = s.role === 'super_admin';
                    const isSelf       = s.id === currentUsers?.[0]?.id;

                    // Only superadmins can block. Admins see nothing.
                    // Superadmins cannot block themselves or other superadmins.
                    const canToggle =
                      isSuperAdmin &&          // must be super_admin actor
                      !isSuperAdminRecord &&   // cannot touch another super_admin
                      !isSelf;                 // cannot block yourself

                    return (
                      <TableRow key={s.id}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                        style={{ height: '68px' }}>

                        {/* Student name + email */}
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                              style={{ background: isBlocked ? '#94a3b8' : `linear-gradient(135deg,${navy},hsl(221,60%,35%))` }}>
                              {(s.firstName || 'S')[0]}{(s.lastName || 'S')[0]}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm leading-tight">{formatFullName(s)}</p>
                              <p className="text-slate-400 text-xs font-medium mt-0.5 truncate max-w-[180px]">{s.email}</p>
                            </div>
                          </div>
                        </TableCell>

                        {/* ID */}
                        <TableCell>
                          <span className="font-bold text-sm" style={{ color: navy, fontFamily: "'DM Mono',monospace" }}>
                            {s.id}
                          </span>
                        </TableCell>

                        {/* Dept */}
                        <TableCell>
                          <span className="font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                            style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                            {s.deptID}
                          </span>
                        </TableCell>

                        {/* Program */}
                        <TableCell className="hidden md:table-cell">
                          {programEntry ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-xs px-2.5 py-1 rounded-lg w-fit whitespace-nowrap"
                                style={{ background: 'hsl(262,83%,58%,0.1)', color: 'hsl(262,83%,45%)', fontFamily: "'DM Mono',monospace" }}>
                                {programEntry.code}
                              </span>
                              <span className="text-slate-500 text-xs font-medium leading-tight max-w-[200px] truncate" title={programEntry.name}>
                                {programEntry.name}
                              </span>
                            </div>
                          ) : s.program ? (
                            <span className="text-slate-400 text-xs font-medium italic truncate max-w-[160px] block">{s.program}</span>
                          ) : (
                            <span className="text-slate-300 text-xs italic">—</span>
                          )}
                        </TableCell>

                        {/* Role */}
                        <TableCell>
                          {isStaffRecord(s) ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                              style={{ background: 'hsl(221,72%,22%,0.08)', color: 'hsl(221,72%,22%)' }}>
                              {s.role === 'super_admin' ? 'Super Admin' : 'Staff'}
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                              style={{ background: 'hsl(43,85%,52%,0.12)', color: 'hsl(38,90%,35%)' }}>
                              Student
                            </span>
                          )}
                        </TableCell>

                        {/* Access status */}
                        <TableCell>
                          {isBlocked ? (
                            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-500 border border-red-100">
                              Blocked
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-3 py-1.5 rounded-full border"
                              style={{ background: `${navy}08`, color: navy, borderColor: `${navy}20` }}>
                              Active
                            </span>
                          )}
                        </TableCell>

                        {/* Library Access toggle — only superadmins see this */}
                        <TableCell className="text-center">
                          {!isSuperAdmin ? null : canToggle ? (
                            <button
                              onClick={() => toggleBlockStatus(s)}
                              title={isBlocked ? 'Unblock — restore library access' : 'Block — revoke library access'}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                              style={isBlocked
                                ? { background: 'rgba(5,150,105,0.08)', color: '#059669', borderColor: 'rgba(5,150,105,0.2)' }
                                : { background: 'rgba(239,68,68,0.07)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }
                              }>
                              {isBlocked
                                ? <><ShieldCheck size={13} /> Unblock</>
                                : <><ShieldOff   size={13} /> Block</>
                              }
                            </button>
                          ) : (
                            <span className="text-slate-200 text-xs font-medium">
                              {isSelf ? 'Yourself' : isSuperAdminRecord ? 'Protected' : '—'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ImportStudentDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
    </div>
    </>
  );
}