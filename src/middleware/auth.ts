import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyIdToken } from '../lib/firebase.js';
import { isFirebaseConfigured } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { verifyLocalToken } from '../lib/jwt.js';
import { forbidden, unauthorized } from '../lib/http-error.js';

/**
 * The authenticated user attached to the request.
 * IMPORTANT: `role` always comes from our Postgres `users` row, never from the
 * Firebase token — that's the authorization source of truth (per the spec).
 */
export interface AuthUser {
  id: string;
  firebaseUid: string | null;
  email: string | null;
  role: UserRole;
}

// Augment Express's Request type so `req.user` is typed everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Resolve a bearer token to a local user. Accepts EITHER:
 *   1. a backend JWT (email/password login) — no Firebase needed, or
 *   2. a Firebase ID token (Google sign-in) — verified with the Admin SDK.
 * Returns the AuthUser, or null if the token is missing/invalid.
 */
async function resolveUser(token: string): Promise<AuthUser | null> {
  // 1) Try our own JWT first (cheap, offline, covers email/password users).
  const local = verifyLocalToken(token);
  if (local) {
    const user = await prisma.user.findUnique({ where: { id: local.uid } });
    if (!user) return null;
    return { id: user.id, firebaseUid: user.firebaseUid, email: user.email, role: user.role };
  }

  // 2) Otherwise treat it as a Firebase ID token (Google sign-in).
  if (!isFirebaseConfigured()) return null;
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return null;
  }

  // Find or create the local user row (first-login provisioning). Match an
  // existing email/password account by email so a person can use both methods.
  let user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user && decoded.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: decoded.email } });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { firebaseUid: decoded.uid },
      });
    }
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        firebaseUid: decoded.uid,
        email: decoded.email ?? null,
        name: decoded.name ?? null,
      },
    });
  }

  return { id: user.id, firebaseUid: user.firebaseUid, email: user.email, role: user.role };
}

/** Require a valid token (backend JWT or Firebase). Attaches `req.user`. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) throw unauthorized('Missing Bearer token.');
    const user = await resolveUser(token);
    if (!user) throw unauthorized('Invalid or expired token.');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth: attach user if a valid token is present, otherwise continue. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const user = await resolveUser(token);
    if (user) req.user = user;
  } catch {
    // ignore — treat as guest
  }
  next();
}

/** Gate a route to one of the given roles. Use after requireAuth. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden(`Requires role: ${roles.join(' or ')}.`));
      return;
    }
    next();
  };
}
