# RayName Admin Operations

## Current production mode

Production uses `DATA_MODE=unavailable` until a live provider is implemented. In this mode the dashboard shows configuration and connection state only. It does not load sample members, leads, campaigns, offers, content, analytics, alerts, or operational health.

`DEV_OPERATOR_ID` is for local development only and must be blank in Vercel.

Discord OAuth protects access but does not connect the Discord bot, member sync, or RayName business data.

## Required Vercel environment variables

- `AUTH_SECRET`: a long random secret generated for the deployment.
- `AUTH_DISCORD_ID`: Discord OAuth application ID.
- `AUTH_DISCORD_SECRET`: Discord OAuth client secret.
- `ADMIN_DISCORD_USER_IDS`: comma-separated Discord user IDs allowed into the admin console.
- `DEV_OPERATOR_ID`: blank in production.
- `DATA_MODE`: `unavailable` until the live provider exists.

The Discord OAuth redirect URL is:

`https://rayname-admin.vercel.app/api/auth/callback/discord`

## What is still required for live business data

OAuth alone is not a data integration. Real dashboards and write actions require:

- a Discord bot and member-sync service;
- a persistent database;
- RayName Marketing API access;
- a tracked-link and attribution provider;
- Discord publishing and renewal-event workers;
- deployment and job monitoring.

Until those providers are connected, unavailable controls stay hidden or disabled and the console must not claim success.
