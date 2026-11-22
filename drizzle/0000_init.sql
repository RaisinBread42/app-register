CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"category" text,
	"vendor" text,
	"description" text,
	"owner_id" uuid NOT NULL,
	"backup_owner_id" uuid NOT NULL,
	"renewal_date" date,
	"notice_deadline" date,
	"billing_cycle" text,
	"cost_cents" integer,
	"runtime_location" text,
	"data_and_keys" text,
	"what_breaks_if_stopped" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "apps_kind_allowed" CHECK ("apps"."kind" in ('saas', 'in_house', 'citizen_built', 'vendor_service')),
	CONSTRAINT "apps_owner_not_backup" CHECK ("apps"."owner_id" <> "apps"."backup_owner_id"),
	CONSTRAINT "apps_notice_before_renewal" CHECK ("apps"."notice_deadline" <= "apps"."renewal_date"),
	CONSTRAINT "apps_cost_not_negative" CHECK ("apps"."cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachments_size_not_negative" CHECK ("attachments"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notice_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"notice_deadline" date NOT NULL,
	"offset_days" integer NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_alerts_app_deadline_offset_unique" UNIQUE("app_id","notice_deadline","offset_days"),
	CONSTRAINT "notice_alerts_offset_positive" CHECK ("notice_alerts"."offset_days" > 0),
	CONSTRAINT "notice_alerts_status_allowed" CHECK ("notice_alerts"."status" in ('scheduled', 'sent', 'acknowledged')),
	CONSTRAINT "notice_alerts_sent_has_sent_at" CHECK ("notice_alerts"."status" <> 'sent' or "notice_alerts"."sent_at" is not null),
	CONSTRAINT "notice_alerts_acknowledged_has_acknowledged_at" CHECK ("notice_alerts"."status" <> 'acknowledged' or "notice_alerts"."acknowledged_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "ownership_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"role" text NOT NULL,
	"from_person_id" uuid,
	"to_person_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_changes_role_allowed" CHECK ("ownership_changes"."role" in ('owner', 'backup_owner')),
	CONSTRAINT "ownership_changes_reason_allowed" CHECK ("ownership_changes"."reason" in ('leaver', 'manual')),
	CONSTRAINT "ownership_changes_from_differs_from_to" CHECK ("ownership_changes"."from_person_id" is distinct from "ownership_changes"."to_person_id")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"left_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "people_workspace_email_unique" UNIQUE("workspace_id","email"),
	CONSTRAINT "people_email_lowercase" CHECK ("people"."email" = lower("people"."email")),
	CONSTRAINT "people_status_allowed" CHECK ("people"."status" in ('active', 'left')),
	CONSTRAINT "people_left_on_matches_status" CHECK (("people"."status" = 'left') = ("people"."left_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "review_cycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"quarter" text NOT NULL,
	"started_on" date NOT NULL,
	"closed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_cycles_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "review_cycles_workspace_quarter_unique" UNIQUE("workspace_id","quarter"),
	CONSTRAINT "review_cycles_closed_after_started" CHECK ("review_cycles"."closed_on" >= "review_cycles"."started_on")
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"still_used" boolean,
	"still_owned" boolean,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_items_cycle_app_unique" UNIQUE("cycle_id","app_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_owner_fk" FOREIGN KEY ("owner_id","workspace_id") REFERENCES "public"."people"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_backup_owner_fk" FOREIGN KEY ("backup_owner_id","workspace_id") REFERENCES "public"."people"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_app_fk" FOREIGN KEY ("app_id","workspace_id") REFERENCES "public"."apps"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_alerts" ADD CONSTRAINT "notice_alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_alerts" ADD CONSTRAINT "notice_alerts_app_fk" FOREIGN KEY ("app_id","workspace_id") REFERENCES "public"."apps"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_alerts" ADD CONSTRAINT "notice_alerts_acknowledged_by_fk" FOREIGN KEY ("acknowledged_by_id","workspace_id") REFERENCES "public"."people"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_changes" ADD CONSTRAINT "ownership_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_changes" ADD CONSTRAINT "ownership_changes_app_fk" FOREIGN KEY ("app_id","workspace_id") REFERENCES "public"."apps"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_changes" ADD CONSTRAINT "ownership_changes_from_person_fk" FOREIGN KEY ("from_person_id","workspace_id") REFERENCES "public"."people"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_changes" ADD CONSTRAINT "ownership_changes_to_person_fk" FOREIGN KEY ("to_person_id","workspace_id") REFERENCES "public"."people"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_cycle_fk" FOREIGN KEY ("cycle_id","workspace_id") REFERENCES "public"."review_cycles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_app_fk" FOREIGN KEY ("app_id","workspace_id") REFERENCES "public"."apps"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apps_workspace_name_active_unique" ON "apps" USING btree ("workspace_id",lower("name")) WHERE "apps"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "apps_workspace_notice_deadline_active_idx" ON "apps" USING btree ("workspace_id","notice_deadline") WHERE "apps"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "apps_owner_idx" ON "apps" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "apps_backup_owner_idx" ON "apps" USING btree ("backup_owner_id");--> statement-breakpoint
CREATE INDEX "attachments_app_idx" ON "attachments" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "notice_alerts_workspace_status_due_idx" ON "notice_alerts" USING btree ("workspace_id","status","due_on");--> statement-breakpoint
CREATE INDEX "notice_alerts_scheduled_due_idx" ON "notice_alerts" USING btree ("due_on") WHERE "notice_alerts"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "notice_alerts_acknowledged_by_idx" ON "notice_alerts" USING btree ("acknowledged_by_id");--> statement-breakpoint
CREATE INDEX "ownership_changes_app_created_idx" ON "ownership_changes" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE INDEX "ownership_changes_from_person_idx" ON "ownership_changes" USING btree ("from_person_id");--> statement-breakpoint
CREATE INDEX "ownership_changes_to_person_idx" ON "ownership_changes" USING btree ("to_person_id");--> statement-breakpoint
CREATE INDEX "review_items_app_idx" ON "review_items" USING btree ("app_id");