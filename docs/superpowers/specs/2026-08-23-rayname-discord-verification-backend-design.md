# RayName Discord Verification Backend Design

**Date:** 2026-08-23

**Status:** Approved for implementation planning

**Scope:** Add the first live backend subsystem to the existing RayName Admin console: persistent Discord verification requests, admin review, and idempotent `Verified Customer` role assignment using Vercel and Neon.

## Context

The RayName Admin console is deployed on Vercel and protected by Discord OAuth. Production deliberately uses `DATA_MODE=unavailable`, so it does not display sample business records or claim that Discord, persistence, or RayName Marketing API data is connected.

The existing Discord application, `RayName 后台`, has now been installed in `RayName Domain Club`. Its bot token is stored as the sensitive Vercel variable `DISCORD_BOT_TOKEN`. The application is private, has the Server Members and Message Content intents enabled, and was installed without Administrator permission. Its granted permissions are limited to managing roles, viewing channels, reading and sending messages, sending in threads, embedding links, adding reactions, and using application commands.

The Neon project `Rayname Discord Admin` provides an empty production Postgres database. RayName Marketing API access is not available yet.

## Goals

1. Connect the existing Vercel application to Neon using a serverless-safe, typed data layer.
2. Accept authentic Discord interactions through a signature-verified HTTP endpoint.
3. Let a Discord member submit a private customer verification request with a RayName account email and optional domain.
4. Give allowlisted Dashboard admins a persistent review queue with Approve, Reject, and Retry actions.
5. Assign `Verified Customer` through Discord REST only after a durable, authorized approval.
6. Make every review and role operation idempotent and auditable.
7. Encrypt applicant email data at rest and automatically remove resolved sensitive data after 90 days.
8. Replace only the relevant unavailable Dashboard capabilities with live or connected-empty states.
9. Continue to show RayName API-dependent features as unavailable instead of fabricating results.

## Non-goals

- A continuously connected Discord Gateway worker.
- Passive real-time monitoring of every member event or message.
- Domain price lookup or domain availability lookup.
- Automatic RayName customer verification.
- Automatic VIP classification.
- Offer or renewal reminders.
- Marketing attribution or revenue reporting.
- Tracked registration links; this will be the next independent subsystem.
- A second repository or deployment.

## Selected Architecture

The implementation remains in the existing `TonyLinkBridge/Discord` repository and Vercel project.

- **Vercel:** hosts the authenticated Dashboard, Discord interactions endpoint, admin mutations, and Discord REST calls.
- **Neon Postgres:** stores verification requests, Discord member identity, review attempts, role operations, integration health, and audit events.
- **Drizzle ORM with the Neon HTTP driver:** provides typed schema and migrations using short serverless-safe database operations.
- **Discord HTTP interactions:** receives `/verify` without requiring an always-on Gateway connection.
- **Discord REST API:** assigns the configured role and optionally sends a private outcome notification.
- **Existing admin provider boundary:** gains a live verification provider while unrelated capabilities remain unavailable.

No browser or Client Component receives `DATABASE_URL`, `DISCORD_BOT_TOKEN`, the verification encryption key, or decrypted email data unless the current request has already passed the existing allowlisted admin authorization boundary.

## Runtime Configuration

The following server-only Vercel variables are required:

- `DATABASE_URL`: Neon pooled or serverless connection string.
- `DISCORD_BOT_TOKEN`: the current bot token.
- `DISCORD_APPLICATION_ID`: `1541013436098682942`.
- `DISCORD_PUBLIC_KEY`: the application public key used to verify interaction signatures.
- `DISCORD_GUILD_ID`: `1540610722281824336`.
- `DISCORD_VERIFIED_ROLE_ID`: the server role ID for `Verified Customer`.
- `VERIFICATION_DATA_KEY`: a random 32-byte root key. The server derives separate AES-256-GCM encryption and HMAC-SHA-256 lookup subkeys with HKDF and never exposes the root or derived keys.

Existing OAuth variables remain separate. The OAuth client secret is never reused as the bot token or verification encryption key.

Configuration parsing is fail-closed. Missing or invalid values produce an honest integration-unavailable state and must not partially process a request.

## Data Model

### `discord_members`

Stores the minimum stable Discord identity needed by the verification flow.

- `discord_user_id` text primary key
- `guild_id` text not null
- `display_name` text not null
- `discord_handle` text not null
- `avatar_url` text nullable
- `verified_at` timestamp with time zone nullable
- `created_at` timestamp with time zone not null
- `updated_at` timestamp with time zone not null

### `verification_requests`

Represents one current verification lifecycle per member.

