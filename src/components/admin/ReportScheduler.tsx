"use client";

import { useState, useMemo } from 'react';
import { CalendarClock, Plus, Trash2, Play, Loader2, X, Check, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { DepartmentRecord } from '@/lib/firebase-schema';
import { useToast } from '@/hooks/use-toast';

interface ScheduledReportRecord {
  id:             string;
  label:          string;
  frequency:      'daily' | 'weekly' | 'monthly';
  dayOfWeek?:     number;
  template:       'activity' | 'violation' | 'comprehensive';
  deptFilter:     string;
  createdBy:      string;
  createdAt:      string;
  lastGenerated?: string;
  isActive:       boolean;
}

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

const TEMPLATE_META = {
  activity:      { label: 'Activity & Engagement', color: 'hsl(43,85%,42%)',  bg: 'hsl(43,85%,52%,0.1)'  },
  violation:     { label: 'Violation Report',       color: '#dc2626',          bg: 'rgba(220,38,38,0.08)'  },
  comprehensive: { label: 'Comprehensive Ops',      color: navy,               bg: `${navy}0d`             },
};

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

interface Props { isSuperAdmin: boolean; }

export function ReportScheduler({ isSuperAdmin }: Props) {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [adding, setAdding]         = useState(false);
  const [saving, setSaving]         = useState(false);
  const [newLabel, setNewLabel]     = useState('');
  const [newFreq, setNewFreq]       = useState<'daily'|'weekly'|'monthly'>('weekly');
  const [newDay, setNewDay]         = useState(1);
  const [newTemplate, setNewTemplate] = useState<'activity'|'violation'|'comprehensive'>('activity');
  const [newDept, setNewDept]       = useState('All Departments');

  const reportsRef = useMemoFirebase(() => collection(db, 'scheduled_reports'), [db]);
  const { data: schedules, isLoading } = useCollection<ScheduledReportRecord>(reportsRef);

  const deptsRef = useMemoFirebase(() => collection(db, 'departments'), [db]);
  const { data: depts } = useCollection<DepartmentRecord>(deptsRef);

  const handleAdd = async () => {
    if (!newLabel.trim()) { toast({ title: 'Label is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const id = `report_${Date.now()}`;
      await setDoc(doc(db, 'scheduled_reports', id), {
        id, label: newLabel.trim(), frequency: newFreq,
        ...(newFreq === 'weekly' ? { dayOfWeek: newDay } : {}),
        template: newTemplate, deptFilter: newDept,
        createdBy: user?.email || '', createdAt: new Date().toISOString(),
        isActive: true,
      });
      setAdding(false); setNewLabel(''); setNewFreq('weekly'); setNewTemplate('activity'); setNewDept('All Departments');
      toast({ title: 'Schedule created', description: 'Report will generate automatically on the set schedule.' });
    } finally { setSaving(false); }
  };

  const handleToggle = async (s: ScheduledReportRecord) => {
    await updateDoc(doc(db, 'scheduled_reports', s.id), { isActive: !s.isActive });
    toast({ title: s.isActive ? 'Schedule paused' : 'Schedule resumed' });
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'scheduled_reports', id));
    toast({ title: 'Schedule deleted' });
  };

  const getNextRun = (s: ScheduledReportRecord) => {
    const now = new Date();
    if (s.frequency === 'daily') {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(6, 0, 0, 0);
      return format(next, 'MMM d, h:mm a');
    }
    if (s.frequency === 'weekly' && s.dayOfWeek !== undefined) {
      const next = new Date(now);
      const diff = (s.dayOfWeek - now.getDay() + 7) % 7 || 7;
      next.setDate(next.getDate() + diff);
      next.setHours(6, 0, 0, 0);
      return format(next, 'MMM d');
    }
    return 'Start of next month';
  };

  return (
    <div style={card}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
            <CalendarClock size={17} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
              Report Schedules
            </h3>
            <p className="text-slate-400 text-sm mt-0.5">Automated PDF generation on a recurring schedule</p>
          </div>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95"
            style={adding
              ? { background: 'rgba(239,68,68,0.07)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }
              : { background: `${navy}0d`, color: navy, borderColor: `${navy}20` }}>
            {adding ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add Schedule</>}
          </button>
        )}
      </div>

      {adding && (
        <div className="px-5 py-4 border-b border-slate-100 space-y-4" style={{ background: 'rgba(10,26,77,0.02)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Schedule name</p>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Weekly Activity Summary"
                className="h-9 rounded-xl border-slate-200 bg-white text-sm" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Template</p>
              <Select value={newTemplate} onValueChange={v => setNewTemplate(v as any)}>
                <SelectTrigger className="h-9 bg-white border-slate-200 rounded-xl text-sm font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="activity"      className="text-sm font-semibold">Activity & Engagement</SelectItem>
                  <SelectItem value="violation"     className="text-sm font-semibold">Violation Report</SelectItem>
                  <SelectItem value="comprehensive" className="text-sm font-semibold">Comprehensive Ops</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Frequency</p>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                {(['daily','weekly','monthly'] as const).map(f => (
                  <button key={f} onClick={() => setNewFreq(f)}
                    className="flex-1 py-1 rounded-lg text-xs font-bold transition-all capitalize"
                    style={newFreq === f ? { background: navy, color: 'white' } : { color: '#64748b' }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {newFreq === 'weekly' && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Day of week</p>
                <Select value={String(newDay)} onValueChange={v => setNewDay(+v)}>
                  <SelectTrigger className="h-9 bg-white border-slate-200 rounded-xl text-sm font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {DAY_NAMES.map((d, i) => (
                      <SelectItem key={i} value={String(i)} className="text-sm font-semibold">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Department filter</p>
              <Select value={newDept} onValueChange={setNewDept}>
                <SelectTrigger className="h-9 bg-white border-slate-200 rounded-xl text-sm font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  <SelectItem value="All Departments" className="text-sm font-semibold">All Departments</SelectItem>
                  {(depts || []).sort((a,b) => a.deptID.localeCompare(b.deptID)).map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="text-sm font-semibold">
                      <span className="font-bold mr-1" style={{ color: navy }}>{d.deptID}</span>
                      {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleAdd} disabled={saving}
              className="flex items-center gap-2 h-9 px-4 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60"
              style={{ background: '#059669' }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Create Schedule
            </button>
          </div>
        </div>
      )}

      <div className="p-5 space-y-3">
        {isLoading ? (
          <div className="py-8 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm font-medium">Loading schedules…</span>
          </div>
        ) : !schedules?.length ? (
          <div className="py-8 text-center">
            <CalendarClock size={24} className="mx-auto text-slate-200 mb-2" />
            <p className="text-slate-400 text-sm font-medium">No report schedules configured.</p>
            {isSuperAdmin && <p className="text-slate-300 text-xs mt-1">Add a schedule to automate PDF generation.</p>}
          </div>
        ) : (
          schedules.map(s => {
            const meta = TEMPLATE_META[s.template];
            return (
              <div key={s.id}
                className="p-4 rounded-2xl border flex items-start gap-4 flex-wrap transition-all"
                style={{ borderColor: s.isActive ? 'rgba(10,26,77,0.1)' : '#e2e8f0', background: s.isActive ? 'rgba(10,26,77,0.015)' : 'rgba(241,245,249,0.5)', opacity: s.isActive ? 1 : 0.65 }}>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900 text-sm">{s.label}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                      style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                    {!s.isActive && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
                    <span className="capitalize font-bold" style={{ color: navy }}>{s.frequency}</span>
                    {s.frequency === 'weekly' && s.dayOfWeek !== undefined && (
                      <span>every {DAY_NAMES[s.dayOfWeek]}</span>
                    )}
                    {s.deptFilter !== 'All Departments' && (
                      <span className="px-2 py-0.5 rounded-full font-mono text-[10px]"
                        style={{ background: `${navy}0d`, color: navy }}>
                        {s.deptFilter}
                      </span>
                    )}
                    <span style={{ color: '#94a3b8' }}>
                      Next: {s.isActive ? getNextRun(s) : '—'}
                    </span>
                  </div>
                  {s.lastGenerated && (
                    <p className="text-xs text-slate-400">
                      Last generated: {format(parseISO(s.lastGenerated), 'MMM d, yyyy h:mm a')}
                    </p>
                  )}
                </div>
                {isSuperAdmin && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => handleToggle(s)}
                      className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                      style={s.isActive
                        ? { background: 'rgba(245,158,11,0.08)', color: '#b45309', borderColor: 'rgba(245,158,11,0.2)' }
                        : { background: 'rgba(5,150,105,0.08)', color: '#059669', borderColor: 'rgba(5,150,105,0.2)' }}>
                      {s.isActive ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        <p className="text-xs text-slate-300 text-center pt-2">
          Reports are generated at 6:00 AM on the scheduled day and available for download in the Reports tab.
        </p>
      </div>
    </div>
  );
}