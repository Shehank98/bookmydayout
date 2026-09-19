import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyIdToken } from '../lib/firebase.js';
import { isFirebaseConfigured } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, serviceUnavailable, unauthorized } from '../lib/http-error.js';

/**
 * The authenticated user attached to the request.
 * IMPORTANT: `role` always comes from our Postgres `users` row, never from the
 * Firebase token — that's the authorization source of truth (per the spec).
 */
export interface AuthUser {
  id: string;
  firebaseUid: string;
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
 * Verifies the Firebase ID token, then finds-or-creates the matching Postgres
 * user row keyed by firebase_uid. Attaches the row to `req.user`.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isFirebaseConfigured()) {
      throw serviceUnavailable('Authentication is not configured on the server yet.');
    }

    const token = extractBearerToken(req);
    if (!token) throw unauthorized('Missing Bearer token.');

    const decoded = await verifyIdToken(token).catch(() => {
      throw unauthorized('Invalid or expired token.');
    });

    // Find or create the local user row (first-login provisioning).
    const user = await prisma.user.upsert({
      where: { firebaseUid: decoded.uid },
      update: {
        // Keep email in sync if Firebase has one; don't overwrite role/name.
        ...(decoded.email ? { email: decoded.email } : {}),
      },
      create: {
        firebaseUid: decoded.uid,
        email: decoded.email ?? null,
        name: decoded.name ?? null,
      },
    });

    req.user = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth: attach user if a valid token is present, otherwise continue. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token || !isFirebaseConfigured()) {
    next();
    return;
  }
  // Reuse requireAuth but swallow auth failures for optional routes.
  try {
    const decoded = await verifyIdToken(token);
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (user) {
      req.user = { id: user.id, firebaseUid: user.firebaseUid, email: user.email, role: user.role };
    }
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
