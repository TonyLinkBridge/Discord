# RayName Admin Operations

## Current production mode

Production remains fail-closed for RayName Marketing API data. Discord customer verification and the privacy-minimal Discord member snapshot may run in `partial-live` mode. Overview, Community, and Members show only synchronized Discord facts. Registrations, transfers, renewals, revenue, leads, campaigns, offers, content, analytics, price checks, domain availability, VIP automation, and reminders remain unavailable until their real providers exist.

`DEV_OPERATOR_ID` is for local development only and must be blank in Vercel.

Discord OAuth protects access but does not connect the Discord bot, member sync, or RayName business data.

## Required Vercel environment variables

- `AUTH_SECRET`: a long random secret generated for the deployment.
- `AUTH_DISCORD_ID`: Discord OAuth application ID.
- `AUTH_DISCORD_SECRET`: Discord OAuth client secret.
- `ADMIN_DISCORD_USER_IDS`: comma-separated Discord user IDs allowed into the admin console.
- `DEV_OPERATOR_ID`: blank in production.
- `DATA_MODE`: `unavailable` until the live provider exists.
- `DATABASE_URL`: Neon serverless/pooled Postgres connection string.
- `DISCORD_BOT_TOKEN`: private bot token, separate from the OAuth client secret.
- `DISCORD_APPLICATION_ID`: Discord application ID.
- `DISCORD_PUBLIC_KEY`: Discord application public key used for interaction signatures.
- `DISCORD_GUILD_ID`: RayName Domain Club server ID.
- `DISCORD_VERIFIED_ROLE_ID`: ID of the `Verified Customer` role.
- `VERIFICATION_DATA_KEY`: base64-encoded random 32-byte root key used to derive separate encryption and lookup keys.
- `CRON_SECRET`: long random value protecting retention and member-sync Cron endpoints.

The Discord OAuth redirect URL is:

`https://rayname-admin.vercel.app/api/auth/callback/discord`

## Discord verification and member-sync deployment

1. In Discord Developer Portal → RayFox → Bot, enable **Server Members Intent**. Keep the bot role above `Verified Customer`; Administrator permission is not required.
2. Create a disposable Neon branch named `verification-test` from production. If the database already has the Discord verification tables but predates Drizzle migration tracking, run `env DATABASE_URL="$VERIFICATION_TEST_DATABASE_URL" npm run db:baseline` once. The command refuses to record the baseline unless the expected enums, tables, indexes, and foreign keys are present, and it is safe to re-run.
3. Apply checked-in migrations to the disposable branch with `env DATABASE_URL="$VERIFICATION_TEST_DATABASE_URL" npm run db:migrate`. This uses Neon HTTP and includes `drizzle/0001_discord_member_sync.sql`.
4. Run repository integration, route, UI, type, lint, build, and browser tests against the disposable branch.
5. If production also predates migration tracking, run the same `npm run db:baseline` command against its `DATABASE_URL`, then apply migrations with `env DATABASE_URL="$DATABASE_URL" npm run db:migrate`. Never use `drizzle-kit push` on production.
6. Add every required variable to Vercel as Sensitive for Production and Preview. Do not paste values into source, screenshots, issues, or logs.
7. Deploy before setting Discord's Interactions Endpoint URL to `https://rayname-admin.vercel.app/api/discord/interactions`.
8. After Discord accepts the signature challenge, register the guild-scoped `/verify` command.

Run the browser verification journey only against the disposable Neon branch:

```bash
VERIFICATION_TEST_DATABASE_URL="<temporary Neon branch URL>" \
VERIFICATION_TEST_BRANCH_ID="<temporary Neon branch ID>" \
VERIFICATION_PRODUCTION_BRANCH_ID="<production Neon branch ID>" \
npm run test:e2e
```

The test runner asks Neon which branch it is connected to before cleanup, requires
that branch to match the designated test ID, and separately refuses the production
branch ID even when pooled and direct connection URLs differ. It also refuses the
configured production `DATABASE_URL`, uses fixed test-only Discord identities, and
sends role requests only to a loopback Discord API stub. Do not set
`DISCORD_API_BASE_URL` in Vercel; production always uses Discord's official API
endpoint.

