'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export function initializeFirebase() {
  if (!getApps().length) {
    let firebaseApp: FirebaseApp;

    // On GitHub Pages (static export) or any non-Firebase-Hosting environment,
    // initializeApp() without args throws "app/no-options".
    // Always use the config object — it works everywhere including Vercel and GitHub Pages.
    try {
      firebaseApp = initializeApp(firebaseConfig);
    } catch (e) {
      // If already initialized race condition, just get the existing app
      firebaseApp = getApp();
    }

    return getSdks(firebaseApp);
  }

  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';