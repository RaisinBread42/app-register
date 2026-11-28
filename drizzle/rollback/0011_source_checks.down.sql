-- Hand-written inverse of drizzle/0011_source_checks.sql. Run by hand (psql -f), never in UAT without a backup.
-- Roll back newest first: run this before 0010's rollback.
-- Drops only what this migration added: the source check history (when each source was last asked and
-- answered) and each hosting row's copy of its last good check time (health_checked_at is untouched).
-- Applications, findings and the audit history are untouched; the next check fills both again.
BEGIN;

DROP TABLE IF EXISTS "source_checks";
ALTER TABLE "app_hosting" DROP COLUMN IF EXISTS "last_good_check_at";

-- Forget the migration (hash = sha256 of 0011_source_checks.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = 'fb3ff64df5522f80dd11d675c900c4ffd5e2356d56208879fa6c0c92e86602b3';

COMMIT;
