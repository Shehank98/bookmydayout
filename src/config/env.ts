import 'dotenv/config';

/**
 * Central place to read and validate environment variables.
 * If a required variable is missing we fail fast at startup with a clear
 * message rather than crashing later with a confusing error.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',
  port: intFromEnv('PORT', 8080),

  // DATABASE_URL is read directly by Prisma too; we validate its presence here.
  databaseUrl: required('DATABASE_URL'),

  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  firebase: {
    projectId: optional('FIREBASE_PROJECT_ID'),
    clientEmail: optional('FIREBASE_CLIENT_EMAIL'),
    // Private keys arrive with literal "\n"; convert them to real newlines.
    privateKey: optional('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    serviceAccountJson: optional('FIREBASE_SERVICE_ACCOUNT_JSON'),
    storageBucket: optional('FIREBASE_STORAGE_BUCKET'),
  },

  listings: {
    minImages: intFromEnv('LISTING_MIN_IMAGES', 3),
    maxImages: intFromEnv('LISTING_MAX_IMAGES', 10),
    moderateEdits: optional('MODERATE_LISTING_EDITS', 'true') === 'true',
  },
};

/** True only when Firebase Admin has enough config to initialise. */
export function isFirebaseConfigured(): boolean {
  const f = env.firebase;
  return Boolean(f.serviceAccountJson || (f.projectId && f.clientEmail && f.privateKey));
}
