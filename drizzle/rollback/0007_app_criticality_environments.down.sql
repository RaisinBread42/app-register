-- Hand-written inverse of drizzle/0007_app_criticality_environments.sql. Run by hand (psql -f), never in UAT
-- without a backup. Roll back newest first: run this before 0006's rollback.
-- DESTRUCTIVE: drops app_environments and the criticality and repository_url columns.
-- Restoring NOT NULL on backup_owner_id fails while any app has no backup owner: give them one first.
BEGIN;

ALTER TABLE "apps" DROP CONSTRAINT IF EXISTS "apps_criticality_allowed";
DROP TABLE IF EXISTS "app_environments";
ALTER TABLE "apps" DROP COLUMN IF EXISTS "repository_url";
ALTER TABLE "apps" DROP COLUMN IF EXISTS "criticality";
ALTER TABLE "apps" ALTER COLUMN "backup_owner_id" SET NOT NULL;

-- Forget the migration (hash = sha256 of 0007_app_criticality_environments.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '671f9ccae7eae392e57dda1504861feffb4f30d09ad1b0943bcff2157f75184c';

COMMIT;
