-- Hand-written inverse of drizzle/0011_source_checks.sql. Run by hand (psql -f), never in UAT without a backup.
-- Roll back newest first: run this before 0010's rollback.
-- Drops only the source check history this migration added (when each source was last asked and answered).
-- Applications, findings and the audit history are untouched; the next check fills the table again.
BEGIN;

DROP TABLE IF EXISTS "source_checks";

-- Forget the migration (hash = sha256 of 0011_source_checks.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = 'e12c6beca02bbaeedfed6c614b9ba3aa4ee05834365a7318004e91a16c1e95dc';

COMMIT;
