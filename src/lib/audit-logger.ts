/**
 * audit-logger.ts
 * 
 * Call writeAuditLog() from any admin action to record it.
 * Import type AuditAction from AuditLogTab for type safety.
 * 
 * Usage:
 *   await writeAuditLog(db, user, 'user.block', { targetId: student.id, targetName: 'Juan Cruz', detail: 'Blocked for overdue books' });
 */

import { Firestore, collection, addDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import type { AuditAction } from '@/components/admin/AuditLogTab';

interface AuditPayload {
  targetId?:   string;
  targetName?: string;
  detail?:     string;
}

/**
 * Writes a single audit log entry to /audit_logs.
 * Fire-and-forget safe — errors are swallowed to never block the UI.
 */
export async function writeAuditLog(
  db:      Firestore,
  actor:   User | null,
  action:  AuditAction,
  payload: AuditPayload = {},
): Promise<void> {
  if (!db || !actor) return;
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      actorId:    actor.uid,
      actorName:  actor.displayName || actor.email || 'Unknown Admin',
      actorEmail: actor.email || '',
      targetId:   payload.targetId   ?? null,
      targetName: payload.targetName ?? null,
      detail:     payload.detail     ?? null,
      timestamp:  new Date().toISOString(),
    });
  } catch {
    // Silently swallow — audit logging must never break the main action
  }
}
