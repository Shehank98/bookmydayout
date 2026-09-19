import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Backend-issued JWTs for email/password login (no Firebase involved).
 * Google sign-in still uses Firebase ID tokens — the auth middleware accepts
 * either kind of token.
 */

export interface LocalTokenPayload {
  uid: string; // our users.id
  typ: 'local';
}

const TTL = '30d';

export function signLocalToken(userId: string): string {
  const payload: LocalTokenPayload = { uid: userId, typ: 'local' };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TTL });
}

/** Verify a backend JWT. Returns the payload, or null if invalid/not ours. */
export function verifyLocalToken(token: string): LocalTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as LocalTokenPayload;
    if (decoded && decoded.typ === 'local' && decoded.uid) return decoded;
    return null;
  } catch {
    return null;
  }
}
