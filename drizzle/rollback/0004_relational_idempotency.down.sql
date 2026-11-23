-- Hand-written inverse of drizzle/0004_relational_idempotency.sql. Run by hand (psql -f).
-- Roll back newest first: run this before 0003's rollback.
-- DESTRUCTIVE: deletes every stored Idempotency-Key. The old `response_body` column
-- held a JSON copy of the first response, which the new rows do not keep, so they
-- cannot be converted back. The rows are a 24-hour replay cache: a request first
-- sent before the rollback and retried after it runs as new instead of being replayed.
-- (Migration 0004 deleted the rows on the way up for the same reason.)
-- Nothing else is touched.
BEGIN;

DELETE FROM "idempotency_keys";
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_counts_only_for_import";
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_resource_kind_with_id";
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_resource_kind_allowed";
ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "count_removed";
ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "count_unchanged";
ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "count_updated";
ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "count_added";
ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "resource_id";
ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "resource_kind";
ALTER TABLE "idempotency_keys" ADD COLUMN "response_body" jsonb NOT NULL;

-- Forget the migration (hash = sha256 of 0004_relational_idempotency.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '2eac70c7a3edb633d001ce0763166e7bafcee9280ab172749732f2a23f04329f';

COMMIT;
