-- Hand-written inverse of drizzle/0005_hosting_health.sql. Run by hand (psql -f).
-- Roll back newest first: run this before 0004's rollback.
-- DESTRUCTIVE: drops the incidents the last hosting check stored (the whole
-- `hosting_incidents` table), each hosting row's runtime, its check time and
-- check error, and the record of which end-of-support dates were typed by hand.
-- The dates themselves (end_of_support_on) stay. Back up first.
BEGIN;

DROP TABLE IF EXISTS "hosting_incidents";
ALTER TABLE "app_hosting" DROP CONSTRAINT IF EXISTS "app_hosting_version_inexact_only_looked_up";
ALTER TABLE "app_hosting" DROP CONSTRAINT IF EXISTS "app_hosting_end_of_support_has_source";
ALTER TABLE "app_hosting" DROP CONSTRAINT IF EXISTS "app_hosting_end_of_support_source_allowed";
ALTER TABLE "app_hosting" DROP CONSTRAINT IF EXISTS "app_hosting_id_workspace_unique";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "health_error";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "health_checked_at";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "is_version_inexact";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "end_of_support_source";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "runtime_version";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "runtime";

-- Forget the migration (hash = sha256 of 0005_hosting_health.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '97eff7bdbf89f6743648bd24048522c2df0cd001927fc1bb653186733170dbd3';

COMMIT;
