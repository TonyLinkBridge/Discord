# RayName Discord Member Sync Design

**Date:** 2026-08-24

**Status:** Proposed; pending written-spec review

**Scope:** Discord member and role synchronization only

## Goal

Synchronize the real RayName Domain Club member directory from Discord into Neon, then expose only the Discord-backed facts that the RayName Admin console can truthfully support. The first release runs on the existing Next.js/Vercel application, uses the existing Discord bot and Neon database, and does not require Railway or a permanent Gateway connection.

## Confirmed decisions

- Store the minimum useful member profile: Discord user ID, username/handle, display name, avatar reference, guild join time, role IDs, bot flag, and membership state.
- Never ingest member email, messages, direct messages, presence, browsing activity, or message history.
- Run one automatic full synchronization per day on Vercel Hobby and provide an authorized **Sync now** action in the admin console.
- Keep registration, transfer, renewal, revenue, lead, offer, VIP-candidate, and Marketing API data unavailable until their real providers exist.
- Mark members missing from a complete snapshot as `left`; do not hard-delete them during synchronization.
- Preserve the existing verification workflow and its `verifiedAt` history.

## Non-goals

- No Discord Gateway/WebSocket worker.
- No real-time presence or activity tracking.
- No message or channel-content ingestion.
- No automatic VIP detection.
- No member role editing from the directory.
- No Marketing API, domain price, availability, renewal, or attribution work.
- No fabricated values for segment, customer status, registration source, last activity, or engagement.

## Architecture

The feature is one server-only pipeline with two triggers:

1. Vercel calls a protected daily route.
2. An allowlisted admin uses **Sync now** on the Members page.

Both triggers call the same `DiscordMemberSyncService`. The service acquires a database-backed per-guild lease, fetches Discord roles and every guild-member page, validates and normalizes the complete snapshot, then asks the repository to apply it atomically. UI code never receives the bot token or database URL.

```text
Vercel Cron ─┐
             ├─> MemberSyncService ─> Discord REST API
Admin action ┘            │
                          └─> Neon snapshot transaction
                                      │
                                      ├─> Members directory
                                      ├─> Discord/Verified metrics
                                      └─> Sync health and last-run status
```

The existing verification runtime remains responsible for verification requests, role assignment, and review DMs. Member sync reads the resulting Discord role state; it does not replace or bypass verification.

## Discord API boundary

Create a focused server-only client instead of expanding UI-facing code:

```ts
interface DiscordGuildSnapshotClient {
  listGuildRoles(guildId: string): Promise<DiscordGuildRole[]>;
  listAllGuildMembers(guildId: string): Promise<DiscordGuildMember[]>;
}
```

`listAllGuildMembers` calls `GET /guilds/{guild.id}/members` with `limit=1000` and advances `after` with the final user ID until the returned page contains fewer than 1,000 members. The client uses the existing bot-token authorization pattern, `cache: "no-store"`, a bounded timeout, and safe typed failures for 401, 403, 429, malformed responses, timeouts, and other Discord failures.

The Discord application must have the `GUILD_MEMBERS` privileged intent enabled. This is required by Discord for the HTTP List Guild Members endpoint even though the implementation does not open a Gateway connection.

Role metadata comes from Discord's guild-role endpoint. The application stores role IDs on members and the corresponding safe role metadata separately so renamed roles remain accurate without adding one environment variable per role. The existing `DISCORD_VERIFIED_ROLE_ID` remains authoritative for verification state.

## Data model

Add a checked-in Drizzle migration. Do not use `drizzle-kit push` on production.

### Extend `discord_members`

- `username`: Discord username, required after the first successful sync.
- `global_name`: nullable Discord global display name.
- `guild_display_name`: nickname or best guild display name.
- `avatar_hash`: nullable Discord or guild-avatar reference; derive public CDN URLs when reading.
- `joined_at`: nullable Discord guild join timestamp.
- `role_ids`: JSON array of Discord role IDs, default `[]`.
- `is_bot`: boolean, default `false`.
- `membership_status`: `active | left`, default `active`.
- `last_seen_at`: timestamp of the last complete snapshot containing the member.
- `left_at`: nullable timestamp set only after a complete snapshot omits the member.

