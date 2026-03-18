/**
 * firestore-ids.ts — Deterministic Firestore document ID helpers
 *
 * Format: [ISO-Timestamp]_[Sanitized-Name]_[4-char-suffix]
 *
 * - ISO timestamp at the start ensures chronological sorting in Firestore console
 * - Suffix prevents millisecond-collision overwrites
 * - All special chars (spaces, slashes, dots) are sanitized
 */

function sanitize(s: string, maxLen = 40): string {
  return s
    .replace(/[\s/\\]+/g, '_')          // spaces/slashes → underscore
    .replace(/[^a-zA-Z0-9_\-.]/g, '')   // remove remaining special chars
    .slice(0, maxLen);
}

function suffix4(): string {
  return Math.random().toString(36).slice(2, 6);
}

/** audit_logs: [ISO-Timestamp]_[ActorName]_[suffix] */
export function auditLogId(actorName: string): string {
  const ts = new Date().toISOString();
  return `${ts}_${sanitize(actorName)}_${suffix4()}`;
}

/** library_logs: [CheckIn-Timestamp]_[StudentName]_[suffix] */
export function libraryLogId(studentName: string): string {
  const ts = new Date().toISOString();
  return `${ts}_${sanitize(studentName)}_${suffix4()}`;
}

/** notifications: [SentAt-Timestamp]_[StudentID]_[suffix] */
export function notificationId(studentId: string): string {
  const ts = new Date().toISOString();
  return `${ts}_${sanitize(studentId)}_${suffix4()}`;
}

/** credential_requests: ISO timestamp (created at) */
export function credentialRequestId(): string {
  return new Date().toISOString();
}
