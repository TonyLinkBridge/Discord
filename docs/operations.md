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

## RayFox Domain Intelligence release

Keep `RAYFOX_DOMAIN_INTELLIGENCE_MODE=disabled` until every gate below passes. The feature requires these additional sensitive production settings:

- `RAYFOX_DOMAIN_BETA_ROLE_IDS`: comma-separated Discord role IDs used during the internal beta.
- `RAYFOX_DOMAIN_TESTER_ROLE_IDS`: comma-separated staff role IDs allowed to see clearly labelled fixture commerce in a Vercel Preview. Existing `ADMIN_DISCORD_USER_IDS` are also treated as internal testers.
- `RAYNAME_COMMERCE_API_BASE_URL`: server-to-server RayName commerce API origin.
- `RAYNAME_COMMERCE_API_TOKEN`: private bearer token for that API.
- `RAYNAME_DOMAIN_PAGE_BASE_URL`: stable RayName page used when a member continues on the website.
- `RAYFOX_PUBLIC_BASE_URL`: HTTPS RayName origin serving `/api/rayfox/outbound`; for example `https://bot.rayname.com`.
- `RAYFOX_LINK_SIGNING_KEY`: independent base64-encoded random 32-byte key for 24-hour outbound link signatures.

For a Discord-only internal acceptance test, a Vercel Preview may set
`RAYFOX_DOMAIN_TEST_DATA=enabled`. The application accepts this flag only when
`VERCEL_ENV=preview` and the feature mode is `internal`. The public base URL is
derived from `VERCEL_URL`; a manually supplied value must match it exactly.
Messages and stored provider summaries identify the results as fixture data.
Production and public mode reject the flag.

In fixture mode, community members who are not internal testers receive only
live public-domain intelligence returned by RDAP/WHOIS, DNS, and TLS. They do
not receive fixture prices, fixture availability, fixture Premium decisions,
or extension comparison. `No registry record found` is not proof that a domain
can be purchased; the member must use `Check live price on RayName` for current
commercial information.

Internal testers receive the fixture commerce card only when their Discord user
ID is in `ADMIN_DISCORD_USER_IDS` or one of their roles is listed in
`RAYFOX_DOMAIN_TESTER_ROLE_IDS`. Fixture cards remain marked `Internal beta ·
Test data`. `Compare extensions`, sorting, `Previous`, `Next`, and `Domain
overview` read the existing query and do not consume another daily search.

Release in this order:

1. Keep `RAYFOX_DOMAIN_INTELLIGENCE_MODE=disabled`.
2. Create a disposable Neon branch, verify its branch ID differs from production, and apply `npm run db:migrate` to that branch.
3. Run unit, integration, type, lint, production-build, and domain E2E gates against the disposable branch.
4. Point the contract suite at RayName's non-production provider and verify all responses without using production transactions.
5. Register both guild commands with `npm run discord:register`.
6. Set the mode to `internal`, provide only the selected beta role IDs, and deploy.
7. Test one normal account without tester access and one internal tester. Confirm the normal account sees only sourced public intelligence, the tester sees labelled fixtures, 1/day and 3/day limits remain correct, comparison can return through `Domain overview`, navigation does not change usage, replies stay private, and provider failures remain safe.
8. Set the mode to `public` only after RayName supplies and passes all seven dependencies below.
9. To roll back, set the mode to `disabled` before reverting application code. Retain query, usage, interaction-claim, and conversion audit rows.

Run the controlled journey only against the disposable Neon branch:

```bash
VERIFICATION_TEST_DATABASE_URL="<temporary Neon branch URL>" \
VERIFICATION_TEST_BRANCH_ID="<temporary Neon branch ID>" \
VERIFICATION_PRODUCTION_BRANCH_ID="<production Neon branch ID>" \
npm run test:domain-intelligence:e2e
```

The runner asks Neon for the actual branch ID before cleanup. It refuses the production branch, fixed production connection configuration, non-Neon databases, or a branch-ID mismatch. RayName and Discord are replaced by deterministic services bound only to `127.0.0.1`; no real purchase, transfer, Discord message, or role mutation occurs.

Public release remains blocked until RayName provides:

1. server-authenticated availability and Premium lookup;
2. registration, renewal, and transfer prices with currency;
3. Premium registration and renewal pricing semantics;
4. transfer eligibility or an explicit `unknown` result;
5. a stable prefilled domain-page URL contract;
6. a non-production environment or deterministic fixture;
7. documented timeout, rate-limit, error, and freshness behavior.

Click events are not registrations, transfers, or revenue.

Read-only monitoring queries must aggregate away Discord identity and full domain labels:

```sql
-- Search outcomes by member tier.
SELECT tier, status, count(*)::bigint AS searches
FROM domain_query_requests
GROUP BY tier, status
ORDER BY tier, status;

-- Unique querying members; identity values are not returned.
SELECT count(DISTINCT discord_user_id)::bigint AS unique_querying_members
FROM domain_query_requests;

-- Top suffixes only; never return a complete domain label.
SELECT lower(regexp_replace(normalized_domain, '^.*\.', '')) AS tld,
       count(*)::bigint AS searches
FROM domain_query_requests
GROUP BY tld
ORDER BY searches DESC, tld
LIMIT 25;

-- Outbound intent only, not completed commerce.
SELECT action, count(*)::bigint AS outbound_clicks
FROM domain_conversion_events
GROUP BY action
ORDER BY action;

-- Safe fixed provider failure codes.
SELECT safe_error_code, count(*)::bigint AS failures
FROM domain_query_requests
WHERE status = 'failed' AND safe_error_code IS NOT NULL
GROUP BY safe_error_code
ORDER BY failures DESC, safe_error_code;

-- Latest recorded provider freshness without result snapshots or destinations.
SELECT provider.key AS provider,
       max(provider.value) AS latest_freshness
FROM domain_query_requests request
CROSS JOIN LATERAL jsonb_each_text(request.provider_summary) AS provider(key, value)
WHERE request.status = 'succeeded'
GROUP BY provider.key
ORDER BY provider.key;
```

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
