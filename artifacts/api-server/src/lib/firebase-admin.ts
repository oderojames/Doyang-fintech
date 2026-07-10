import { initializeApp, getApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function parseServiceAccount(raw: string): object {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  }

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as object;
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as object;
    } catch {
      // fall through to base64 decoding below
    }
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) {
      return JSON.parse(decoded) as object;
    }
  } catch {
    // fall through to the final error below
  }

  throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT — must be valid JSON or base64-encoded JSON.');
}

function initAdmin() {
  if (getApps().length > 0) return getApp();

  const serviceAccountEnv = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (!serviceAccountEnv) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  }

  const serviceAccount = parseServiceAccount(serviceAccountEnv);
  return initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) });
}

export function getAdminAuth() {
  initAdmin();
  return getAuth();
}

export function getAdminFirestore() {
  initAdmin();
  return getFirestore();
}

export function getAdminStorage() {
  initAdmin();
  return getStorage();
}