The member-sync journey uses two deterministic test-only Discord snapshots. It proves member persistence, rename and role changes, one join, and one leave. Cleanup is limited to the fixed test guild and fixed user IDs after the Neon branch identity guard succeeds.

Register the guild command from a trusted operator environment only:

```bash
npm run discord:register
```

The command performs one guild-scoped `PUT`, reports only registered command names, and never prints the bot token. The `verification-test` branch should remain temporary and must not use the production connection string in automated tests.

## Discord member-sync operation

After the production migration and deployment:

1. Open **Members** as an allowlisted admin.
2. Confirm the panel says **Never synced**, then press **Sync now** once.
3. Compare the synchronized member and bot counts with Discord Server Insights or the Discord member list. Bot accounts are shown separately; Overview's “Discord Members” count means people and excludes bots.
4. Refresh Members and confirm the directory persists. Check Overview and Community; the status line must say `Discord data connected · RayName Marketing API pending`.
5. In Vercel → Project → Cron Jobs, confirm `/api/internal/discord-member-sync` runs daily at `03:47 UTC`. Retention remains at `03:17 UTC`.

The Cron and manual button call the same leased synchronization service. A second overlapping run returns “already running” instead of writing a competing snapshot.

Safe failure handling:

- `401`: rotate or correct `DISCORD_BOT_TOKEN`, redeploy, then run Sync now.
- `403`: enable Server Members Intent and confirm the bot still belongs to the server.
- `429`: keep the last successful snapshot visible and retry after Discord's rate limit clears.
- `5xx` or network failure: keep the last successful snapshot visible and retry later.

The latest failed attempt marks member sync as degraded; it never replaces or deletes the last successful snapshot. A failure before the first successful run leaves Overview, Community, and the member directory unavailable.

To pause automatic sync without deleting member data, remove only the member-sync entry from `vercel.json` and redeploy. The manual Sync now button remains available. To disable all member synchronization, remove a required Discord bot variable and redeploy; stored snapshots remain in Neon.

No Railway service is required. Vercel runs the daily Cron and manual Server Action, while Neon stores snapshots. This design is appropriate for a daily job, not a permanently connected Discord gateway bot.

## Rotation and recovery

- Rotate a Discord bot token in Discord first, replace `DISCORD_BOT_TOKEN` in Vercel, redeploy, then revoke the old token. A token shown in any output is compromised.
- Rotate `VERIFICATION_DATA_KEY` only with a planned data migration. Existing encrypted email cannot be decrypted after an uncoordinated key change.
- `role_failed` is durable. Fix the Discord permission, hierarchy, member, or rate-limit condition, then use Retry; Retry reuses the same role-operation record.
- To disable verification without deleting records, remove one required verification variable and redeploy. The capability returns to unavailable while Neon records remain.
- Roll back application code to the previous verified commit; do not drop tables during application rollback.
- If member sync must be rolled back, disable its Cron first, deploy the previous application commit, and retain `discord_members`, `discord_guild_roles`, and `discord_member_sync_runs` for recovery. Do not drop the tables during an application rollback.

## Retention

Vercel calls `/api/internal/verification-retention` daily at `03:17 UTC`. It requires `Authorization: Bearer <CRON_SECRET>`. The idempotent job removes encrypted email, IV, auth tag, lookup hash, and submitted domain 90 days after approval or rejection, while preserving non-sensitive audit history.

## What is still required for live business data

OAuth alone is not a business-data integration. Discord member snapshots now provide identity, membership, role, verification, and bot facts only. Real business dashboards and write actions still require:

- RayName Marketing API access;
- a tracked-link and attribution provider;
- Discord publishing and renewal-event workers;
- deployment and job monitoring.

Until those providers are connected, unavailable controls stay hidden or disabled and the console must not claim success.
