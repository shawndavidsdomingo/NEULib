"use client";

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ShieldAlert, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  Loader2, UserCheck, UserX, Trash2, Lock, Unlock, Edit3,
  UserPlus, Key, RefreshCw, Bell,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AuditAction =
  | 'user.block'       | 'user.unblock'
  | 'user.delete'      | 'user.edit'
  | 'user.add'         | 'user.import'
  | 'role.promote'     | 'role.demote'
  | 'role.toggle_super'
  | 'staff.add'        | 'staff.revoke'
  | 'notification.send'
  | 'dept.add'         | 'dept.delete'
  | 'purpose.add'      | 'purpose.delete' | 'purpose.toggle';

export interface AuditLogRecord {
  id:          string;
  action:      AuditAction;
  actorId:     string;
  actorName:   string;
  actorEmail:  string;
  targetId?:   string;
  targetName?: string;
  detail?:     string;       // human-readable change description
  timestamp:   string;       // ISO
}

// ─── Action metadata ──────────────────────────────────────────────────────────
const ACTION_META: Record<AuditAction, { label: string; color: string; icon: React.ElementType }> = {
  'user.block':        { label: 'Blocked User',        color: '#ef4444', icon: Lock },
  'user.unblock':      { label: 'Unblocked User',      color: '#059669', icon: Unlock },
  'user.delete':       { label: 'Deleted User',        color: '#dc2626', icon: Trash2 },
  'user.edit':         { label: 'Edited User',         color: '#2563eb', icon: Edit3 },
  'user.add':          { label: 'Added User',          color: '#059669', icon: UserPlus },
  'user.import':       { label: 'Bulk Import',         color: '#7c3aed', icon: RefreshCw },
  'role.promote':      { label: 'Promoted to Admin',   color: '#d97706', icon: UserCheck },
  'role.demote':       { label: 'Revoked Admin',       color: '#dc2626', icon: UserX },
  'role.toggle_super': { label: 'Toggled Super Admin', color: '#7c3aed', icon: Key },
  'staff.add':         { label: 'Registered Staff',    color: '#059669', icon: UserPlus },
  'staff.revoke':      { label: 'Revoked Staff',       color: '#ef4444', icon: UserX },
  'notification.send': { label: 'Sent Notification',  color: '#0284c7', icon: Bell },
  'dept.add':          { label: 'Added Department',    color: '#059669', icon: UserPlus },
  'dept.delete':       { label: 'Deleted Department',  color: '#ef4444', icon: Trash2 },
  'purpose.add':       { label: 'Added Purpose',       color: '#059669', icon: UserPlus },
  'purpose.delete':    { label: 'Deleted Purpose',     color: '#ef4444', icon: Trash2 },
  'purpose.toggle':    { label: 'Toggled Purpose',     color: '#d97706', icon: RefreshCw },
};

const ALL_CATEGORIES = [
  { value: 'all',          label: 'All Actions' },
  { value: 'user',         label: 'User Changes' },
  { value: 'role',         label: 'Role Changes' },
  { value: 'staff',        label: 'Staff Access' },
  { value: 'notification', label: 'Notifications' },
  { value: 'dept',         label: 'Departments' },
  { value: 'purpose',      label: 'Visit Purposes' },
];

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background:     'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border:         '1px solid rgba(255,255,255,0.9)',
  boxShadow:      '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius:   '1rem',
};

type SortField = 'timestamp' | 'actor' | 'action' | 'target';

