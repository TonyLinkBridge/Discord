CREATE TABLE "domain_query_interaction_claims" (
	"interaction_id" text PRIMARY KEY NOT NULL,
	"discord_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
