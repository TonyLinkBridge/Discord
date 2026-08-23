CREATE TYPE "public"."role_operation" AS ENUM('assign', 'remove');--> statement-breakpoint
CREATE TYPE "public"."role_operation_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'processing', 'approved', 'rejected', 'role_failed');--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_interactions" (
	"interaction_id" text PRIMARY KEY NOT NULL,
	"interaction_type" integer NOT NULL,
	"discord_user_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discord_members" (
	"discord_user_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"display_name" text NOT NULL,
	"discord_handle" text NOT NULL,
	"avatar_url" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_role_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_request_id" uuid NOT NULL,
	"discord_user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"operation" "role_operation" NOT NULL,
	"status" "role_operation_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"last_attempt_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" text NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"email_ciphertext" text,
	"email_iv" text,
	"email_auth_tag" text,
	"email_lookup_hash" text,
	"domain" text,
	"review_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"role_assigned_at" timestamp with time zone,
	"sensitive_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_role_operations" ADD CONSTRAINT "discord_role_operations_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_discord_user_id_discord_members_discord_user_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_members"("discord_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discord_role_operations_request_role_operation_key" ON "discord_role_operations" USING btree ("verification_request_id","role_id","operation");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_requests_one_active_per_member" ON "verification_requests" USING btree ("discord_user_id") WHERE "verification_requests"."status" in ('pending', 'processing', 'role_failed');