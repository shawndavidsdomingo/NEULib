/**
 * audit-logger.ts
 * 
 * Call writeAuditLog() from any admin action to record it.
 * Import type AuditAction from AuditLogTab for type safety.
 * 
 * Usage:
 *   await writeAuditLog(db, user, 'user.block', { targetId: student.id, targetName: 'Juan Cruz', detail: 'Blocked for overdue books' });
 */

import { Firestore, collection, doc, setDoc } from 'firebase/firestore';
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
    const ts        = new Date().toISOString();
    // Sanitize actor name: spaces→underscores, remove slashes and special chars
    const safeName  = (actor.displayName || actor.email || 'Unknown')
      .replace(/[\s]+/g, '_')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .slice(0, 40);
    // Add 4-char random suffix to prevent millisecond collisions
    const suffix    = Math.random().toString(36).slice(2, 6);
    const docId     = `${ts}_${safeName}_${suffix}`;

    await setDoc(doc(db, 'audit_logs', docId), {
      action,
      actorId:    actor.uid,
      actorName:  actor.displayName || actor.email || 'Unknown Admin',
      actorEmail: actor.email || '',
      targetId:   payload.targetId   ?? null,
      targetName: payload.targetName ?? null,
      detail:     payload.detail     ?? null,
      timestamp:  ts,
    });
  } catch {
    // Silently swallow — audit logging must never break the main action
  }
}