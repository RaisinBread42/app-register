ALTER TABLE "app_hosting" ADD COLUMN "runtime" text;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "runtime_version" text;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "end_of_support_source" text;--> statement-breakpoint
-- Hand-written: every date recorded before this migration was typed by a person,
-- so the hosting check must never overwrite it.
UPDATE "app_hosting" SET "end_of_support_source" = 'manual' WHERE "end_of_support_on" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "is_version_inexact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "health_error" text;--> statement-breakpoint
-- Hand-moved up: the foreign key of "hosting_incidents" below needs this key to exist first.
ALTER TABLE "app_hosting" ADD CONSTRAINT "app_hosting_id_workspace_unique" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "app_hosting" ADD CONSTRAINT "app_hosting_end_of_support_source_allowed" CHECK ("app_hosting"."end_of_support_source" in ('manual', 'endoflife.date'));--> statement-breakpoint
ALTER TABLE "app_hosting" ADD CONSTRAINT "app_hosting_end_of_support_has_source" CHECK (("app_hosting"."end_of_support_on" is null) = ("app_hosting"."end_of_support_source" is null));--> statement-breakpoint
ALTER TABLE "app_hosting" ADD CONSTRAINT "app_hosting_version_inexact_only_looked_up" CHECK (not "app_hosting"."is_version_inexact" or coalesce("app_hosting"."end_of_support_source", '') = 'endoflife.date');--> statement-breakpoint
CREATE TABLE "hosting_incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"hosting_id" uuid NOT NULL,
	"title" text NOT NULL,
	"impact" text NOT NULL,
	"scope" text NOT NULL,
	"url" text,
	"started_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_incidents_hosting_position_unique" UNIQUE("hosting_id","position"),
	CONSTRAINT "hosting_incidents_title_not_blank" CHECK (btrim("hosting_incidents"."title") <> ''),
	CONSTRAINT "hosting_incidents_impact_allowed" CHECK ("hosting_incidents"."impact" in ('major', 'minor', 'maintenance')),
	CONSTRAINT "hosting_incidents_scope_allowed" CHECK ("hosting_incidents"."scope" in ('service', 'provider'))
);
--> statement-breakpoint
ALTER TABLE "hosting_incidents" ADD CONSTRAINT "hosting_incidents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_incidents" ADD CONSTRAINT "hosting_incidents_hosting_fk" FOREIGN KEY ("hosting_id","workspace_id") REFERENCES "public"."app_hosting"("id","workspace_id") ON DELETE cascade ON UPDATE no action;
