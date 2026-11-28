-- Hand-written inverse of drizzle/0006_tearful_old_lace.sql. Run by hand (psql -f).
-- Roll back newest first: run this before 0005's rollback.
-- DESTRUCTIVE: drops api_key_scopes (every Settings key's permissions). Existing
-- keys keep their rows and become unrestricted again. expires_at and last_used_at
-- are dropped. Back up first.
BEGIN;

DROP TABLE IF EXISTS "api_key_scopes";
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_id_workspace_unique";
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "last_used_at";
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_resource_kind_allowed";
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_resource_kind_allowed" CHECK ("idempotency_keys"."resource_kind" in ('app', 'person', 'dependency', 'hosting', 'notice_alert', 'dependency_import'));
DELETE FROM "idempotency_keys" WHERE "resource_kind" = 'api_key';

-- Forget the migration (hash = sha256 of 0006_tearful_old_lace.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '4f49506a57aa887fc506a585fe1ae6260b08761a2573d9bc169ff0045d52a1e7';

COMMIT;
