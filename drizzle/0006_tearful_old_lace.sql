ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_id_workspace_unique" UNIQUE("id","workspace_id");--> statement-breakpoint
CREATE TABLE "api_key_scopes" (
	"api_key_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "api_key_scopes_pk" PRIMARY KEY("api_key_id","scope"),
	CONSTRAINT "api_key_scopes_scope_allowed" CHECK ("api_key_scopes"."scope" in ('apps:read', 'apps:write', 'dependencies:read', 'dependencies:write', 'hosting:read', 'hosting:write'))
);
--> statement-breakpoint
ALTER TABLE "api_key_scopes" ADD CONSTRAINT "api_key_scopes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_scopes" ADD CONSTRAINT "api_key_scopes_key_fk" FOREIGN KEY ("api_key_id","workspace_id") REFERENCES "public"."api_keys"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_resource_kind_allowed";--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_resource_kind_allowed" CHECK ("idempotency_keys"."resource_kind" in ('app', 'person', 'dependency', 'hosting', 'notice_alert', 'dependency_import', 'api_key'));
