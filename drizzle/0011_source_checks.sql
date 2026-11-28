CREATE TABLE "source_checks" (
	"workspace_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_checks_pk" PRIMARY KEY("workspace_id","source_id"),
	CONSTRAINT "source_checks_error_length" CHECK (char_length("source_checks"."last_error") <= 300)
);
--> statement-breakpoint
ALTER TABLE "app_hosting" ADD COLUMN "last_good_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_checks" ADD CONSTRAINT "source_checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Copy across, never overwrite: a row whose last check read every source had its good reading then.
UPDATE "app_hosting" SET "last_good_check_at" = "health_checked_at" WHERE "health_error" IS NULL AND "health_checked_at" IS NOT NULL AND "last_good_check_at" IS NULL;
