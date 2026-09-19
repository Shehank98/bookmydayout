import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

// The static frontend lives in <repo>/public. The server always runs from the
// repo root (npm run dev / npm start), so resolve against the working directory.
const publicDir = path.resolve(process.cwd(), 'public');

/** Build and configure the Express application (no listening here). */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // Railway runs behind a proxy.

  // CSP is disabled here because the static frontend loads Firebase, map tiles
  // and Google Fonts from CDNs and uses inline bootstrapping. Other Helmet
  // protections stay on. Tighten CSP with an explicit policy before launch.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow non-browser tools (no origin) and any configured origin.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (!env.isProd) app.use(morgan('dev'));

  // API routes.
  app.use('/api', apiRouter);

  // Static frontend (public site + vendor dashboard + admin panel).
  app.use(express.static(publicDir, { extensions: ['html'] }));

  // Pretty, shareable listing URLs: /listing/<slug> -> listing detail page.
  app.get('/listing/:slug', (_req, res) => {
    res.sendFile(path.join(publicDir, 'listing.html'));
  });

  // API 404s return JSON; everything else falls through to the frontend 404.
  app.use('/api', notFoundHandler);
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.status(404).sendFile(path.join(publicDir, '404.html'), (err) => {
        if (err) next();
      });
      return;
    }
    next();
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
