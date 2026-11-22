-- Hand-written inverse of drizzle/0000_init.sql. Run by hand (psql -f); nothing runs it automatically.
-- DESTRUCTIVE: every statement below drops a table and ALL of its rows. Back up first.
-- Children are dropped before parents so no CASCADE is needed. The append-only trigger goes with its table.
BEGIN;

DROP TABLE IF EXISTS "review_items";
DROP TABLE IF EXISTS "review_cycles";
DROP TABLE IF EXISTS "ownership_changes";
DROP TABLE IF EXISTS "attachments";
DROP TABLE IF EXISTS "notice_alerts";
DROP TABLE IF EXISTS "apps";
DROP TABLE IF EXISTS "people";
DROP TABLE IF EXISTS "workspaces";
DROP FUNCTION IF EXISTS "ownership_changes_refuse_update"();

-- Forget the migration (hash = sha256 of 0000_init.sql) so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = 'ba58a9b9a8b214229f0b39c7b360b24096e9b34c5dfb5e42ce354505dd2d1740';

COMMIT;
