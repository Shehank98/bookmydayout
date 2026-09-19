import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { listingsRouter } from './listings.routes.js';

/**
 * Top-level API router. Feature routers get mounted here as later phases add
 * vendor, admin, auth, categories, amenities, favorites, reports, etc.
 */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use('/listings', listingsRouter);

// Simple index so hitting /api gives a friendly response.
apiRouter.get('/', (_req, res) => {
  res.json({
    name: 'BookMyDayOut API',
    version: '0.1.0',
    docs: 'See README.md',
    endpoints: ['/api/health', '/api/health/ready', '/api/listings', '/api/listings/:slug'],
  });
});
