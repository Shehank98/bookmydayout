import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * A single shared PrismaClient instance for the whole app.
 * In development we cache it on `globalThis` so hot-reload (tsx watch)
 * doesn't open a new connection pool on every reload.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd ? ['error'] : ['query', 'warn', 'error'],
  });

if (!env.isProd) {
  globalForPrisma.prisma = prisma;
}
