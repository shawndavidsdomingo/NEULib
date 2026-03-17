/**
 * migrate-to-users.ts
 * 
 * Run once to migrate /students, /admins, /temporary_visitors → /users
 * 
 * Usage (from project root):
 *   npx tsx scripts/migrate-to-users.ts
 * 
 * Place this file in src/scripts/migrate-to-users.ts
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase Admin SDK initialized.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize admin SDK
if (!getApps().length) {
  initializeApp({
    // Uses GOOGLE_APPLICATION_CREDENTIALS env var automatically,
    // OR replace with: credential: cert(require('./serviceAccountKey.json'))
  });
}

const db = getFirestore();

async function migrate() {
  console.log('Starting migration to /users collection...\n');
  let migrated = 0;
  let skipped  = 0;

  // ── 1. Migrate /students → /users ────────────────────────────────────────
  console.log('── Migrating /students...');
  const studentsSnap = await db.collection('students').get();
  for (const doc of studentsSnap.docs) {
    const s = doc.data();
    const userDoc: Record<string, any> = {
      id:         doc.id,
      firstName:  s.firstName  || '',
      middleName: s.middleName || '',
      lastName:   s.lastName   || '',
      email:      s.email      || '',
      role:       'student',
      status:     s.isBlocked ? 'blocked' : 'active',
      deptID:     s.deptID    || '',
      program:    s.program   || '',
    };
    await db.collection('users').doc(doc.id).set(userDoc, { merge: true });
    console.log(`  ✓ student ${doc.id} → ${userDoc.firstName} ${userDoc.lastName}`);
    migrated++;
  }

  // ── 2. Migrate /admins → /users ───────────────────────────────────────────
  console.log('\n── Migrating /admins...');
  const adminsSnap = await db.collection('admins').get();
  for (const doc of adminsSnap.docs) {
    const a = doc.data();
    // Handle both old single-field name and new firstName/lastName fields
    let firstName  = a.firstName  || '';
    let middleName = a.middleName || '';
    let lastName   = a.lastName   || '';
    if (!firstName && a.name) {
      const parts = (a.name as string).trim().split(' ');
      firstName  = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
      lastName   = parts.length > 1 ? parts[parts.length - 1] : '';
    }
    const role = a.isSuperAdmin === true ? 'super_admin' : 'admin';
    const userDoc: Record<string, any> = {
      id:         doc.id,
      firstName,
      middleName,
      lastName,
      email:      a.email  || '',
      role,
      status:     'active',
    };
    await db.collection('users').doc(doc.id).set(userDoc, { merge: true });
    console.log(`  ✓ admin ${doc.id} → ${firstName} ${lastName} [${role}]`);
    migrated++;
  }

  // ── 3. Migrate /temporary_visitors → /users ───────────────────────────────
  console.log('\n── Migrating /temporary_visitors...');
  const tempSnap = await db.collection('temporary_visitors').get();
  for (const doc of tempSnap.docs) {
    const t = doc.data();
    const userDoc: Record<string, any> = {
      id:          t.temporaryStudentId || doc.id,
      firstName:   t.firstName  || '',
      middleName:  t.middleName || '',
      lastName:    t.lastName   || '',
      email:       t.email      || '',
      role:        'visitor',
      status:      t.isBlocked ? 'blocked' : 'pending',
      deptID:      t.deptID !== 'PENDING' ? (t.deptID || '') : '',
      program:     t.program || '',
      temporaryId: t.temporaryStudentId || doc.id,
      addedAt:     t.addedAt || new Date().toISOString(),
    };
    // Use email as doc ID for visitors so Google login can find them
    const docId = t.email || t.temporaryStudentId || doc.id;
    await db.collection('users').doc(docId).set(userDoc, { merge: true });
    console.log(`  ✓ visitor ${doc.id} → ${userDoc.firstName} ${userDoc.lastName} [pending]`);
    migrated++;
  }

  console.log(`\n✅ Migration complete: ${migrated} records migrated, ${skipped} skipped.`);
  console.log('\nNext steps:');
  console.log('1. Verify data in Firebase Console → /users');
  console.log('2. Deploy new firestore.rules');
  console.log('3. Test all login flows');
  console.log('4. Once verified, you can delete /students, /admins, /temporary_visitors');
}

migrate().catch(console.error);
