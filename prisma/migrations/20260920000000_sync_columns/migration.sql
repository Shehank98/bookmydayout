-- Idempotent "catch-up" migration.
--
-- Some databases were created from an earlier version of the initial migration
-- and are missing columns/constraints that later schema changes added. Because
-- the initial migration was already recorded as applied, those changes never
-- reached the database. Every statement here is guarded so it is a safe no-op
-- on a fully up-to-date database and a fix on a partially-migrated one.

-- Email/password auth support on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ALTER COLUMN "firebase_uid" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- Vendor-supplied Google Maps location link on listings
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "map_url" TEXT;