Retain `display_name`, `discord_handle`, `avatar_url`, `verified_at`, and current verification foreign-key compatibility during migration. Reads should prefer synchronized fields while verification submissions created before the first member sync remain valid.

### Add `discord_guild_roles`

- composite key: `guild_id`, `role_id`
- `name`
- `color`
- `position`
- `managed`
- `permissions`
- `updated_at`

Role names and cosmetic metadata are safe operational data. No role permissions are changed by this feature.

### Add `discord_member_sync_runs`

- `id`
- `guild_id`
- `trigger`: `cron | manual`
- `status`: `running | succeeded | failed`
- `requested_by`: nullable admin Discord user ID
- `started_at`, `completed_at`
- `member_count`, `active_member_count`, `bot_count`
- `safe_error_code`, `safe_error_message`

A partial unique index allows only one `running` row per guild. A run older than 15 minutes may be closed as failed before a new lease is acquired, preventing an abandoned invocation from blocking synchronization forever.

## Snapshot and transaction rules

1. Acquire the per-guild synchronization lease before calling Discord.
2. Fetch roles and all member pages outside the database transaction.
3. Reject duplicate user IDs, missing user IDs, malformed role arrays, or incomplete pagination.
4. Start one atomic PostgreSQL statement only after the full snapshot is validated. The current Neon HTTP driver does not support callback transactions, so role, member, leave-state, run, and audit writes are composed as data-modifying CTEs in one statement.
5. Upsert roles.
6. Upsert members and set `active`, `lastSeenAt`, current roles, bot state, identity fields, and join time.
7. Derive `verifiedAt` only when the configured Verified Customer role is present and no verified timestamp exists. Never clear historical `verifiedAt` during a normal sync.
8. Mark previously active members as `left` only when they are absent from the complete validated snapshot.
9. Complete the sync-run record with safe counts.

If any Discord page, validation step, or database write fails, the last successful member snapshot stays available. A partial fetch must never mark anyone as left.

## Authorization and routes

### Daily route

Add `GET /api/internal/discord-member-sync`.

- Require `Authorization: Bearer <CRON_SECRET>` using timing-safe comparison.
- Return only safe status, run ID, counts, and timestamps.
- Never return member records, the bot token, database details, or raw Discord response bodies.
- Add one once-daily entry to `vercel.json`; keep the existing verification-retention job.

### Manual action

Add an allowlisted server action used by the Members page.

- Call `requireAdminActor` inside the action.
- Ignore any client-supplied actor ID.
- Use the same service as the daily route with trigger `manual`.
- Return a small discriminated result for succeeded, already-running, or safely-failed states.
- Record the authenticated actor in the sync-run row and admin audit log.

## Admin availability and truthful UI

When Discord bot configuration and Neon are connected, make `read-members` available independently of Marketing API capabilities. A failed new run produces a degraded synchronization status but does not hide a previous successful snapshot.

### Members page

Keep the real verification queue. Replace the unavailable member directory with a server-backed directory containing:

- Discord identity and avatar
- active or left membership state
- Verified Customer state derived from the configured role
- safe role names
- guild join time
- last successful snapshot time

Remove or hide filters and columns that cannot be obtained from the member endpoint: segment, registration source, customer status, VIP candidate score, and last activity. Do not populate them with `Unknown`, zero, or seeded defaults merely to keep the old table shape.

The page header includes:

- last successful sync time
- active member count
- bot count
- current sync state
- **Sync now** for authorized admins

The button disables while a run is active and announces success or a safe failure with an accessible status/alert region.

### Overview and Community

Enable only facts supported by the synchronized snapshot:

- current active Discord members
- current Verified Customer members
- current role distribution
- current joined/left membership state where the snapshot supports it

