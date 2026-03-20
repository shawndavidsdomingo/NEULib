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

/**
 * library_logs: [CheckIn-Timestamp]_[DeptID]_[StudentName]_[4-char-suffix]
 *
 * Example: 2025-03-20T08-15-32.441Z_CICS_DELA_CRUZ-Juan_a3f9
 *
 * - Timestamp first  → chronological sort in Firestore console
 * - DeptID second    → easy visual grouping by department
 * - StudentName      → human-readable at a glance
 * - Suffix           → prevents collisions on same-millisecond check-ins
 */
export function libraryLogId(studentName: string, deptID = ''): string {
  // Use a filesystem-safe timestamp: replace colons with dashes
  const ts   = new Date().toISOString().replace(/:/g, '-');
  const dept = sanitize(deptID.toUpperCase(), 12);
  const name = sanitize(studentName, 30);
  return `${ts}_${dept}_${name}_${suffix4()}`;
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