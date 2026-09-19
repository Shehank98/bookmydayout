import type { NextFunction, Request, Response } from 'express';
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

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(env.isProd ? {} : { message: err instanceof Error ? err.message : String(err) }),
  });
}
