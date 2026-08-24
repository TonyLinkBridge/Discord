CREATE TYPE "public"."discord_membership_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "public"."discord_sync_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."discord_sync_trigger" AS ENUM('cron', 'manual');--> statement-breakpoint
CREATE TABLE "discord_guild_roles" (
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"name" text NOT NULL,
	"color" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"managed" boolean DEFAULT false NOT NULL,
	"permissions" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_guild_roles_guild_id_role_id_pk" PRIMARY KEY("guild_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "discord_member_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"trigger" "discord_sync_trigger" NOT NULL,
	"status" "discord_sync_status" DEFAULT 'running' NOT NULL,
	"requested_by" text,
	"member_count" integer,
	"active_member_count" integer,
	"bot_count" integer,
	"safe_error_code" text,
	"safe_error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "global_name" text;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "guild_display_name" text;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "avatar_hash" text;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "membership_status" "discord_membership_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_members" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "discord_member_sync_runs_one_running_per_guild" ON "discord_member_sync_runs" USING btree ("guild_id") WHERE "discord_member_sync_runs"."status" = 'running';