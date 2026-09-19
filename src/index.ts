import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { isFirebaseConfigured } from './config/env.js';
import { runSubscriptionExpiry } from './jobs/subscription-expiry.js';

async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`BookMyDayOut API listening on port ${env.port} (${env.nodeEnv})`);
    if (!isFirebaseConfigured()) {
      // eslint-disable-next-line no-console
      console.warn('⚠  Firebase Admin not configured — auth-protected routes return 503.');
    }
  });

  // Graceful shutdown so Railway restarts/deploys close DB connections cleanly.
  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received — shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Subscription maintenance: run at startup, then once a day.
  const DAY_MS = 24 * 60 * 60 * 1000;
  void runSubscriptionExpiry().catch((e) => console.error('[subscription-expiry]', e));
  setInterval(() => {
    void runSubscriptionExpiry().catch((e) => console.error('[subscription-expiry]', e));
  }, DAY_MS).unref();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
