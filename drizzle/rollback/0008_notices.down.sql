-- Hand-written inverse of drizzle/0008_notices.sql. Run by hand (psql -f), never in UAT without a backup.
-- Roll back newest first: run this before 0007's rollback.
-- DESTRUCTIVE: drops every notice and match (their history). They are rebuilt from the stored
-- dependency and hosting findings by the next check or start-up, but first-seen times are lost.
BEGIN;

DROP TABLE IF EXISTS "app_notice_matches";
DROP TABLE IF EXISTS "notices";

-- Forget the migration (hash = sha256 of 0008_notices.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '29b922ac6dedb86e9ad1657fa802eabb620293f6ecc37729937a5c2c96f1846a';

COMMIT;
