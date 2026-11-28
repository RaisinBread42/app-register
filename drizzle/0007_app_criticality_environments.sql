CREATE TABLE "app_environments" (
	"workspace_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_environments_pk" PRIMARY KEY("app_id","environment"),
	CONSTRAINT "app_environments_environment_allowed" CHECK ("app_environments"."environment" in ('production', 'staging', 'development', 'other'))
);
--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "backup_owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "criticality" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "repository_url" text;--> statement-breakpoint
ALTER TABLE "app_environments" ADD CONSTRAINT "app_environments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_environments" ADD CONSTRAINT "app_environments_app_fk" FOREIGN KEY ("app_id","workspace_id") REFERENCES "public"."apps"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_criticality_allowed" CHECK ("apps"."criticality" in ('low', 'medium', 'high', 'critical'));