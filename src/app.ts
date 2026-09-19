import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

/** Build and configure the Express application (no listening here). */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // Railway runs behind a proxy.

  app.use(helmet());
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

  // Root redirect helper.
  app.get('/', (_req, res) => res.redirect('/api'));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
