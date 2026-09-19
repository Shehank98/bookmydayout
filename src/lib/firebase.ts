import admin from 'firebase-admin';
import { env, isFirebaseConfigured } from '../config/env.js';

/**
 * Lazily initialise the Firebase Admin SDK.
 *
 * The backend uses this to:
 *   - verify Firebase ID tokens sent by the frontend (auth middleware), and
 *   - later, to manage Firebase Storage objects for listing images.
 *
 * During early scaffolding you can run the API without Firebase configured;
 * auth-protected routes will simply return 503 until credentials are set.
 */

let app: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App | null {
  if (app) return app;
  if (!isFirebaseConfigured()) return null;

  const { projectId, clientEmail, privateKey, serviceAccountJson, storageBucket } = env.firebase;

  const credential = serviceAccountJson
    ? admin.credential.cert(JSON.parse(serviceAccountJson) as admin.ServiceAccount)
    : admin.credential.cert({ projectId, clientEmail, privateKey });

  app = admin.initializeApp({
    credential,
    storageBucket: storageBucket || undefined,
  });

  return app;
}

/** Verify a Firebase ID token and return its decoded claims, or throw. */
export async function verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    throw new Error('Firebase Admin is not configured on the server.');
  }
  return firebaseApp.auth().verifyIdToken(idToken);
}
