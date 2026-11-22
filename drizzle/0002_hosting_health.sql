ALTER TABLE "app_hosting" ADD COLUMN "runtime" text;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "runtime_version" text;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "end_of_support_source" text;--> statement-breakpoint
-- Hand-written: every date recorded before this migration was typed by a person,
-- so the hosting check must never overwrite it.
UPDATE "app_hosting" SET "end_of_support_source" = 'manual' WHERE "end_of_support_on" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "incidents" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "health_error" text;--> statement-breakpoint
ALTER TABLE "app_hosting" ADD CONSTRAINT "app_hosting_end_of_support_source_allowed" CHECK ("app_hosting"."end_of_support_source" in ('manual', 'endoflife.date'));--> statement-breakpoint
ALTER TABLE "app_hosting" ADD CONSTRAINT "app_hosting_end_of_support_has_source" CHECK (("app_hosting"."end_of_support_on" is null) = ("app_hosting"."end_of_support_source" is null));