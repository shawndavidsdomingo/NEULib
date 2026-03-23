"use client";

import { useState } from 'react';
import { GitBranch, Plus, Trash2, Edit2, Check, X, Loader2, Star, ExternalLink, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { SuccessCard } from '@/components/ui/SuccessCard';

export interface WeekSchedule {
  mon: DaySchedule; tue: DaySchedule; wed: DaySchedule;
  thu: DaySchedule; fri: DaySchedule; sat: DaySchedule; sun: DaySchedule;
}
interface DaySchedule { open: string; close: string; closed: boolean; }

export interface BranchRecord {
  id:        string;
  name:      string;
  isDefault: boolean;
  createdAt: string;
  schedule?: WeekSchedule;
}

const DAYS: { key: keyof WeekSchedule; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' }, { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const DEFAULT_SCHEDULE: WeekSchedule = {
  mon: { open: '07:00', close: '18:00', closed: false },
  tue: { open: '07:00', close: '18:00', closed: false },
  wed: { open: '07:00', close: '18:00', closed: false },
  thu: { open: '07:00', close: '18:00', closed: false },
  fri: { open: '07:00', close: '18:00', closed: false },
  sat: { open: '08:00', close: '17:00', closed: false },
  sun: { open: '08:00', close: '17:00', closed: true  },
};

function fmt12(t: string) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
}

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

