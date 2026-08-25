CREATE TABLE "domain_query_daily_usage" (
	"guild_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"usage_day" date NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_query_daily_usage_guild_id_discord_user_id_usage_day_pk" PRIMARY KEY("guild_id","discord_user_id","usage_day"),
	CONSTRAINT "domain_query_daily_usage_reserved_count_range" CHECK ("domain_query_daily_usage"."reserved_count" between 0 and 3)
);
