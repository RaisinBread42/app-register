-- Hand-written inverse of drizzle/0001_api_keys_idempotency_deps_hosting.sql. Run by hand (psql -f).
-- DESTRUCTIVE: drops every API key (all clients lose access), all stored idempotency
-- responses, and all recorded dependencies and hosting rows. Back up first.
BEGIN;

DROP TABLE IF EXISTS "idempotency_keys";
DROP TABLE IF EXISTS "api_keys";
DROP TABLE IF EXISTS "app_hosting";
DROP TABLE IF EXISTS "app_dependencies";

-- Forget the migration (hash = sha256 of 0001_api_keys_idempotency_deps_hosting.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '9ea8d7c6253d26f223e041b44fd8db57f83bce41d5b5a1a9837a46d0beec861c';

COMMIT;
