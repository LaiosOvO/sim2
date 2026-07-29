CREATE TABLE "external_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider_key" text NOT NULL,
	"tenant_key" text DEFAULT 'default' NOT NULL,
	"external_subject_id" text NOT NULL,
	"provider_user_id" text,
	"open_id" text,
	"union_id" text,
	"email" text,
	"login_name" text,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"raw_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_subject_unique" ON "external_identity" USING btree ("organization_id","provider_key","tenant_key","external_subject_id");--> statement-breakpoint
CREATE INDEX "external_identity_organization_user_idx" ON "external_identity" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "external_identity_provider_user_idx" ON "external_identity" USING btree ("organization_id","provider_key","provider_user_id");--> statement-breakpoint
CREATE INDEX "external_identity_open_id_idx" ON "external_identity" USING btree ("organization_id","provider_key","open_id");--> statement-breakpoint
CREATE INDEX "external_identity_union_id_idx" ON "external_identity" USING btree ("organization_id","provider_key","union_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_provider_user_unique" ON "external_identity" USING btree ("organization_id","provider_key","tenant_key","provider_user_id") WHERE "external_identity"."provider_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_open_id_unique" ON "external_identity" USING btree ("organization_id","provider_key","tenant_key","open_id") WHERE "external_identity"."open_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_union_id_unique" ON "external_identity" USING btree ("organization_id","provider_key","tenant_key","union_id") WHERE "external_identity"."union_id" IS NOT NULL;