import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http-error.js';
import { env } from '../config/env.js';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

/** Central error handler — turns thrown errors into clean JSON responses. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  // Zod validation errors -> 400 with a readable message.
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const field = first?.path.join('.') || 'input';
    res.status(400).json({
      error: `Invalid ${field}: ${first?.message ?? 'validation failed'}`,
      details: err.errors,
    });
    return;
  }

  // Multer upload errors (file too large, too many files, etc.) -> 400.
  if (err instanceof Error && err.name === 'MulterError') {
    res.status(400).json({ error: err.message });
    return;
  }

  // Known Prisma errors -> friendly messages instead of a raw 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') || 'value';
      res.status(409).json({ error: `That ${target} is already in use.` });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'The requested record was not found.' });
      return;
    }
  }
  // Schema not migrated yet, or DB unreachable -> clearer 503.
  if (err instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json({ error: 'Database is not reachable. Check DATABASE_URL and run migrations.' });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(env.isProd ? {} : { message: err instanceof Error ? err.message : String(err) }),
  });
}