function kioskUrl(branchId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/?tab=kiosk&branch=${encodeURIComponent(branchId)}`;
}

function ScheduleEditor({ schedule, onChange }: {
  schedule: WeekSchedule;
  onChange: (s: WeekSchedule) => void;
}) {
  const update = (day: keyof WeekSchedule, field: keyof DaySchedule, value: string | boolean) => {
    onChange({ ...schedule, [day]: { ...schedule[day], [field]: value } });
  };

  return (
    <div className="space-y-1.5">
      {DAYS.map(({ key, label }) => {
        const day = schedule[key];
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 w-8">{label}</span>
            <button
              type="button"
              onClick={() => update(key, 'closed', !day.closed)}
              className="text-[10px] font-bold px-2 py-0.5 rounded-md transition-all"
              style={day.closed
                ? { background: 'rgba(239,68,68,0.1)', color: '#dc2626' }
                : { background: 'rgba(5,150,105,0.1)', color: '#059669' }}>
              {day.closed ? 'Closed' : 'Open'}
            </button>
            {!day.closed && (
              <>
                <input type="time" value={day.open}
                  onChange={e => update(key, 'open', e.target.value)}
                  className="text-xs font-mono font-bold border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 w-28" />
                <span className="text-xs text-slate-300">to</span>
                <input type="time" value={day.close}
                  onChange={e => update(key, 'close', e.target.value)}
                  className="text-xs font-mono font-bold border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 w-28" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BranchManagement() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [adding, setAdding]           = useState(false);
  const [saving, setSaving]           = useState(false);
  const [newName, setNewName]         = useState('');
  const [newSchedule, setNewSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);

  const [editId, setEditId]               = useState<string | null>(null);
  const [editName, setEditName]           = useState('');
  const [editSchedule, setEditSchedule]   = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [scheduleOpen, setScheduleOpen]   = useState<string | null>(null); // branch id with open schedule panel

  const [successCard, setSuccessCard] = useState<{ title: string; description: string } | null>(null);

  const branchesRef = useMemoFirebase(() => collection(db, 'branches'), [db]);
  const { data: branches, isLoading } = useCollection<BranchRecord>(branchesRef);

  const handleAdd = async () => {
    if (!newName.trim()) { toast({ title: 'Branch name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id   = `branch_${slug}_${Date.now()}`;
      const isFirstBranch = !branches?.length;
      await setDoc(doc(db, 'branches', id), {
        id, name: newName.trim(),
        isDefault: isFirstBranch,
        schedule: newSchedule,
        createdAt: new Date().toISOString(),
      });
      setAdding(false); setNewName(''); setNewSchedule(DEFAULT_SCHEDULE);
      setSuccessCard({ title: 'Branch Added', description: `${newName.trim()} has been added${isFirstBranch ? ' and set as default.' : '.'}` });
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async (b: BranchRecord) => {
    if (!editName.trim()) return;
    await updateDoc(doc(db, 'branches', b.id), {
      name:     editName.trim(),
      schedule: editSchedule,
    });
    setEditId(null);
    toast({ title: 'Branch updated' });
  };

  const handleSaveSchedule = async (b: BranchRecord, sched: WeekSchedule) => {
    await updateDoc(doc(db, 'branches', b.id), { schedule: sched });
    toast({ title: 'Schedule saved', description: `${b.name} hours updated.` });
  };

  const handleSetDefault = async (targetId: string) => {
    const batch = writeBatch(db);
    (branches || []).forEach(b => {
      batch.update(doc(db, 'branches', b.id), { isDefault: b.id === targetId });
    });
    await batch.commit();
    toast({ title: 'Default branch updated' });
  };

  const handleDelete = async (b: BranchRecord) => {
    if (b.isDefault && (branches?.length || 0) > 1) {
      toast({ title: 'Cannot delete default branch', description: 'Set another branch as default first.', variant: 'destructive' }); return;
    }
    await deleteDoc(doc(db, 'branches', b.id));
    toast({ title: 'Branch deleted' });
  };

  return (
    <>
      {successCard && (
        <SuccessCard title={successCard.title} description={successCard.description}
          color="green" onClose={() => setSuccessCard(null)} />
      )}
      <div style={card}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <GitBranch size={17} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Branch Management
              </h3>
              <p className="text-slate-400 text-sm mt-0.5">Manage library locations, kiosks, and operating hours</p>
            </div>
          </div>
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95"
            style={adding
              ? { background: 'rgba(239,68,68,0.07)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }
              : { background: `${navy}0d`, color: navy, borderColor: `${navy}20` }}>
            {adding ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add Branch</>}
          </button>
        </div>

        {/* Add form */}
        {adding && (
          <div className="px-5 py-4 border-b border-slate-100 space-y-4" style={{ background: 'rgba(10,26,77,0.02)' }}>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Branch name *</p>
                <Input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. NEU Main Library" className="h-9 rounded-xl border-slate-200 bg-white text-sm" />
              </div>

            </div>

            {/* Schedule editor inline for new branch */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Clock size={11} /> Library Operating Hours
              </p>
              <div className="bg-white rounded-xl border border-slate-100 p-3">
                <ScheduleEditor schedule={newSchedule} onChange={setNewSchedule} />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={handleAdd} disabled={saving}
                className="flex items-center gap-2 h-9 px-4 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60"
                style={{ background: '#059669' }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Add Branch
              </button>
            </div>
          </div>
        )}

        {/* Branch list */}
        <div className="p-5 space-y-3">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center gap-3 text-slate-400">
              <Loader2 className="animate-spin" size={16} /><span className="text-sm font-medium">Loading branches…</span>
            </div>
          ) : !branches?.length ? (
            <div className="py-8 text-center">
              <GitBranch size={24} className="mx-auto text-slate-200 mb-2" />
              <p className="text-slate-400 text-sm font-medium">No branches configured yet.</p>
            </div>
          ) : (
            branches.map(b => {
              const sched = b.schedule ?? DEFAULT_SCHEDULE;
              const isEditingSchedule = scheduleOpen === b.id;
              const [localSched, setLocalSched] = [sched, (s: WeekSchedule) => {}]; // display only outside edit

              return (
                <div key={b.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: b.isDefault ? `${navy}25` : '#e2e8f0', background: b.isDefault ? `${navy}06` : 'rgba(248,250,252,0.5)' }}>

                  {/* Main row */}
                  <div className="p-4 flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      {editId === b.id ? (
                        <div className="space-y-2">
                          <Input value={editName} onChange={e => setEditName(e.target.value)}
                            className="h-9 rounded-xl border-slate-200 text-sm font-bold" />

                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900 text-sm">{b.name}</p>
                            {b.isDefault && (
                              <span className="flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                                style={{ background: 'hsl(43,85%,52%,0.15)', color: 'hsl(38,90%,35%)' }}>
                                <Star size={9} fill="currentColor" /> Default
                              </span>
                            )}
                          </div>
                          {/* Schedule summary */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {DAYS.map(({ key, label }) => {
                              const d = sched[key];
                              return (
                                <span key={key} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                  style={d.closed
                                    ? { background: 'rgba(239,68,68,0.08)', color: '#94a3b8' }
                                    : { background: `${navy}0a`, color: navy }}>
                                  {label}{!d.closed && ` ${fmt12(d.open)}–${fmt12(d.close)}`}
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-medium mt-1">
                              <span>Added {format(parseISO(b.createdAt), 'MMM d, yyyy')}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                      {editId === b.id ? (
                        <>
                          <button onClick={() => handleSaveEdit(b)}
                            className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-all"><Check size={14} /></button>
                          <button onClick={() => setEditId(null)}
                            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-all"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <a href={kioskUrl(b.id)} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-bold border transition-all"
                            style={{ background: 'rgba(5,150,105,0.08)', color: '#059669', borderColor: 'rgba(5,150,105,0.2)' }}>
                            <ExternalLink size={11} /> Kiosk
                          </a>
                          {!b.isDefault && (
                            <button onClick={() => handleSetDefault(b.id)}
                              className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-bold border transition-all"
                              style={{ background: 'hsl(43,85%,52%,0.08)', color: 'hsl(38,90%,35%)', borderColor: 'hsl(43,85%,52%,0.2)' }}>
                              <Star size={11} /> Default
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setScheduleOpen(isEditingSchedule ? null : b.id);
                            }}
                            className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-bold border transition-all"
                            style={isEditingSchedule
                              ? { background: `${navy}10`, color: navy, borderColor: `${navy}25` }
                              : { background: 'rgba(100,116,139,0.07)', color: '#64748b', borderColor: '#e2e8f0' }}>
                            <Clock size={11} /> Hours
                          </button>
                          <button onClick={() => { setEditId(b.id); setEditName(b.name); setEditSchedule(b.schedule ?? DEFAULT_SCHEDULE); }}
                            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-all"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(b)}
                            className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline schedule editor panel */}
                  {isEditingSchedule && (
                    <SchedulePanel
                      branch={b}
                      onSave={handleSaveSchedule}
                      onClose={() => setScheduleOpen(null)}
                    />
                  )}

                  {/* Edit mode schedule */}
                  {editId === b.id && (
                    <div className="px-4 pb-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Clock size={11} /> Operating Hours
                      </p>
                      <div className="bg-white rounded-xl border border-slate-100 p-3">
                        <ScheduleEditor schedule={editSchedule} onChange={setEditSchedule} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// Separate component to avoid hooks-in-map issue
function SchedulePanel({ branch, onSave, onClose }: {
  branch: BranchRecord;
  onSave: (b: BranchRecord, s: WeekSchedule) => void;
  onClose: () => void;
}) {
  const [localSched, setLocalSched] = useState<WeekSchedule>(branch.schedule ?? DEFAULT_SCHEDULE);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(branch, localSched);
    setSaving(false);
    onClose();
  };

  return (
    <div className="border-t border-slate-100 px-4 py-4 space-y-3" style={{ background: 'rgba(10,26,77,0.015)' }}>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
        <Clock size={11} /> Operating Hours — {branch.name}
      </p>
      <ScheduleEditor schedule={localSched} onChange={setLocalSched} />
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
          style={{ background: '#059669' }}>
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save Hours
        </button>
        <button onClick={onClose}
          className="h-8 px-3 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-all">
          Cancel
        </button>
      </div>
    </div>
  );
}