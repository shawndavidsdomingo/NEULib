"use client";

import { useState, useMemo } from 'react';
import { Target, Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { LibraryLogRecord, DepartmentRecord } from '@/lib/firebase-schema';
import { useToast } from '@/hooks/use-toast';

interface GoalRecord {
  id: string;
  deptID: string;
  target: number;
  period: 'weekly' | 'monthly';
  createdAt: string;
  updatedBy: string;
}

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

interface Props { isSuperAdmin: boolean; branchId?: string | null; }

export function GoalTrackingCard({ isSuperAdmin, branchId }: Props) {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [adding, setAdding]       = useState(false);
  const [newDept, setNewDept]     = useState('ALL');
  const [newTarget, setNewTarget] = useState('');
  const [newPeriod, setNewPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState('');

  const goalsRef = useMemoFirebase(() => collection(db, 'goals'), [db]);
  const { data: goals, isLoading: goalsLoading } = useCollection<GoalRecord>(goalsRef);

  const logsRef = useMemoFirebase(() => collection(db, 'library_logs'), [db]);
  const { data: allLogs } = useCollection<LibraryLogRecord>(logsRef);

  const deptsRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptsRef);

  const now = new Date();
  const weekStart  = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd    = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);

  const logCounts = useMemo(() => {
    if (!allLogs) return { weekly: {} as Record<string, number>, monthly: {} as Record<string, number> };
    const weekly: Record<string, number>  = {};
    const monthly: Record<string, number> = {};
    allLogs.filter(l => !branchId || !l.branchId || l.branchId === branchId).forEach(l => {
      const d = parseISO(l.checkInTimestamp);
      const dept = l.deptID || 'N/A';
      if (isWithinInterval(d, { start: weekStart, end: weekEnd })) {
        weekly[dept]  = (weekly[dept]  || 0) + 1;
        weekly['ALL'] = (weekly['ALL'] || 0) + 1;
      }
      if (isWithinInterval(d, { start: monthStart, end: monthEnd })) {
        monthly[dept]  = (monthly[dept]  || 0) + 1;
        monthly['ALL'] = (monthly['ALL'] || 0) + 1;
      }
    });
    return { weekly, monthly };
  }, [allLogs, weekStart, weekEnd, monthStart, monthEnd]);

  const handleAdd = async () => {
    if (!newTarget || isNaN(+newTarget) || +newTarget <= 0) {
      toast({ title: 'Enter a valid target number', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const id = `${newDept}_${newPeriod}_${Date.now()}`;
      await setDoc(doc(db, 'goals', id), {
        id, deptID: newDept, target: +newTarget, period: newPeriod,
        createdAt: new Date().toISOString(), updatedBy: user?.email || '',
      });
      setAdding(false); setNewDept('ALL'); setNewTarget(''); setNewPeriod('weekly');
      toast({ title: 'Goal added' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'goals', id));
    toast({ title: 'Goal removed', description: 'The visit goal has been deleted.' });
  };

  const handleSaveEdit = async (goal: GoalRecord) => {
    if (!editTarget || isNaN(+editTarget) || +editTarget <= 0) return;
    await setDoc(doc(db, 'goals', goal.id), { ...goal, target: +editTarget, updatedBy: user?.email || '' });
    setEditId(null);
    toast({ title: 'Goal updated' });
  };

  const sortedGoals = useMemo(() =>
    (goals || []).sort((a, b) => {
      if (a.deptID === 'ALL') return -1;
      if (b.deptID === 'ALL') return 1;
      return a.deptID.localeCompare(b.deptID);
    }), [goals]);

  const getDeptName = (deptID: string) => {
    if (deptID === 'ALL') return 'All Departments';
    return depts?.find(d => d.deptID === deptID)?.departmentName || deptID;
  };

  return (
    <div style={card}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
            <Target size={17} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
              Visit Goals
            </h3>
            <p className="text-slate-400 text-sm mt-0.5">Weekly & monthly visit targets by department</p>
          </div>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95"
            style={adding
              ? { background: 'rgba(239,68,68,0.07)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }
              : { background: `${navy}0d`, color: navy, borderColor: `${navy}20` }}>
            {adding ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add Goal</>}
          </button>
        )}
      </div>

      {adding && (
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-end gap-3"
          style={{ background: 'rgba(10,26,77,0.02)' }}>
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Department</p>
            <Select value={newDept} onValueChange={setNewDept}>
              <SelectTrigger className="h-9 bg-white border-slate-200 rounded-xl text-sm font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-60">
                <SelectItem value="ALL" className="font-semibold text-sm">All Departments</SelectItem>
                {(depts || []).sort((a, b) => a.deptID.localeCompare(b.deptID)).map(d => (
                  <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                    <span className="font-bold mr-1" style={{ color: navy }}>{d.deptID}</span>
                    {d.departmentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Period</p>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
              {(['weekly', 'monthly'] as const).map(p => (
                <button key={p} onClick={() => setNewPeriod(p)}
                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all capitalize"
                  style={newPeriod === p ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="w-32">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Target visits</p>
            <Input type="number" value={newTarget} onChange={e => setNewTarget(e.target.value)}
              placeholder="e.g. 200" className="h-9 rounded-xl border-slate-200 bg-white text-sm" />
          </div>
          <button onClick={handleAdd} disabled={saving}
            className="h-9 px-4 rounded-xl font-bold text-sm text-white flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            style={{ background: '#059669' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save
          </button>
        </div>
      )}

      <div className="p-5 space-y-3">
        {goalsLoading ? (
          <div className="py-8 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm font-medium">Loading goals…</span>
          </div>
        ) : sortedGoals.length === 0 ? (
          <div className="py-8 text-center">
            <Target size={24} className="mx-auto text-slate-200 mb-2" />
            <p className="text-slate-400 text-sm font-medium">No goals set yet.</p>
            {isSuperAdmin && <p className="text-slate-300 text-xs mt-1">Click "Add Goal" to create your first visit target.</p>}
          </div>
        ) : (
          sortedGoals.map(goal => {
            const counts = goal.period === 'weekly' ? logCounts.weekly : logCounts.monthly;
            const actual  = counts[goal.deptID] || 0;
            const pct     = Math.min(100, Math.round((actual / goal.target) * 100));
            const onTrack = pct >= 50;
            const reached = pct >= 100;
            const barColor = reached ? '#059669' : onTrack ? navy : '#f59e0b';

            return (
              <div key={goal.id} className="p-4 rounded-2xl border border-slate-100 space-y-3"
                style={{ background: reached ? 'rgba(5,150,105,0.03)' : 'rgba(255,255,255,0.8)' }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs px-2.5 py-1 rounded-full"
                      style={{ background: `${navy}0d`, color: navy, fontFamily: "'DM Mono',monospace" }}>
                      {goal.deptID}
                    </span>
                    <span className="text-slate-600 text-sm font-semibold truncate max-w-[180px]">
                      {getDeptName(goal.deptID)}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                      style={{ background: 'rgba(100,116,139,0.1)', color: '#64748b' }}>
                      {goal.period}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    {editId === goal.id ? (
                      <>
                        <Input type="number" value={editTarget} onChange={e => setEditTarget(e.target.value)}
                          className="h-8 w-20 rounded-xl text-sm border-slate-200" />
                        <button onClick={() => handleSaveEdit(goal)}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditId(null)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-sm" style={{ color: barColor }}>
                          {actual} <span className="text-slate-400 font-normal">/ {goal.target}</span>
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={reached
                            ? { background: 'rgba(5,150,105,0.1)', color: '#059669' }
                            : onTrack
                            ? { background: `${navy}0d`, color: navy }
                            : { background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>
                          {pct}%
                        </span>
                        {isSuperAdmin && (
                          <>
                            <button onClick={() => { setEditId(goal.id); setEditTarget(String(goal.target)); }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => handleDelete(goal.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  {reached && (
                    <p className="text-xs font-semibold text-emerald-600">
                      Goal reached! {actual - goal.target} visits over target.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}