"use client";

import { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Building2, Plus, Trash2, Loader2, Search, DatabaseBackup,
  ChevronRight, ChevronDown, GraduationCap, X, Edit2, Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore, useCollection, useMemoFirebase,
  setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking,
} from '@/firebase';
import { setDoc, collection, doc } from 'firebase/firestore';
import {
  DepartmentRecord, ProgramRecord, DEPARTMENTS, getProgramSeedData,
} from '@/lib/firebase-schema';
import { SuccessCard } from '@/components/ui/SuccessCard';

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.88)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

export function DepartmentManagement() {
  const [newDeptId, setNewDeptId] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  const [newProgName, setNewProgName] = useState('');
  const [newProgCode, setNewProgCode] = useState('');

  const [editingProgId, setEditingProgId] = useState<string | null>(null);
  const [editProgName, setEditProgName] = useState('');
  const [editProgCode, setEditProgCode] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean; type: 'dept' | 'program'; id: string; name: string;
  } | null>(null);

  const [successCard, setSuccessCard] = useState<{ 
    title: string; description: string; color?: 'green' | 'navy' | 'amber' 
  } | null>(null);

  const { toast } = useToast();
  const db = useFirestore();

  const deptRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts, isLoading: isDepsLoading } = useCollection<DepartmentRecord>(deptRef);

  const programsRef = useMemoFirebase(() => collection(db, 'programs'), [db]);
  const { data: allPrograms, isLoading: isProgsLoading } = useCollection<ProgramRecord>(programsRef);

  const deptPrograms = useMemo(() => {
    if (!allPrograms || !expandedDept) return [];
    return allPrograms
      .filter(p => p.deptID === expandedDept)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [allPrograms, expandedDept]);

  const handleAddDept = () => {
    if (!newDeptId.trim() || !newDeptName.trim()) {
      toast({ title: "Required", description: "Code and name are required.", variant: "destructive" }); 
      return;
    }
    const id = newDeptId.trim().toUpperCase();
    setDocumentNonBlocking(doc(db, 'departments', id), { 
      deptID: id, 
      departmentName: newDeptName.trim() 
    }, { merge: true });
    
    setSuccessCard({ 
      title: 'Department Added', 
      description: `${newDeptName.trim()} (${id}) has been added.`, 
      color: 'green' 
    });
    setNewDeptId(''); 
    setNewDeptName('');
  };

  const handleDeleteDept = (id: string, name: string) => {
    setConfirmModal({ open: true, type: 'dept', id, name });
  };

  const handleAddProgram = async () => {
    if (!expandedDept || !newProgName.trim() || !newProgCode.trim()) {
      toast({ title: "Required", variant: "destructive" }); return;
    }
    const code = newProgCode.trim().toUpperCase();
    const docId = `${expandedDept}_${code}`;
    
    await setDoc(doc(db, 'programs', docId), {
      deptID: expandedDept,
      name: newProgName.trim(),
      code,
    }, { merge: false });

    setSuccessCard({ 
      title: 'Program Added', 
      description: `${code} joined ${expandedDept}.`, 
      color: 'green' 
    });
    setNewProgName(''); 
    setNewProgCode('');
  };

  const handleDeleteProgram = (id: string, name: string) => {
    setConfirmModal({ open: true, type: 'program', id, name });
  };

  const executeDelete = useCallback(() => {
    if (!confirmModal) return;
    const ref = confirmModal.type === 'dept' ? 'departments' : 'programs';
    deleteDocumentNonBlocking(doc(db, ref, confirmModal.id));
    
    if (confirmModal.type === 'dept' && expandedDept === confirmModal.id) {
      setExpandedDept(null);
    }

    setSuccessCard({ 
      title: 'Record Removed', 
      description: `"${confirmModal.name}" has been deleted.`, 
      color: 'amber' 
    });
    setConfirmModal(null);
  }, [confirmModal, db, expandedDept]);

  const handleSeedDepts = async () => {
    setIsSeeding(true);
    try {
      Object.entries(DEPARTMENTS).forEach(([id, name]) => {
        setDocumentNonBlocking(doc(db, 'departments', id), { deptID: id, departmentName: name }, { merge: true });
      });
      toast({ title: "Departments Synced" });
    } finally { setIsSeeding(false); }
  };

  const handleSeedPrograms = async () => {
    setIsSeeding(true);
    try {
      const seed = getProgramSeedData();
      for (const prog of seed) {
        await setDoc(doc(db, 'programs', `${prog.deptID}_${prog.code}`), prog, { merge: true });
      }
      setSuccessCard({ title: 'Programs Seeded', description: 'Institutional data imported.', color: 'green' });
    } finally { setIsSeeding(false); }
  };

  const startEditProgram = (prog: ProgramRecord) => {
    setEditingProgId(prog.id);
    setEditProgName(prog.name);
    setEditProgCode(prog.code);
  };

  const saveEditProgram = (id: string) => {
    updateDocumentNonBlocking(doc(db, 'programs', id), {
      name: editProgName.trim(),
      code: editProgCode.trim().toUpperCase(),
    });
    setEditingProgId(null);
    setSuccessCard({ title: 'Program Updated', description: 'Changes saved successfully.', color: 'navy' });
  };

  const filteredDepts = (depts || [])
    .filter(d =>
      d.deptID.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.departmentName.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (a.deptID === 'LIBRARY') return -1;
      if (b.deptID === 'LIBRARY') return 1;
      return a.deptID.localeCompare(b.deptID);
    });

  const thStyle = "font-bold text-xs uppercase tracking-wider text-slate-500 bg-slate-50/80";

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

      <div className="space-y-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div style={card} className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Building2 size={20} style={{ color: navy }} />
              <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display', serif" }}>
                Registry Management
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input 
                  placeholder="Search registry..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 w-64 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm" 
                />
              </div>
              <button onClick={handleSeedDepts} className="h-9 px-3 rounded-xl border text-xs font-bold flex gap-2 items-center" style={{ color: navy }}>
                <DatabaseBackup size={14} /> Sync
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 p-3 rounded-xl bg-slate-50/50 border border-slate-100">
            <Input 
              placeholder="Code" 
              value={newDeptId} 
              onChange={e => setNewDeptId(e.target.value.toUpperCase())}
              className="h-9 font-bold" 
            />
            <Input 
              placeholder="Department Name" 
              value={newDeptName} 
              onChange={e => setNewDeptName(e.target.value)}
              className="col-span-2 h-9" 
            />
            <button 
              onClick={handleAddDept}
              className="h-9 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-widest"
              style={{ background: navy }}
            >
              Add Dept
            </button>
          </div>
        </div>

        <div style={card} className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className={`pl-6 ${thStyle}`}>Code</TableHead>
                <TableHead className={thStyle}>Institutional Department</TableHead>
                <TableHead className={`text-center ${thStyle}`}>Programs</TableHead>
                <TableHead className={`text-right pr-6 ${thStyle}`}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isDepsLoading ? (
                <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="animate-spin inline" /></TableCell></TableRow>
              ) : filteredDepts.flatMap(d => {
                const isExpanded = expandedDept === d.deptID;
                const progCount = allPrograms?.filter(p => p.deptID === d.deptID).length || 0;

                return [
                  <TableRow 
                    key={d.deptID} 
                    className="cursor-pointer hover:bg-slate-50/50 transition-colors"
                    onClick={() => setExpandedDept(isExpanded ? null : d.deptID)}
                  >
                    <TableCell className="pl-6"><span className="font-bold whitespace-nowrap" style={{color:'hsl(221,72%,22%)',fontFamily:"'DM Mono',monospace"}}>{d.deptID}</span></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="font-semibold">{d.departmentName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-xs">{progCount}</TableCell>
                    <TableCell className="text-right pr-6">
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteDept(d.deptID, d.departmentName); }} className="p-2 text-slate-300 hover:text-red-500">
                        <Trash2 size={16} />
                      </button>
                    </TableCell>
                  </TableRow>,
                  
                  ...(isExpanded ? [
                    <TableRow key={`${d.deptID}-expanded`} className="bg-slate-50/30 hover:bg-slate-50/30">
                      <TableCell colSpan={4} className="p-6">
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold flex items-center gap-2"><GraduationCap size={16}/> Programs</h4>
                          </div>
                          
                          <div className="flex gap-2 mb-4">
                            <Input placeholder="Code" value={newProgCode} onChange={e => setNewProgCode(e.target.value.toUpperCase())} className="w-32 h-9 font-bold" />
                            <Input placeholder="Program Name" value={newProgName} onChange={e => setNewProgName(e.target.value)} className="flex-1 h-9" />
                            <button onClick={handleAddProgram} className="px-4 h-9 bg-emerald-600 text-white rounded-lg text-xs font-bold">Add</button>
                          </div>

                          <div className="space-y-1">
                            {deptPrograms.map(p => (
                              <div key={p.id} className="group flex items-center gap-2 py-2 px-1 hover:bg-slate-50 rounded-lg transition-colors">
                                {/* Fixed width and whitespace-nowrap keeps the code on one line */}
                                <div className="w-32 font-bold whitespace-nowrap text-sm shrink-0 uppercase">{p.code}</div>
                                <div className="flex-1 text-slate-600 text-sm truncate">{p.name}</div>
                                <div className="shrink-0">
                                  <button onClick={() => handleDeleteProgram(p.id, p.name)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ] : [])
                ];
              })}
            </TableBody>
          </Table>
        </div>

        {confirmModal?.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-bold">Confirm Deletion</h3>
              <p className="text-slate-500 text-sm mt-2">Permanently remove <b>{confirmModal.name}</b>?</p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setConfirmModal(null)} className="flex-1 h-11 rounded-xl border font-bold text-sm">Cancel</button>
                <button onClick={executeDelete} className="flex-1 h-11 rounded-xl bg-red-600 text-white font-bold text-sm">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}