-- Hand-written inverse of drizzle/0002_dependency_health.sql. Run by hand (psql -f).
-- Roll back newest first: run this before 0001's rollback.
-- DESTRUCTIVE: drops what monitoring stored on each dependency (advisories, last check,
-- check error) and forgets which dependencies came from an import. The dependencies
-- themselves, their versions and hand-recorded advisory ids stay.
BEGIN;

ALTER TABLE "app_dependencies" DROP CONSTRAINT IF EXISTS "app_dependencies_check_error_allowed";
ALTER TABLE "app_dependencies" DROP CONSTRAINT IF EXISTS "app_dependencies_source_allowed";
ALTER TABLE "app_dependencies" DROP COLUMN IF EXISTS "check_error";
ALTER TABLE "app_dependencies" DROP COLUMN IF EXISTS "checked_at";
ALTER TABLE "app_dependencies" DROP COLUMN IF EXISTS "advisories";
ALTER TABLE "app_dependencies" DROP COLUMN IF EXISTS "is_dev";
ALTER TABLE "app_dependencies" DROP COLUMN IF EXISTS "source";

-- Forget the migration (hash = sha256 of 0002_dependency_health.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '27ca609bdec18f1884b0b607f86e17709c5616b4e97a11ae07fbb824921a8e18';

COMMIT;
