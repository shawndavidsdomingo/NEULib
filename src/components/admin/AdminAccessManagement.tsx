"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Trash2, Loader2, Key, Edit2, Check, X,
  Shield, BadgeCheck, Info, GraduationCap, ChevronDown, ChevronUp,
  Building2, UserCheck, UserX,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, getDocs, limit } from 'firebase/firestore';
import { UserRecord, DepartmentRecord, ProgramRecord } from '@/lib/firebase-schema';

function fullName(u: UserRecord) {
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ') || u.id;
}
function initials(u: UserRecord) {
  return [u.firstName?.[0], u.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'S';
}

export function AdminAccessManagement({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  // ── Registration form ──
  const [newFirstName,  setNewFirstName]  = useState('');
  const [newMiddleName, setNewMiddleName] = useState('');
  const [newLastName,   setNewLastName]   = useState('');
  const [newAdminId,    setNewAdminId]    = useState('');
  const [newEmail,      setNewEmail]      = useState('');
  const [newRole,       setNewRole]       = useState<'admin' | 'super_admin'>('admin');
  const [newDeptId,     setNewDeptId]     = useState('');
  const [newProgram,    setNewProgram]    = useState('');

  // ── Edit form ──
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editFirstName,  setEditFirstName]  = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editLastName,   setEditLastName]   = useState('');
  const [editEmail,      setEditEmail]      = useState('');
  const [editDeptId,     setEditDeptId]     = useState('');
  const [editProgram,    setEditProgram]    = useState('');

  // ── Promote student ──
  const [promoteSearch,  setPromoteSearch]  = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteResult,  setPromoteResult]  = useState<UserRecord | null>(null);
  const [promoteRole,    setPromoteRole]    = useState<'admin' | 'super_admin'>('admin');

  // ── Revoke ──
  const [staffToRevoke,     setStaffToRevoke]     = useState<{ id: string; name: string } | null>(null);
  const [isRevokeAlertOpen, setIsRevokeAlertOpen] = useState(false);

  // ── Collapse ──
  const [registryOpen, setRegistryOpen] = useState(true);

  const { toast } = useToast();
  const db = useFirestore();

  // Departments + programs
  const deptsRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptsRef);

  const newProgramsRef = useMemoFirebase(
    () => newDeptId ? query(collection(db, 'programs'), where('deptID', '==', newDeptId)) : null,
    [db, newDeptId]
  );
  const { data: newPrograms } = useCollection<ProgramRecord>(newProgramsRef);

  const editProgramsRef = useMemoFirebase(
    () => editDeptId ? query(collection(db, 'programs'), where('deptID', '==', editDeptId)) : null,
    [db, editDeptId]
  );
  const { data: editPrograms } = useCollection<ProgramRecord>(editProgramsRef);

  // All admin/super_admin users
  const adminsQuery = useMemoFirebase(
    () => query(collection(db, 'users'), where('role', 'in', ['admin', 'super_admin'])),
    [db]
  );
  const { data: adminList, isLoading } = useCollection<UserRecord>(adminsQuery);

  const sortedAdmins = useMemo(() =>
    (adminList || []).sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [adminList]
  );

  // ── Handlers ──
  const handleAddAdmin = () => {
    if (!isSuperAdmin) { toast({ title: "Unauthorized", variant: "destructive" }); return; }
    if (!newFirstName.trim() || !newLastName.trim() || !newAdminId.trim() || !newEmail.trim()) {
      toast({ title: "Validation Error", description: "First name, last name, Staff ID, and email are required.", variant: "destructive" });
      return;
    }
    const data: UserRecord = {
      id: newAdminId.trim(), firstName: newFirstName.trim(),
      middleName: newMiddleName.trim() || '', lastName: newLastName.trim(),
      email: newEmail.trim().toLowerCase(), role: newRole, status: 'active',
      deptID: newDeptId || '', program: newProgram || '',
    };
    setDocumentNonBlocking(doc(db, 'users', newAdminId.trim()), data, { merge: true });
    toast({ title: "Staff Registered", description: `${fullName(data)} is now authorized.` });
    setNewFirstName(''); setNewMiddleName(''); setNewLastName('');
    setNewAdminId(''); setNewEmail(''); setNewRole('admin');
    setNewDeptId(''); setNewProgram('');
  };

  const handleUpdateStaff = (id: string) => {
    if (!isSuperAdmin || !editFirstName.trim() || !editLastName.trim()) return;
    updateDocumentNonBlocking(doc(db, 'users', id), {
      firstName: editFirstName.trim(), middleName: editMiddleName.trim() || '',
      lastName: editLastName.trim(), email: editEmail.trim().toLowerCase(),
      deptID: editDeptId, program: editProgram,
    });
    setEditingId(null);
    toast({ title: "Update Success" });
  };

  const handleToggleSuper = (id: string, currentRole: string) => {
    if (!isSuperAdmin) { toast({ title: "Restricted Action", variant: "destructive" }); return; }
    const newR = currentRole === 'super_admin' ? 'admin' : 'super_admin';
    updateDocumentNonBlocking(doc(db, 'users', id), { role: newR });
    toast({ title: "Role Updated" });
  };

  const handleSearchStudent = async () => {
    if (!promoteSearch.trim()) return;
    setPromoteLoading(true);
    setPromoteResult(null);
    try {
      const term = promoteSearch.trim().toLowerCase();
      let snap = await getDocs(query(collection(db, 'users'), where('email', '==', term), limit(1)));
      if (snap.empty) snap = await getDocs(query(collection(db, 'users'), where('id', '==', promoteSearch.trim()), limit(1)));
      if (!snap.empty) setPromoteResult(snap.docs[0].data() as UserRecord);
      else toast({ title: "Not Found", description: "No user found with that email or Student ID.", variant: "destructive" });
    } catch { toast({ title: "Search Error", variant: "destructive" }); }
    finally { setPromoteLoading(false); }
  };

  const handlePromote = () => {
    if (!isSuperAdmin || !promoteResult) return;
    updateDocumentNonBlocking(doc(db, 'users', promoteResult.id), { role: promoteRole, status: 'active' });
    toast({ title: "Promoted!", description: `${fullName(promoteResult)} is now a ${promoteRole === 'super_admin' ? 'Super Admin' : 'Regular Admin'}.` });
    setPromoteResult(null); setPromoteSearch('');
  };

  const confirmRevoke = () => {
    if (!isSuperAdmin || !staffToRevoke) return;
    updateDocumentNonBlocking(doc(db, 'users', staffToRevoke.id), { role: 'student', status: 'active' });
    toast({ title: "Access Revoked", description: `${staffToRevoke.name} has been set back to Student.` });
    setIsRevokeAlertOpen(false); setStaffToRevoke(null);
  };

  const sortedNewPrograms = (newPrograms || []).sort((a, b) => a.code.localeCompare(b.code));
  const sortedEditPrograms = (editPrograms || []).sort((a, b) => a.code.localeCompare(b.code));
  const navy = 'hsl(221,72%,22%)';

  return (
    <div className="space-y-6">
      {/* ── Promote Student to Admin ── */}
      {isSuperAdmin && (
        <Card className="school-card border-emerald-100">
          <CardHeader className="px-5 py-4 border-b border-emerald-100" style={{ background: 'rgba(5,150,105,0.04)' }}>
            <CardTitle className="text-xl font-headline flex items-center gap-2 text-emerald-800">
              <UserCheck size={18} className="text-emerald-600" /> Promote Student to Admin
            </CardTitle>
            <CardDescription>Search by email or Student ID, then grant admin access.</CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search by email or student ID"
                value={promoteSearch}
                onChange={e => setPromoteSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchStudent()}
                className="rounded-xl bg-white"
              />
              <Button onClick={handleSearchStudent} disabled={promoteLoading} className="rounded-xl px-5 font-bold">
                {promoteLoading ? <Loader2 size={15} className="animate-spin" /> : 'Search'}
              </Button>
            </div>
            {promoteResult && (
              <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-emerald-200">
                <div>
                  <p className="font-bold text-slate-900">{fullName(promoteResult)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-mono">{promoteResult.email}</span>
                    {' · '}<span className="font-bold" style={{ color: navy }}>Current: {promoteResult.role}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={promoteRole} onValueChange={v => setPromoteRole(v as 'admin' | 'super_admin')}>
                    <SelectTrigger className="w-36 h-9 rounded-xl text-xs font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Regular Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handlePromote} className="h-9 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                    Promote
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Staff Access Registry ── */}
      <Card className="school-card">
        {/* Collapsible header */}
        <button
          className="w-full text-left"
          onClick={() => setRegistryOpen(o => !o)}
        >
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Key size={18} className="text-primary" />
              <div>
                <CardTitle className="text-xl font-headline">Staff Access Registry</CardTitle>
                <CardDescription className="mt-0.5">
                  {sortedAdmins.length} staff member{sortedAdmins.length !== 1 ? 's' : ''} registered
                </CardDescription>
              </div>
            </div>
            {registryOpen
              ? <ChevronUp size={18} className="text-slate-400 flex-shrink-0" />
              : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />}
          </CardHeader>
        </button>

        {registryOpen && (
          <div className="px-5 pt-5 space-y-4 border-b border-slate-100 pb-5">

            {/* Register new staff form */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Register New Staff</p>
              {/* Name row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'First Name *', val: newFirstName, set: setNewFirstName, ph: 'Juan' },
                  { label: 'Middle Name',  val: newMiddleName, set: setNewMiddleName, ph: 'Dela' },
                  { label: 'Last Name *',  val: newLastName,  set: setNewLastName,  ph: 'Cruz' },
                ].map(f => (
                  <div key={f.label} className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{f.label}</label>
                    <Input placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)} className="bg-white rounded-xl" />
                  </div>
                ))}
              </div>
              {/* ID + email + role */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Staff ID *</label>
                  <Input placeholder="XX-YYYYY-ZZ" value={newAdminId} onChange={e => setNewAdminId(e.target.value)} className="bg-white rounded-xl font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Email * (Google account)</label>
                  <Input placeholder="staff@neu.edu.ph" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="bg-white rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Role</label>
                  <Select value={newRole} onValueChange={v => setNewRole(v as 'admin' | 'super_admin')}>
                    <SelectTrigger className="bg-white rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Regular Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Dept + program */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1"><Building2 size={11} /> College / Department</label>
                  <Select value={newDeptId} onValueChange={v => { setNewDeptId(v); setNewProgram(''); }}>
                    <SelectTrigger className="bg-white rounded-xl h-10"><SelectValue placeholder="Select Department" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {(depts || []).sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
                        <SelectItem key={d.deptID} value={d.deptID} className="text-sm font-semibold">
                          <span className="font-bold mr-2 text-xs" style={{ color: navy }}>[{d.deptID}]</span>{d.departmentName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1"><GraduationCap size={11} /> Program</label>
                  <Select value={newProgram} onValueChange={setNewProgram} disabled={!newDeptId || sortedNewPrograms.length === 0}>
                    <SelectTrigger className="bg-white rounded-xl h-10 disabled:opacity-50"><SelectValue placeholder={!newDeptId ? 'Select Department first' : 'Select program'} /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {sortedNewPrograms.map(p => (
                        <SelectItem key={p.code} value={p.code} className="text-sm font-semibold">
                          <span className="font-bold mr-2 text-xs px-1.5 py-0.5 rounded" style={{ background: `${navy}0d`, color: navy }}>{p.code}</span>{p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAddAdmin} className="h-10 rounded-xl font-bold" disabled={!isSuperAdmin}>
                <UserPlus size={16} className="mr-2" /> Register Staff
              </Button>
            </div>
          </div>
        )}

        {/* Registry table — always visible */}
        <CardContent className="p-5 pt-4">
            {/* Registry table */}
            <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold py-3 pl-5">Name</TableHead>
                    <TableHead className="font-bold py-3">Staff ID</TableHead>
                    <TableHead className="font-bold py-3">Email</TableHead>
                    <TableHead className="font-bold py-3">Dept</TableHead>
                    <TableHead className="font-bold py-3">Role</TableHead>
                    <TableHead className="font-bold py-3 text-center">Super</TableHead>
                    <TableHead className="text-right font-bold py-3 pr-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="animate-spin inline-block mr-2" />Loading...</TableCell></TableRow>
                  ) : sortedAdmins.length > 0 ? sortedAdmins.map(admin => (
                    <TableRow key={admin.id} className="hover:bg-slate-50">
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${admin.role === 'super_admin' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                            {initials(admin)}
                          </div>
                          {editingId === admin.id ? (
                            <div className="space-y-1">
                              <div className="flex gap-1">
                                <Input value={editFirstName}  onChange={e => setEditFirstName(e.target.value)}  className="h-7 w-24 text-xs rounded-lg" placeholder="First" autoFocus />
                                <Input value={editMiddleName} onChange={e => setEditMiddleName(e.target.value)} className="h-7 w-20 text-xs rounded-lg" placeholder="Mid" />
                                <Input value={editLastName}   onChange={e => setEditLastName(e.target.value)}   className="h-7 w-24 text-xs rounded-lg" placeholder="Last" />
                              </div>
                              <div className="flex gap-1">
                                <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-7 text-xs rounded-lg flex-1" placeholder="email" />
                              </div>
                              <div className="flex gap-1">
                                <Select value={editDeptId} onValueChange={v => { setEditDeptId(v); setEditProgram(''); }}>
                                  <SelectTrigger className="h-7 w-28 text-xs rounded-lg"><SelectValue placeholder="Dept" /></SelectTrigger>
                                  <SelectContent className="max-h-48">
                                    {(depts || []).map(d => <SelectItem key={d.deptID} value={d.deptID} className="text-xs">[{d.deptID}]</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Select value={editProgram} onValueChange={setEditProgram} disabled={!editDeptId}>
                                  <SelectTrigger className="h-7 w-28 text-xs rounded-lg"><SelectValue placeholder="Program" /></SelectTrigger>
                                  <SelectContent className="max-h-48">
                                    {sortedEditPrograms.map(p => <SelectItem key={p.code} value={p.code} className="text-xs">{p.code}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{fullName(admin)}</p>
                              {admin.program && <p className="text-xs text-slate-400 font-mono">{admin.program}</p>}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-[11px] text-primary font-bold">{admin.id}</TableCell>
                      <TableCell className="text-xs text-slate-500">{admin.email || '—'}</TableCell>

                      {/* Dept */}
                      <TableCell>
                        {admin.deptID
                          ? <span className="font-bold text-xs px-2 py-1 rounded-lg" style={{ background: `${navy}0d`, color: navy }}>{admin.deptID}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </TableCell>

                      {/* Role badge */}
                      <TableCell>
                        {admin.role === 'super_admin'
                          ? <Badge className="bg-primary/10 text-primary border-none text-[9px] uppercase tracking-widest px-2 py-1 rounded-full gap-1 font-bold"><BadgeCheck size={10} /> Super Admin</Badge>
                          : <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px] uppercase tracking-widest px-2 py-1 rounded-full gap-1 font-bold"><Shield size={10} /> Staff</Badge>}
                      </TableCell>

                      {/* Super toggle */}
                      <TableCell className="text-center">
                        <Switch checked={admin.role === 'super_admin'} onCheckedChange={() => handleToggleSuper(admin.id, admin.role)} disabled={!isSuperAdmin} />
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1">
                          {editingId === admin.id ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleUpdateStaff(admin.id)}><Check size={15} /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(null)}><X size={15} /></Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary" onClick={() => {
                                setEditingId(admin.id);
                                setEditFirstName(admin.firstName || '');
                                setEditMiddleName(admin.middleName || '');
                                setEditLastName(admin.lastName || '');
                                setEditEmail(admin.email || '');
                                setEditDeptId(admin.deptID || '');
                                setEditProgram(admin.program || '');
                              }}><Edit2 size={15} /></Button>
                              {isSuperAdmin && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-400 hover:text-red-500 hover:bg-red-50" title="Revoke admin — set back to student" onClick={() => {
                                  setStaffToRevoke({ id: admin.id, name: fullName(admin) });
                                  setIsRevokeAlertOpen(true);
                                }}><UserX size={15} /></Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-400 italic">No staff registered yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
      </Card>

      {/* Revoke alert */}
      <AlertDialog open={isRevokeAlertOpen} onOpenChange={setIsRevokeAlertOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-headline font-bold text-destructive">Revoke Admin Access</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 text-lg">
              Revoke admin privileges for <strong>{staffToRevoke?.name}</strong>?
              Their role will be set back to <strong>Student</strong> — account and logs are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-6">
            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke} className="bg-destructive text-white rounded-xl font-bold px-8">
              Confirm Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}