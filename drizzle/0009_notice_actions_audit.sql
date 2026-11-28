CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"app_id" uuid,
	"notice_id" uuid,
	"from_value" text,
	"to_value" text,
	"snoozed_until" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_action_allowed" CHECK ("audit_events"."action" in ('notice.status_changed', 'notice.assigned', 'notice.undone', 'notice.snooze_ended', 'app.archived', 'app.unarchived')),
	CONSTRAINT "audit_events_subject_kind_allowed" CHECK ("audit_events"."subject_kind" in ('notice_match', 'app'))
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_resource_kind_allowed";--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD COLUMN "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD COLUMN "snoozed_until" date;--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_occurred_idx" ON "audit_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_app_idx" ON "audit_events" USING btree ("app_id","occurred_at");--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD CONSTRAINT "app_notice_matches_assignee_fk" FOREIGN KEY ("assignee_id","workspace_id") REFERENCES "public"."people"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD CONSTRAINT "app_notice_matches_status_allowed" CHECK ("app_notice_matches"."status" in ('new', 'reviewing', 'snoozed', 'handled'));--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD CONSTRAINT "app_notice_matches_snooze_has_date" CHECK (("app_notice_matches"."status" = 'snoozed') = ("app_notice_matches"."snoozed_until" is not null));--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_resource_kind_allowed" CHECK ("idempotency_keys"."resource_kind" in ('app', 'person', 'dependency', 'hosting', 'notice_alert', 'dependency_import', 'api_key', 'notice_match'));--> statement-breakpoint
-- Hand-written: audit_events is append-only. UPDATE is refused; DELETE stays allowed for workspace cascades and retention ([41]).
CREATE FUNCTION "audit_events_refuse_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events_append_only: audit history cannot be changed';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "audit_events_refuse_update"();
