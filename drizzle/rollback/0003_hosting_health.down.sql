-- Hand-written inverse of drizzle/0003_hosting_health.sql. Run by hand (psql -f).
-- Roll back newest first: run this before 0002's and 0001's rollbacks.
-- DESTRUCTIVE: drops each hosting row's runtime, the incidents and errors the last
-- hosting check stored, and the record of which end-of-support dates were typed by
-- hand. The dates themselves (end_of_support_on) stay. Back up first.
BEGIN;

ALTER TABLE "app_hosting" DROP CONSTRAINT IF EXISTS "app_hosting_end_of_support_has_source";
ALTER TABLE "app_hosting" DROP CONSTRAINT IF EXISTS "app_hosting_end_of_support_source_allowed";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "health_error";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "health_checked_at";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "incidents";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "end_of_support_source";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "runtime_version";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "runtime";

-- Forget the migration (hash = sha256 of 0003_hosting_health.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '37ae68374fc20deac54204160bf182d9e63120b462ed947f834ac33ec1f82084';

COMMIT;
