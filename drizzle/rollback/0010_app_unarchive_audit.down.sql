-- Hand-written inverse of drizzle/0010_app_unarchive_audit.sql. Run by hand (psql -f), never in UAT without a backup.
-- Roll back newest first: run this before 0009's rollback.
-- Not destructive: the audit history is append-only, so 'app.unarchived' events stay. The narrower
-- check comes back NOT VALID: it applies to new rows only and existing rows are left as they are.
-- Code from before 0010 has no wording for those events, so roll the code back only together with this.
BEGIN;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_action_allowed";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_allowed" CHECK ("audit_events"."action" in ('notice.status_changed', 'notice.assigned', 'notice.status_undone', 'notice.assignment_undone', 'notice.snooze_ended', 'notice.reopened', 'app.archived')) NOT VALID;

-- Forget the migration (hash = sha256 of 0010_app_unarchive_audit.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = '3356deefdb284f2a92abc582ade96b5cd760311c40156c9d69a8bf1ed67614cb';

COMMIT;
