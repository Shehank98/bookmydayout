import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { isFirebaseConfigured } from './config/env.js';

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
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