- `id` UUID primary key
- `discord_user_id` text foreign key
- `status` enum: `pending`, `processing`, `approved`, `rejected`, `role_failed`
- `email_ciphertext` text nullable
- `email_iv` text nullable
- `email_auth_tag` text nullable
- `email_lookup_hash` text nullable
- `domain` text nullable
- `review_reason` text nullable
- `reviewed_by` text nullable
- `reviewed_at` timestamp with time zone nullable
- `role_assigned_at` timestamp with time zone nullable
- `sensitive_expires_at` timestamp with time zone nullable
- `created_at` timestamp with time zone not null
- `updated_at` timestamp with time zone not null

A partial unique constraint permits only one `pending`, `processing`, or `role_failed` request for a Discord member. A duplicate `/verify` submission returns the existing status rather than inserting another request.

### `discord_role_operations`

Provides durable idempotency for Discord side effects.

- `id` UUID primary key
- `verification_request_id` UUID foreign key
- `discord_user_id` text not null
- `role_id` text not null
- `operation` enum: `assign`, `remove`
- `status` enum: `pending`, `succeeded`, `failed`
- `attempt_count` integer not null
- `last_error_code` text nullable
- `last_error_message` text nullable with secrets removed
- `last_attempt_at` timestamp with time zone nullable
- `completed_at` timestamp with time zone nullable
- `created_at` timestamp with time zone not null

A unique constraint on request, role, and operation prevents duplicate role assignments.

### `discord_interactions`

Prevents replay and duplicate handling of Discord deliveries.

- `interaction_id` text primary key
- `interaction_type` integer not null
- `discord_user_id` text nullable
- `received_at` timestamp with time zone not null
- `handled_at` timestamp with time zone nullable

### `admin_audit_events`

Records immutable, non-secret operational history.

- `id` UUID primary key
- `actor_id` text not null
- `entity_type` text not null
- `entity_id` text not null
- `action` text not null
- `outcome` text not null
- `metadata` JSONB not null with an empty object default
- `occurred_at` timestamp with time zone not null

Audit metadata must never include plaintext email values, tokens, database URLs, interaction signatures, or encryption material.

## Sensitive Data Handling

The submitted email is normalized for whitespace and case, validated, then protected in two forms:

1. AES-256-GCM ciphertext for authorized admin review.
2. An HMAC-SHA-256 lookup hash for duplicate detection without decryption.

The optional domain is normalized to lowercase ASCII and stored only after hostname validation. It is not treated as proof of ownership.

When a request becomes approved or rejected, `sensitive_expires_at` is set to 90 days after review. A protected cleanup route removes the encrypted email fields and lookup hash after expiry while preserving the non-sensitive audit record. Cleanup is safe to run repeatedly.

## Discord Interaction Flow

### Request validation

`POST /api/discord/interactions` reads the raw request body exactly once and verifies Discord's Ed25519 signature using `X-Signature-Ed25519`, `X-Signature-Timestamp`, and `DISCORD_PUBLIC_KEY` before parsing business input.

- Invalid or missing signatures return `401`.
- Discord PING returns the required PONG response.
- Unsupported commands receive a private unavailable response.
- The interaction ID is persisted before business handling to prevent replay.

### `/verify`

If the member has no active request, `/verify` returns a private modal asking for:

- RayName registered email, required;
- one domain in the RayName account, optional.

If a current request exists, the command returns its status privately instead of opening another form. If the member is already verified, the command reports that state without creating a request.

Modal submission creates or updates the member record and inserts a `pending` verification request. The response confirms only that the request was received; it never claims customer verification.

## Admin Review Flow

The Members route gains a verification queue backed by Neon.

- **Pending:** Admin can inspect Discord identity, decrypted email, optional domain, request age, and prior non-secret audit events.
- **Approve:** The server validates the command, requires the existing allowlisted admin actor, atomically moves the request to `processing`, and creates or reuses a pending role operation.
- **Reject:** The server validates a short reason, marks the request rejected, records the actor and audit event, and schedules sensitive-data expiry.
- **Role failed:** The queue shows a safe failure reason and a Retry action.
- **Approved:** The queue shows the role assignment timestamp and no further approval action.

Approval is lock-safe. Only the request currently in `pending` or `role_failed` can enter `processing`. Concurrent approvals observe the existing operation and never create a second Discord side effect.

## Discord Role Assignment

The server calls the Discord REST endpoint for adding `DISCORD_VERIFIED_ROLE_ID` to the guild member. The bot never receives Administrator permission.

