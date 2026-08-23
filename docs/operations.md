# RayName Admin Operations

## Current production mode

Production remains fail-closed for RayName Marketing API data. Discord customer verification may run in `partial-live` mode: only the real verification queue is enabled, while member sync, leads, campaigns, offers, content, analytics, price checks, domain availability, VIP automation, and reminders remain unavailable.

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
- `CRON_SECRET`: long random value protecting the retention endpoint.

The Discord OAuth redirect URL is:

`https://rayname-admin.vercel.app/api/auth/callback/discord`

## Discord verification deployment

1. Create a Neon branch named `verification-test` from production and apply checked-in migrations there first with `env DATABASE_URL="$VERIFICATION_TEST_DATABASE_URL" npx drizzle-kit migrate`.
2. Run repository integration, route, UI, type, lint, build, and browser tests against the test branch.
3. Apply the same checked-in migration to Neon production. Never use `drizzle-kit push` on production.
4. Add every verification variable to Vercel as Sensitive for Production and Preview. Do not paste values into source, screenshots, issues, or logs.
5. Deploy before setting Discord's Interactions Endpoint URL to `https://rayname-admin.vercel.app/api/discord/interactions`.
6. After Discord accepts the signature challenge, register the guild-scoped `/verify` command.
7. Keep the bot role above `Verified Customer`; the bot does not need Administrator.

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

Register the guild command from a trusted operator environment only:

```bash
npm run discord:register
```

The command performs one guild-scoped `PUT`, reports only registered command names, and never prints the bot token. The `verification-test` branch should remain temporary and must not use the production connection string in automated tests.

## Rotation and recovery

- Rotate a Discord bot token in Discord first, replace `DISCORD_BOT_TOKEN` in Vercel, redeploy, then revoke the old token. A token shown in any output is compromised.
- Rotate `VERIFICATION_DATA_KEY` only with a planned data migration. Existing encrypted email cannot be decrypted after an uncoordinated key change.
- `role_failed` is durable. Fix the Discord permission, hierarchy, member, or rate-limit condition, then use Retry; Retry reuses the same role-operation record.
- To disable verification without deleting records, remove one required verification variable and redeploy. The capability returns to unavailable while Neon records remain.
- Roll back application code to the previous verified commit; do not drop tables during application rollback.

## Retention

Vercel calls `/api/internal/verification-retention` daily at `03:17 UTC`. It requires `Authorization: Bearer <CRON_SECRET>`. The idempotent job removes encrypted email, IV, auth tag, lookup hash, and submitted domain 90 days after approval or rejection, while preserving non-sensitive audit history.

## What is still required for live business data

OAuth alone is not a data integration. Real dashboards and write actions require:

- a Discord bot and member-sync service;
- a persistent database;
- RayName Marketing API access;
- a tracked-link and attribution provider;
- Discord publishing and renewal-event workers;
- deployment and job monitoring.

Until those providers are connected, unavailable controls stay hidden or disabled and the console must not claim success.
