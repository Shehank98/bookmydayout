import type { NextFunction, Request, Response } from 'express';
import type { Vendor } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/http-error.js';

// Attach the loaded vendor row to the request.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      vendor?: Vendor;
    }
  }
}

/**
 * Loads the vendor profile for the authenticated user and attaches it as
 * `req.vendor`. Must run after requireAuth. A user without a vendor profile
 * is rejected — they must call POST /api/auth/become-vendor first.
 */
export async function requireVendor(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw unauthorized();
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
    if (!vendor) throw forbidden('You need a vendor profile. Call /api/auth/become-vendor first.');
    req.vendor = vendor;
    next();
  } catch (err) {
    next(err);
  }
}