// ─── Component ────────────────────────────────────────────────────────────────
export function AuditLogTab() {
  const db = useFirestore();

  const [search,       setSearch]       = useState('');
  const [category,     setCategory]     = useState('all');
  const [sortField,    setSortField]    = useState<SortField>('timestamp');
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('desc');

  const logsQuery = useMemoFirebase(
    () => query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(500)),
    [db]
  );
  const { data: logs, isLoading } = useCollection<AuditLogRecord>(logsQuery);

  const filtered = useMemo(() => {
    if (!logs) return [];
    const s = search.toLowerCase();
    let out = logs.filter(l => {
      const mS = !s
        || l.actorName.toLowerCase().includes(s)
        || l.actorEmail.toLowerCase().includes(s)
        || (l.targetName || '').toLowerCase().includes(s)
        || (l.detail || '').toLowerCase().includes(s);
      const mC = category === 'all' || l.action.startsWith(category);
      return mS && mC;
    });

    return [...out].sort((a, b) => {
      let va = '', vb = '';
      if      (sortField === 'timestamp') { va = a.timestamp;   vb = b.timestamp; }
      else if (sortField === 'actor')     { va = a.actorName;   vb = b.actorName; }
      else if (sortField === 'action')    { va = a.action;      vb = b.action; }
      else if (sortField === 'target')    { va = a.targetName || ''; vb = b.targetName || ''; }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [logs, search, category, sortField, sortDir]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="ml-1 opacity-30 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp   size={11} className="ml-1 text-primary inline" />
      : <ArrowDown size={11} className="ml-1 text-primary inline" />;
  };

  const thStyle = 'text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50/80 select-none cursor-pointer';

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans',sans-serif" }}>

      {/* Header / filter card */}
      <div style={card} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <ShieldAlert size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Admin Audit Log
              </h2>
              <p className="text-slate-400 font-medium text-sm mt-0.5">
                Complete record of all administrative actions
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
            Read Only
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search admin, target, or detail…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
            />
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-44 bg-slate-50 border-slate-200 rounded-xl font-semibold text-xs">
              <div className="flex items-center gap-1.5">
                <Filter size={11} style={{ color: navy }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {ALL_CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value} className="font-semibold text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-slate-400 text-xs font-medium ml-auto">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {(logs?.length ?? 0) > 500 && <span className="ml-1">(showing latest 500)</span>}
          </p>
        </div>
      </div>

      {/* Table */}
      <div style={card} className="overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm font-medium">Loading audit log…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldAlert size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="font-bold text-slate-600 text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>
              {(logs?.length ?? 0) === 0 ? 'No audit events yet' : 'No matches'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {(logs?.length ?? 0) === 0
                ? 'Events are recorded automatically as admins perform actions.'
                : 'Try adjusting your search or category filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-10 border-slate-100">
                  <TableHead className={`pl-5 ${thStyle}`} onClick={() => handleSort('timestamp')}>
                    Timestamp <SortIcon field="timestamp" />
                  </TableHead>
                  <TableHead className={`min-w-[200px] ${thStyle}`} onClick={() => handleSort('actor')}>
                    Admin <SortIcon field="actor" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => handleSort('action')}>
                    Action <SortIcon field="action" />
                  </TableHead>
                  <TableHead className={thStyle} onClick={() => handleSort('target')}>
                    Target <SortIcon field="target" />
                  </TableHead>
                  <TableHead className={`pr-5 ${thStyle}`} style={{ cursor: 'default' }}>
                    Detail
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(log => {
                  const meta = ACTION_META[log.action] ?? {
                    label: log.action, color: '#64748b', icon: ShieldAlert,
                  };
                  const Icon = meta.icon;
                  return (
                    <TableRow key={log.id}
                      className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                      style={{ height: 60 }}>

                      {/* Timestamp */}
                      <TableCell className="pl-5">
                        <p className="font-semibold text-sm text-slate-700">
                          {format(parseISO(log.timestamp), 'MMM d, yyyy')}
                        </p>
                        <p className="text-xs text-slate-400 font-medium">
                          {format(parseISO(log.timestamp), 'h:mm:ss a')}
                        </p>
                      </TableCell>

                      {/* Actor */}
                      <TableCell className="min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
                            style={{ background: navy }}>
                            {(log.actorName || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm whitespace-nowrap">{log.actorName}</p>
                            <p className="text-xs text-slate-400 font-medium whitespace-nowrap">{log.actorEmail}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Action badge */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full"
                          style={{ background: `${meta.color}12`, color: meta.color }}>
                          <Icon size={11} /> {meta.label}
                        </span>
                      </TableCell>

                      {/* Target */}
                      <TableCell>
                        {log.targetName ? (
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{log.targetName}</p>
                            {log.targetId && (
                              <p className="text-xs text-slate-400 font-mono">{log.targetId}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Detail */}
                      <TableCell className="pr-5 max-w-[200px]">
                        <p className="text-xs text-slate-500 font-medium leading-relaxed truncate">
                          {log.detail || '—'}
                        </p>
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