- Discord success marks the role operation `succeeded`, marks the request `approved`, sets the member verification timestamp, and writes one success audit event.
- A known retryable Discord failure marks the operation `failed` and request `role_failed` without claiming success.
- Missing member, missing role, or permission hierarchy errors surface as safe operator messages.
- Repeating Retry after Discord already holds the role is treated as success.

The bot role must remain above `Verified Customer` in the Discord role hierarchy; this operational requirement is documented and verified during deployment.

## Dashboard Provider Integration

The current provider model remains fail-closed. Live verification capability is added independently rather than switching every page to `DATA_MODE=live`.

Once configured:

- database integration reports connected only after a successful lightweight query;
- Discord bot configuration reports configured only when required safe configuration exists;
- Members can show a real connected-empty state or the real verification queue;
- verification mutation controls become available;
- audit activity shows only real persisted review events;
- analytics, campaigns, offers, content, marketing data, price checks, availability checks, VIP automation, and reminders remain unavailable.

No partial integration may cause sample records or fixture providers to enter the production dependency graph.

## Error and Notification Behavior

- Stable missing configuration is an unavailable product state, not a green health state.
- Unexpected database failures return safe retryable errors and leave durable state unchanged.
- Discord API failures never mark a request approved.
- External error bodies are not stored verbatim when they could contain sensitive values.
- User notifications are private. A failed direct message does not roll back a completed role assignment; it is recorded as a non-blocking notification failure.
- Loading UI never displays fixture data.

## Testing Strategy

### Unit tests

- runtime configuration fails closed and never exposes secret values;
- interaction signature verification accepts valid signatures and rejects altered body, timestamp, signature, and public key values;
- email encryption round-trips and uses a different IV for identical plaintext;
- lookup hashing is deterministic without revealing the email;
- domain and email validation reject unsafe input;
- state transitions reject illegal or duplicate review operations;
- expired sensitive-data cleanup is idempotent.

### Database and provider tests

- migrations create every constraint and index;
- duplicate interaction IDs are ignored safely;
- only one active verification request exists per member;
- concurrent approval attempts produce one role operation;
- a failed Discord call produces `role_failed` without approval;
- Retry reuses the existing operation and reconciles an already-present role;
- audit events contain no secret or plaintext applicant email.

### Route and UI tests

- `/verify` PING, command, modal, duplicate, verified, and invalid-signature paths;
- Members renders connected-empty, pending, processing, rejected, role-failed, and approved states;
- Approve, Reject, and Retry require the allowlisted Discord actor;
- no unavailable Marketing API feature becomes enabled;
- no production module imports test fixtures.

### Browser tests

- authenticated admin reviews a pending request and observes the durable approved state after refresh;
- rejection records the reason and removes further approval controls;
- failed role assignment exposes Retry without a false success message;
- light and dark accessibility checks cover the new queue and dialogs;
- keyboard and responsive behavior remain valid;
- browser console and page errors remain empty.

## Migration and Deployment

1. Add Drizzle schema, migration tooling, and a test database boundary.
2. Add encryption, input validation, and Discord signature verification.
3. Add verification repository and state machine.
4. Add the Discord interactions route and register `/verify` for the target guild.
5. Add authorized admin review actions and the Members verification queue.
6. Add Discord REST role assignment and retry reconciliation.
7. Add retention cleanup and real integration health.
8. Add `DATABASE_URL`, `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID`, `DISCORD_VERIFIED_ROLE_ID`, and `VERIFICATION_DATA_KEY` to Vercel without exposing their values.
9. Apply the migration to the Neon production branch.
10. Configure the Discord Interactions Endpoint URL only after the deployed route passes signature validation.
11. Register the guild command and perform one controlled test request through Discord.
12. Run unit, route, browser, type, lint, build, migration, and production smoke checks before changing the relevant Dashboard capability state.

## Acceptance Criteria

- A real Discord member can submit one private verification request through `/verify`.
- The request persists in Neon and remains after redeploys and page refreshes.
- Only an authenticated, allowlisted Dashboard admin can view decrypted applicant data or review a request.
- Approval assigns exactly one configured Discord role and only reports success after Discord confirms it.
- Rejection and Discord failures are durable, visible, and auditable.
- Concurrent or repeated operations cannot duplicate requests, approvals, role assignments, or audit success events.
- Resolved encrypted applicant data is removed after 90 days without deleting the non-sensitive audit trail.
- The production Dashboard shows only real verification data and honest integration states.
- Marketing API-dependent controls remain unavailable.
- No secret value appears in browser output, client bundles, logs, tests, audit metadata, or committed files.
- All verification and existing Dashboard quality gates pass before deployment.
