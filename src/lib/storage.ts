import { getFirebaseApp } from './firebase.js';
import { env } from '../config/env.js';

/**
 * Firebase Storage helpers.
 *
 * Upload flow (per spec): the FRONTEND uploads images directly to Firebase
 * Storage using the client SDK, into `/listings/{vendorId}/{listingId}/...`.
 * Storage security rules (see storage.rules) restrict that path to the owning
 * authenticated vendor and enforce size/MIME. The frontend then sends the
 * resulting download URLs to the backend, which stores them in Postgres.
 *
 * The backend uses this module mainly to DELETE objects when a listing or an
 * image is removed, so orphaned files don't pile up in the bucket.
 */

function getBucket() {
  const app = getFirebaseApp();
  if (!app) return null;
  return app.storage().bucket(env.firebase.storageBucket || undefined);
}

/**
 * Upload an image buffer to Storage via the Admin SDK and return a public URL.
 * This is used for backend-mediated uploads so that email/password vendors
 * (who have no Firebase client session) can still add listing photos.
 */
export async function uploadImageBuffer(
  objectPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const bucket = getBucket();
  if (!bucket) throw new Error('Firebase Storage is not configured on the server.');
  const file = bucket.file(objectPath);
  await file.save(buffer, { contentType, resumable: false, metadata: { contentType } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
}

export function isStorageConfigured(): boolean {
  return getBucket() !== null;
}

/**
 * Given a Firebase Storage download URL, extract the object path.
 * Handles both the v0 download URL form and gs:// / plain object paths.
 */
export function objectPathFromUrl(url: string): string | null {
  try {
    // Firebase download URL: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<ENCODED_PATH>?...
    const m = url.match(/\/o\/([^?]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);

    // Google Cloud Storage URL: https://storage.googleapis.com/<bucket>/<path>
    const gcs = url.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
    if (gcs?.[1]) return decodeURIComponent(gcs[1]);

    return null;
  } catch {
    return null;
  }
}

/** Best-effort delete of a stored object by its download URL. Never throws. */
export async function deleteObjectByUrl(url: string): Promise<void> {
  const bucket = getBucket();
  if (!bucket) return;
  const path = objectPathFromUrl(url);
  if (!path) return;
  try {
    await bucket.file(path).delete({ ignoreNotFound: true });
  } catch {
    // Swallow — a failed cleanup shouldn't fail the API request.
  }
}

/** Delete several objects by URL concurrently. */
export async function deleteObjectsByUrl(urls: string[]): Promise<void> {
  await Promise.all(urls.map((u) => deleteObjectByUrl(u)));
}
