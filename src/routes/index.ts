import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { listingsRouter } from './listings.routes.js';
import { authRouter } from './auth.routes.js';
import { meRouter } from './me.routes.js';
import { metaRouter } from './meta.routes.js';
import { vendorRouter } from './vendor.routes.js';
import { adminRouter } from './admin.routes.js';

/**
 * Top-level API router. Feature routers get mounted here as later phases add
 * vendor, admin, auth, categories, amenities, favorites, reports, etc.
 */
export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use('/meta', metaRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/vendor', vendorRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/listings', listingsRouter);

// Simple index so hitting /api gives a friendly response.
apiRouter.get('/', (_req, res) => {
  res.json({
    name: 'BookMyDayOut API',
    version: '0.1.0',
    docs: 'See README.md',
    endpoints: [
      '/api/health',
      '/api/meta/{categories,amenities,districts,banners,featured}',
      '/api/auth/{me,become-vendor}',
      '/api/me/{favorites,contacts}',
      '/api/vendor/{profile,plans,subscription,listings}',
      '/api/admin/{stats,listings,vendors,categories,amenities,districts,banners,plans,reports,users}',
      '/api/listings',
      '/api/listings/:slug',
    ],
  });
});
