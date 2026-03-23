"use client";
// ─────────────────────────────────────────────────────────────────────────────
// useBranch.tsx  — src/hooks/useBranch.tsx
//
// Provides the currently selected branch for the admin dashboard and kiosk.
// Admin: stored in localStorage + a header dropdown (BranchSelector below).
// Kiosk: read from the URL param  ?branch=<branchId>
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { BranchRecord } from '@/components/admin/BranchManagement';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const LS_KEY = 'neu_lib_branch';
const navy = 'hsl(221,72%,22%)';

// ─────────────────────────────────────────────────────────────────────────────
// useAdminBranch — returns currently selected branchId + setter (admin use)
// ─────────────────────────────────────────────────────────────────────────────
export function useAdminBranch() {
  const db  = useFirestore();
  const ref = useMemoFirebase(() => collection(db, 'branches'), [db]);
  const { data: branches } = useCollection<BranchRecord>(ref);

  const defaultBranch = branches?.find(b => b.isDefault);

  const [branchId, setBranchIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      setBranchIdState(stored);
    } else if (defaultBranch) {
      setBranchIdState(defaultBranch.id);
    }
  }, [defaultBranch]);

  const setBranchId = useCallback((id: string | null) => {
    setBranchIdState(id);
    if (id === null) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, id);
  }, []);

  const currentBranch = branchId
    ? (branches?.find(b => b.id === branchId) ?? null)
    : null;

  return { branchId, setBranchId, branches: branches ?? [], currentBranch };
}

// ─────────────────────────────────────────────────────────────────────────────
// useKioskBranch — reads branchId from URL ?branch= param (kiosk use)
// ─────────────────────────────────────────────────────────────────────────────
export function useKioskBranch(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('branch');
}

// ─────────────────────────────────────────────────────────────────────────────
// BranchSelector — drop-in dropdown for the admin header
//
// Usage in UnifiedAdminDashboard:
//   const { branchId, setBranchId, branches } = useAdminBranch();
//   <BranchSelector branchId={branchId} setBranchId={setBranchId} branches={branches} />
// ─────────────────────────────────────────────────────────────────────────────
interface BranchSelectorProps {
  branchId:    string | null;
  setBranchId: (id: string | null) => void;
  branches:    BranchRecord[];
}

export function BranchSelector({ branchId, setBranchId, branches }: BranchSelectorProps) {
  if (!branches.length) return null;

  return (
    <div className="flex items-center gap-1.5">
      <GitBranch size={13} style={{ color: navy }} />
      <Select
        value={branchId ?? 'all'}
        onValueChange={v => setBranchId(v === 'all' ? null : v)}
      >
        <SelectTrigger
          className="h-8 min-w-[140px] bg-white rounded-xl border-slate-200 text-xs font-bold"
          style={{ color: navy }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {branches.length > 1 && (
            <SelectItem value="all" className="text-xs font-semibold">
              All Branches
            </SelectItem>
          )}
          {branches.map(b => (
            <SelectItem key={b.id} value={b.id} className="text-xs font-semibold">
              {b.name}{b.isDefault ? ' ★' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}