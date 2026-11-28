-- Hand-written inverse of drizzle/0009_notice_actions_audit.sql. Run by hand (psql -f), never in UAT without a backup.
-- Roll back newest first: run this before 0008's rollback.
-- DESTRUCTIVE: drops the audit history and every notice status, note, snooze and assignment.
BEGIN;

DROP TRIGGER IF EXISTS "audit_events_append_only" ON "audit_events";
DROP FUNCTION IF EXISTS "audit_events_refuse_update"();
DROP TABLE IF EXISTS "audit_events";
ALTER TABLE "app_notice_matches" DROP CONSTRAINT IF EXISTS "app_notice_matches_assignee_fk";
ALTER TABLE "app_notice_matches" DROP CONSTRAINT IF EXISTS "app_notice_matches_status_allowed";
ALTER TABLE "app_notice_matches" DROP CONSTRAINT IF EXISTS "app_notice_matches_snooze_has_date";
ALTER TABLE "app_notice_matches" DROP COLUMN IF EXISTS "assignee_id";
ALTER TABLE "app_notice_matches" DROP COLUMN IF EXISTS "status_changed_at";
ALTER TABLE "app_notice_matches" DROP COLUMN IF EXISTS "snoozed_until";
ALTER TABLE "app_notice_matches" DROP COLUMN IF EXISTS "status_note";
ALTER TABLE "app_notice_matches" DROP COLUMN IF EXISTS "status";
DELETE FROM "idempotency_keys" WHERE "resource_kind" = 'notice_match';
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_resource_kind_allowed";
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_resource_kind_allowed" CHECK ("idempotency_keys"."resource_kind" in ('app', 'person', 'dependency', 'hosting', 'notice_alert', 'dependency_import', 'api_key'));

-- Forget the migration (hash = sha256 of 0009_notice_actions_audit.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = 'dc6aee8ce83c9a1338d6c363bbd2f21f864aafb93eb71ec3cf256e1da84b8f95';

COMMIT;
