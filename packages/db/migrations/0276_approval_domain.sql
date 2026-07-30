CREATE TYPE "public"."approval_mode" AS ENUM('any', 'all');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'returned', 'withdrawn', 'escalated', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."approval_task_status" AS ENUM('pending', 'approved', 'rejected', 'transferred', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."business_data_scope" AS ENUM('all', 'organization', 'workspace', 'project_member', 'assigned', 'self', 'custom');--> statement-breakpoint
CREATE TABLE "approval_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"task_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_external_id" text,
	"comment" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_definition_version" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"spec" jsonb NOT NULL,
	"created_by" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_effect_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"event" text NOT NULL,
	"approval_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_instance" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"definition_version_id" text,
	"execution_id" text NOT NULL,
	"context_id" text NOT NULL,
	"business_type" text DEFAULT 'workflow' NOT NULL,
	"business_id" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"mode" "approval_mode" DEFAULT 'any' NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"resume_status" text DEFAULT 'pending' NOT NULL,
	"resume_execution_id" text,
	"resume_error" text,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version_no" integer DEFAULT 0 NOT NULL,
	"requested_by" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_step_instance" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"definition_version_id" text NOT NULL,
	"node_id" text NOT NULL,
	"node_name" text NOT NULL,
	"mode" "approval_mode" DEFAULT 'any' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_task" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"step_instance_id" text,
	"channel" text DEFAULT 'feishu' NOT NULL,
	"receive_id_type" text NOT NULL,
	"reviewer_external_id" text NOT NULL,
	"reviewer_user_id" text,
	"reviewer_role_code" text,
	"decision_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "approval_task_status" DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"decided_by_external_id" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_menu" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"path" text,
	"icon" text,
	"order" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'core' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_menu_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "business_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_role_menu" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_role_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_user_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"workspace_id" text,
	"data_scope" "business_data_scope" DEFAULT 'workspace' NOT NULL,
	"data_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_approval_id_approval_instance_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approval_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_task_id_approval_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."approval_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_definition" ADD CONSTRAINT "approval_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_definition" ADD CONSTRAINT "approval_definition_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_definition_version" ADD CONSTRAINT "approval_definition_version_definition_id_approval_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."approval_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_definition_version" ADD CONSTRAINT "approval_definition_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_effect_outbox" ADD CONSTRAINT "approval_effect_outbox_approval_id_approval_instance_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approval_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instance" ADD CONSTRAINT "approval_instance_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instance" ADD CONSTRAINT "approval_instance_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instance" ADD CONSTRAINT "approval_instance_definition_version_id_approval_definition_version_id_fk" FOREIGN KEY ("definition_version_id") REFERENCES "public"."approval_definition_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instance" ADD CONSTRAINT "approval_instance_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step_instance" ADD CONSTRAINT "approval_step_instance_approval_id_approval_instance_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approval_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step_instance" ADD CONSTRAINT "approval_step_instance_definition_version_id_approval_definition_version_id_fk" FOREIGN KEY ("definition_version_id") REFERENCES "public"."approval_definition_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_task" ADD CONSTRAINT "approval_task_approval_id_approval_instance_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approval_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_task" ADD CONSTRAINT "approval_task_step_instance_id_approval_step_instance_id_fk" FOREIGN KEY ("step_instance_id") REFERENCES "public"."approval_step_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_task" ADD CONSTRAINT "approval_task_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_role" ADD CONSTRAINT "business_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_role" ADD CONSTRAINT "business_role_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_role_menu" ADD CONSTRAINT "business_role_menu_role_id_business_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."business_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_role_menu" ADD CONSTRAINT "business_role_menu_menu_id_business_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."business_menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_role_permission" ADD CONSTRAINT "business_role_permission_role_id_business_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."business_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_user_role" ADD CONSTRAINT "business_user_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_user_role" ADD CONSTRAINT "business_user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_user_role" ADD CONSTRAINT "business_user_role_role_id_business_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."business_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_user_role" ADD CONSTRAINT "business_user_role_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_user_role" ADD CONSTRAINT "business_user_role_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_decision_approval_created_idx" ON "approval_decision" USING btree ("approval_id","created_at");--> statement-breakpoint
CREATE INDEX "approval_decision_task_id_idx" ON "approval_decision" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_definition_workspace_code_unique" ON "approval_definition" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE INDEX "approval_definition_workspace_enabled_idx" ON "approval_definition" USING btree ("workspace_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_definition_version_unique" ON "approval_definition_version" USING btree ("definition_id","version");--> statement-breakpoint
CREATE INDEX "approval_definition_version_status_idx" ON "approval_definition_version" USING btree ("definition_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_effect_outbox_idempotency_unique" ON "approval_effect_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "approval_effect_outbox_status_created_idx" ON "approval_effect_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_instance_pause_point_unique" ON "approval_instance" USING btree ("execution_id","context_id");--> statement-breakpoint
CREATE INDEX "approval_instance_workspace_status_idx" ON "approval_instance" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "approval_instance_business_idx" ON "approval_instance" USING btree ("workspace_id","business_type","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_step_instance_node_round_unique" ON "approval_step_instance" USING btree ("approval_id","node_id","round");--> statement-breakpoint
CREATE INDEX "approval_step_instance_pending_due_idx" ON "approval_step_instance" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_task_decision_token_unique" ON "approval_task" USING btree ("decision_token");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_task_reviewer_unique" ON "approval_task" USING btree ("approval_id","channel","reviewer_external_id") WHERE "approval_task"."step_instance_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_task_step_reviewer_unique" ON "approval_task" USING btree ("step_instance_id","channel","reviewer_external_id") WHERE "approval_task"."step_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "approval_task_approval_status_idx" ON "approval_task" USING btree ("approval_id","status");--> statement-breakpoint
CREATE INDEX "business_menu_parent_id_idx" ON "business_menu" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "business_menu_source_idx" ON "business_menu" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "business_role_organization_code_unique" ON "business_role" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "business_role_organization_id_idx" ON "business_role" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_role_menu_unique" ON "business_role_menu" USING btree ("role_id","menu_id");--> statement-breakpoint
CREATE INDEX "business_role_menu_role_id_idx" ON "business_role_menu" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "business_role_menu_menu_id_idx" ON "business_role_menu" USING btree ("menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_role_permission_unique" ON "business_role_permission" USING btree ("role_id","permission_code");--> statement-breakpoint
CREATE INDEX "business_role_permission_role_id_idx" ON "business_role_permission" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "business_role_permission_code_idx" ON "business_role_permission" USING btree ("permission_code");--> statement-breakpoint
CREATE INDEX "business_user_role_organization_user_idx" ON "business_user_role" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "business_user_role_workspace_user_idx" ON "business_user_role" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "business_user_role_role_id_idx" ON "business_user_role" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_user_role_organization_binding_unique" ON "business_user_role" USING btree ("organization_id","user_id","role_id") WHERE "business_user_role"."workspace_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "business_user_role_workspace_binding_unique" ON "business_user_role" USING btree ("organization_id","user_id","role_id","workspace_id") WHERE "business_user_role"."workspace_id" IS NOT NULL;