import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { isFirebaseConfigured } from '../config/env.js';

export const healthRouter = Router();

/** Liveness — is the process up? */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bookmydayout-api', time: new Date().toISOString() });
});

/** Readiness — can we reach the database, and is Firebase configured? */
healthRouter.get('/health/ready', async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }

  const ready = db;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    checks: { database: db, firebase: isFirebaseConfigured() },
  });
});