Keep channel activity, active-member engagement, onboarding completion, visitors, paid customers, registrations, transfers, renewals, attribution, and revenue unavailable. Visible copy must say **Discord data connected; RayName Marketing API pending** rather than implying that all dashboard data is live.

## Failure behavior

- `401`: invalid bot authorization; safe non-retryable configuration failure.
- `403`: missing `GUILD_MEMBERS` intent or access; safe non-retryable configuration failure with an operator instruction.
- `429`: rate limited; preserve the previous snapshot and expose a retryable safe failure. Honor Discord's bounded retry information in the client without blocking beyond the function budget.
- timeout/5xx/malformed response: retryable unavailable failure; preserve the previous snapshot.
- database failure: mark the run failed when possible and keep the prior committed snapshot.
- concurrent trigger: return `already-running`; do not start a second Discord fetch.

Logs and audit metadata may include run ID, safe error code, trigger, actor ID, counts, and timestamps. They must not include tokens, request authorization headers, email, member payloads, or raw Discord response bodies.

## Testing strategy

Follow test-driven development.

### Unit and contract tests

- Discord pagination at 0, 1, 999, 1,000, and multiple pages.
- role and member payload normalization.
- safe handling of 401, 403, 429, 5xx, timeout, and malformed JSON.
- exact-Hobby daily cron configuration plus preservation of the retention cron.
- environment/runtime fail-closed behavior.
- member and role mapping without message, email, or presence fields.

### Repository and service tests

- first complete snapshot inserts members and roles.
- repeated snapshot is idempotent.
- role/name/avatar/join changes update correctly.
- a complete later snapshot marks missing members left.
- a partial or failed fetch never marks members left.
- Verified Customer role derives verification without clearing prior history.
- lease rejects concurrent runs and recovers stale runs.
- sync-run and admin-audit data contain only safe metadata.

### Route, action, and UI tests

- cron route rejects missing or incorrect secrets.
- manual action rejects missing, non-allowlisted, spoofed, and production-invalid actors.
- Members page uses real rows and exposes no seeded member fields.
- Sync now loading, success, already-running, failure, and keyboard/focus states.
- Overview and Community show only provider-backed Discord facts and keep Marketing API panels unavailable.

### Browser verification

Use a disposable Neon branch and loopback Discord API stub. Prove the operator can run a manual sync, see real fixture members, refresh without losing them, and observe role/leave changes on a second snapshot. Production Discord is never mutated by these tests.

Run the full unit, typecheck, lint, build, and Playwright gates before deployment.

## Deployment and operations

1. Confirm the Discord Developer Portal has **Server Members Intent** enabled for RayFox.
2. Apply the checked-in migration to a disposable Neon branch and run the full test journey.
3. Apply the same migration to production.
4. Deploy the Vercel application with the existing Discord, Neon, and cron secrets.
5. Run one manual synchronization and confirm counts against Discord's Members view.
6. Confirm the daily Vercel cron appears alongside verification retention.
7. Monitor the first scheduled run and safe sync status in the admin console.

Rollback reverts application code but does not drop synchronized member or run-history tables. Removing or disabling the member-sync cron stops new automatic snapshots without deleting existing data.

## Success criteria

- The Members page shows the real RayName Domain Club member directory from Neon.
- Discord Members and Verified Customers are real current counts.
- Admin, RayName Team, VIP, Verified Customer, and other role names come from Discord role data.
- A full snapshot can be run daily or manually without duplicate concurrent work.
- Failed or partial synchronization never marks valid members left.
- No email, messages, DMs, presence, or fake business data is stored or displayed.
- All Marketing API-dependent features remain clearly unavailable.

## References

- Discord Guild Resource — List Guild Members: https://docs.discord.com/developers/resources/guild
- Discord Gateway privileged-intent HTTP restrictions: https://docs.discord.com/developers/events/gateway
- Vercel Cron usage and Hobby scheduling limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
