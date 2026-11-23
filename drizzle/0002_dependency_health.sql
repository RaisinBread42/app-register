ALTER TABLE "app_dependencies" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_dependencies" ADD COLUMN "is_dev" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_dependencies" ADD COLUMN "advisories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app_dependencies" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_dependencies" ADD COLUMN "check_error" text;--> statement-breakpoint
ALTER TABLE "app_dependencies" ADD CONSTRAINT "app_dependencies_source_allowed" CHECK ("app_dependencies"."source" in ('manual', 'import'));--> statement-breakpoint
ALTER TABLE "app_dependencies" ADD CONSTRAINT "app_dependencies_check_error_allowed" CHECK ("app_dependencies"."check_error" in ('not_found', 'unavailable', 'invalid_version'));