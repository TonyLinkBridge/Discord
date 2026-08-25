CREATE TYPE "public"."domain_conversion_action" AS ENUM('register', 'transfer', 'full_intelligence', 'continue_on_site');--> statement-breakpoint
CREATE TYPE "public"."domain_query_status" AS ENUM('started', 'succeeded', 'failed', 'quota_rejected');--> statement-breakpoint
CREATE TYPE "public"."domain_query_tier" AS ENUM('member', 'verified');--> statement-breakpoint
CREATE TABLE "domain_conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_request_id" uuid NOT NULL,
	"discord_user_id" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"action" "domain_conversion_action" NOT NULL,
	"destination_url" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_query_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"tier" "domain_query_tier" NOT NULL,
	"status" "domain_query_status" DEFAULT 'started' NOT NULL,
	"usage_day" date NOT NULL,
	"charged_at" timestamp with time zone,
	"safe_error_code" text,
	"provider_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "domain_conversion_events" ADD CONSTRAINT "domain_conversion_events_query_request_id_domain_query_requests_id_fk" FOREIGN KEY ("query_request_id") REFERENCES "public"."domain_query_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_conversion_events_request_action_key" ON "domain_conversion_events" USING btree ("query_request_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_query_requests_interaction_key" ON "domain_query_requests" USING btree ("interaction_id");--> statement-breakpoint
CREATE INDEX "domain_query_requests_usage_lookup" ON "domain_query_requests" USING btree ("guild_id","discord_user_id","usage_day","status");--> statement-breakpoint
CREATE INDEX "domain_query_requests_replay_lookup" ON "domain_query_requests" USING btree ("discord_user_id","normalized_domain","completed_at");