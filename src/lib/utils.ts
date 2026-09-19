import type { NextFunction, Request, Response } from 'express';

/** Turn a title into a URL-safe slug fragment. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** A short random suffix to keep listing slugs unique + shareable. */
export function shortId(len = 6): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + len);
}

/** Build a shareable listing slug like "beach-villa-galle-a1b2c3". */
export function buildListingSlug(title: string): string {
  const base = slugify(title) || 'listing';
  return `${base}-${shortId()}`;
}

/**
 * Wrap an async route handler so thrown errors reach the error middleware
 * without repeating try/catch in every handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
