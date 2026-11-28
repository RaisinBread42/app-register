CREATE TABLE "app_notice_matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"notice_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"component" text NOT NULL,
	"version" text,
	"region" text,
	"match_reason" text NOT NULL,
	"confidence" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_notice_matches_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "app_notice_matches_notice_app_component_unique" UNIQUE("notice_id","app_id","component"),
	CONSTRAINT "app_notice_matches_confidence_allowed" CHECK ("app_notice_matches"."confidence" in ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text,
	"external_id" text,
	"origin" text NOT NULL,
	"published_at" timestamp with time zone,
	"due_on" date,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_upstream_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notices_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "notices_workspace_dedupe_unique" UNIQUE("workspace_id","dedupe_key"),
	CONSTRAINT "notices_category_allowed" CHECK ("notices"."category" in ('security', 'lifecycle', 'outage', 'licensing', 'pricing', 'deadline')),
	CONSTRAINT "notices_severity_allowed" CHECK ("notices"."severity" in ('critical', 'high', 'medium', 'low', 'unknown')),
	CONSTRAINT "notices_source_allowed" CHECK ("notices"."source" in ('osv', 'endoflife_date', 'status_feed', 'manual')),
	CONSTRAINT "notices_origin_allowed" CHECK ("notices"."origin" in ('external', 'person')),
	CONSTRAINT "notices_title_not_blank" CHECK (btrim("notices"."title") <> '')
);
--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD CONSTRAINT "app_notice_matches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD CONSTRAINT "app_notice_matches_notice_fk" FOREIGN KEY ("notice_id","workspace_id") REFERENCES "public"."notices"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_notice_matches" ADD CONSTRAINT "app_notice_matches_app_fk" FOREIGN KEY ("app_id","workspace_id") REFERENCES "public"."apps"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_notice_matches_app_idx" ON "app_notice_matches" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "notices_workspace_severity_idx" ON "notices" USING btree ("workspace_id","severity");