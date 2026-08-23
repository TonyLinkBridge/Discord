# RayName Discord Verification Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a persistent, private Discord customer-verification flow backed by Neon, reviewed from the existing RayName Admin console, and completed by an idempotent `Verified Customer` role assignment.

**Architecture:** Keep the Dashboard, Discord HTTP interactions, and admin mutations in the existing Next.js/Vercel application. Add a server-only Drizzle/Neon data access layer, a pure verification state machine, a signed Discord interactions route, and a Discord REST role client; expose only the verification queue as partially live while all Marketing API-dependent capabilities remain unavailable.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, TypeScript 6.0.3, NextAuth 4.24.15, Neon Postgres, `@neondatabase/serverless`, Drizzle ORM/Kit, Node `crypto`, `tweetnacl`, Zod 4.4.3, Vitest 4.1.11, Testing Library, Playwright 1.62.1, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-23-rayname-discord-verification-backend-design.md`

## Global Constraints

- Use only the existing `TonyLinkBridge/Discord` repository and Vercel project; do not create a second bot service.
- Discord uses HTTP interactions only in this phase; do not add a permanent Gateway/WebSocket process.
- Production secrets remain server-only and must never appear in client bundles, logs, tests, audit metadata, committed files, or tool output.
- Read the raw Discord request body exactly once and verify its Ed25519 signature before JSON parsing or database access.
- Treat every Route Handler and Server Action as independently reachable: validate input and re-authorize the caller inside the entry point.
- Only one active verification request may exist per Discord user, and only one role assignment operation may exist per request/role/operation tuple.
- Do not report approval until Discord confirms role assignment or reconciliation confirms the member already holds the role.
- Derive separate encryption and lookup subkeys from `VERIFICATION_DATA_KEY` with HKDF; encrypt verification email values with AES-256-GCM and use HMAC-SHA-256 only for normalized lookup/deduplication.
- Remove resolved sensitive fields after 90 days while preserving non-sensitive audit history.
- Keep `read-members` unavailable until real member sync exists; add a separate `review-verifications` capability for the live queue.
- Marketing API-dependent price, availability, VIP, offer, renewal, and analytics features remain unavailable.
- Preserve the RayName Precision visual system, responsive behavior, keyboard behavior, and WCAG AA in both themes.
- Use migrations for schema changes; do not mutate production schema manually without a checked-in migration.

## File Structure

- `drizzle.config.ts`: Drizzle Kit configuration using server-only `DATABASE_URL`.
- `drizzle/0000_discord_verification.sql`: initial idempotency, verification, role-operation, interaction, and audit schema.
- `src/lib/database/config.ts`: fail-closed database environment parsing.
- `src/lib/database/client.ts`: Neon HTTP/Drizzle client factory with no browser export.
- `src/lib/database/schema.ts`: typed Postgres tables, enums, indexes, and constraints.
- `src/lib/verification/types.ts`: review rows, statuses, commands, and repository interfaces.
- `src/lib/verification/input.ts`: email/domain normalization and validation.
- `src/lib/verification/crypto.ts`: HKDF key separation, AES-GCM encryption/decryption, and HMAC lookup hashing.
- `src/lib/verification/repository.ts`: Neon repository and atomic state transitions.
- `src/lib/verification/service.ts`: submit, approve, reject, retry, and retention orchestration.
- `src/lib/discord/config.ts`: safe Discord runtime configuration parser.
- `src/lib/discord/signature.ts`: raw-body Ed25519 verification.
- `src/lib/discord/interactions.ts`: command/modal parsing and Discord response builders.
- `src/lib/discord/rest-client.ts`: minimal Discord REST role and notification client.
- `src/app/api/discord/interactions/route.ts`: public signed Discord endpoint.
- `src/app/api/internal/verification-retention/route.ts`: protected idempotent cleanup endpoint.
- `src/app/(admin)/verification-actions.ts`: allowlisted Approve/Reject/Retry Server Actions.
- `src/features/members/verification-queue.tsx`: live queue UI.
- `src/features/members/verification-detail.tsx`: accessible review dialog.
- `src/app/(admin)/members/page.tsx`: server-side authorized queue read plus existing unavailable member directory.
- `scripts/register-discord-commands.mjs`: guild-scoped `/verify` registration.
- `vercel.json`: daily retention cron.
- `docs/operations.md`: deployment, rotation, role hierarchy, migration, and recovery runbook.

---

### Task 1: Database Configuration, Schema, and Migration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `drizzle.config.ts`
- Create: `drizzle/0000_discord_verification.sql`
- Create: `src/lib/database/config.ts`
- Create: `src/lib/database/config.test.ts`
- Create: `src/lib/database/schema.ts`
- Create: `src/lib/database/schema.test.ts`
- Create: `src/lib/database/client.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `DatabaseConfig`, `getDatabaseConfig(env)`, `createDatabase(url)`, and exported Drizzle tables/enums.
- Consumes: server-only `DATABASE_URL`; no existing runtime provider dependency.

- [ ] **Step 1: Install the serverless database dependencies**

Run:

```bash
npm install @neondatabase/serverless drizzle-orm
npm install --save-dev drizzle-kit
```

Expected: `package.json` and `package-lock.json` add only those three packages.

- [ ] **Step 2: Write failing configuration and schema contract tests**

Create `src/lib/database/config.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { getDatabaseConfig } from "./config";

describe("getDatabaseConfig", () => {
  test("fails closed without a Postgres URL", () => {
    expect(getDatabaseConfig({})).toEqual({ configured: false, reason: "DATABASE_URL is not configured" });
  });

  test("accepts only postgres URLs without returning the secret in safe output", () => {
    const value = "postgresql://rayname:secret@example.neon.tech/neondb?sslmode=require";
    const result = getDatabaseConfig({ DATABASE_URL: value });
    expect(result).toMatchObject({ configured: true });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test.each(["https://example.com", "postgresql://", "not-a-url"])(
    "rejects invalid URL %s",
    (DATABASE_URL) => expect(getDatabaseConfig({ DATABASE_URL })).toMatchObject({ configured: false }),
  );
});
```

Create `src/lib/database/schema.test.ts` to assert exported table names, status enums, active-request partial unique index SQL, and role-operation uniqueness:

```ts
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { adminAuditEvents, discordInteractions, discordMembers, discordRoleOperations, verificationRequests } from "./schema";

test("exports the verification tables", () => {
  expect([discordMembers, verificationRequests, discordRoleOperations, discordInteractions, adminAuditEvents]).toHaveLength(5);
});

test("migration carries the concurrency constraints", () => {
  const sql = readFileSync("drizzle/0000_discord_verification.sql", "utf8");
  expect(sql).toContain("verification_requests_one_active_per_member");
  expect(sql).toContain("WHERE status IN ('pending', 'processing', 'role_failed')");
  expect(sql).toContain("discord_role_operations_request_role_operation_key");
});
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run: `npm test -- src/lib/database/config.test.ts src/lib/database/schema.test.ts`

Expected: FAIL because the database modules and migration do not exist.

- [ ] **Step 4: Implement fail-closed config and typed schema**

Use this discriminated config boundary:

```ts
export type DatabaseConfig =
  | { configured: false; reason: string }
  | { configured: true; url: string; safe: { host: string; database: string } };

export function getDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) return { configured: false, reason: "DATABASE_URL is not configured" };
  try {
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === "/") {
      return { configured: false, reason: "DATABASE_URL is invalid" };
    }
    return {
      configured: true,
      url: raw,
      safe: { host: url.hostname, database: url.pathname.slice(1) },
    };
  } catch {
    return { configured: false, reason: "DATABASE_URL is invalid" };
  }
}
```

Define exact enum values from the spec and add Postgres constraints:

```ts
export const verificationStatus = pgEnum("verification_status", [
  "pending", "processing", "approved", "rejected", "role_failed",
]);
export const roleOperation = pgEnum("role_operation", ["assign", "remove"]);
export const roleOperationStatus = pgEnum("role_operation_status", ["pending", "succeeded", "failed"]);
```

Generate the migration with `npx drizzle-kit generate`, then inspect and edit only if required to ensure the two named unique indexes and all foreign keys match the spec. Do not use `drizzle-kit push` against production.

- [ ] **Step 5: Implement the server-only client factory**

```ts
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDatabase(url: string) {
  return drizzle({ client: neon(url), schema });
}
```

Do not instantiate the client at module evaluation unless config is valid; production builds without `DATABASE_URL` must still compile.

- [ ] **Step 6: Re-run tests, typecheck, and migration diff checks**

Run:

```bash
npm test -- src/lib/database/config.test.ts src/lib/database/schema.test.ts
npm run typecheck
git diff --check
```

Expected: all exit `0`.

- [ ] **Step 7: Commit the database foundation**

```bash
git add package.json package-lock.json drizzle.config.ts drizzle/ src/lib/database/ .env.example
git commit -m "feat: add Neon verification schema"
```

---

### Task 2: Sensitive Input, Encryption, and Discord Signature Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/verification/input.ts`
- Create: `src/lib/verification/input.test.ts`
- Create: `src/lib/verification/crypto.ts`
- Create: `src/lib/verification/crypto.test.ts`
- Create: `src/lib/discord/signature.ts`
- Create: `src/lib/discord/signature.test.ts`

**Interfaces:**
- Produces: `verificationSubmissionSchema`, `normalizeVerificationEmail`, `normalizeVerificationDomain`, `createVerificationCrypto(key)`, and `verifyDiscordSignature(input)`.
- Consumes: a 32-byte base64 `VERIFICATION_DATA_KEY` and Discord raw-body signature inputs.

- [ ] **Step 1: Install the signature dependency**

Run: `npm install tweetnacl`

- [ ] **Step 2: Write failing validation, encryption, and signature tests**

Cover these exact assertions:

```ts
expect(normalizeVerificationEmail("  USER@Example.COM ")).toBe("user@example.com");
expect(normalizeVerificationDomain("  Example.COM. ")).toBe("example.com");
expect(() => normalizeVerificationDomain("https://example.com/path")).toThrow();
expect(() => normalizeVerificationDomain("example com")).toThrow();
```

```ts
const crypto = createVerificationCrypto(Buffer.alloc(32, 7).toString("base64"));
const first = crypto.encryptEmail("user@example.com");
const second = crypto.encryptEmail("user@example.com");
expect(first.ciphertext).not.toBe(second.ciphertext);
expect(first.iv).not.toBe(second.iv);
expect(crypto.decryptEmail(first)).toBe("user@example.com");
expect(crypto.lookupHash("user@example.com")).toBe(crypto.lookupHash("USER@example.com"));
expect(JSON.stringify(first)).not.toContain("user@example.com");
```

Generate a deterministic `tweetnacl.sign.keyPair()` in the signature test and assert valid signature, altered body, altered timestamp, invalid hex, and wrong public key cases.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npm test -- src/lib/verification/input.test.ts src/lib/verification/crypto.test.ts src/lib/discord/signature.test.ts`

Expected: FAIL because the three modules do not exist.

- [ ] **Step 4: Implement strict submission validation**

```ts
export const verificationSubmissionSchema = z.object({
  discordUserId: z.string().regex(/^\d{17,20}$/),
  guildId: z.string().regex(/^\d{17,20}$/),
  displayName: z.string().trim().min(1).max(100),
  discordHandle: z.string().trim().min(1).max(100),
  email: z.email().max(254).transform(normalizeVerificationEmail),
  domain: z.string().trim().max(253).transform((value) => value ? normalizeVerificationDomain(value) : null),
}).strict();
```

Use `domainToASCII` from `node:url`, reject IP addresses, URLs, whitespace, empty labels, and labels longer than 63 characters.

- [ ] **Step 5: Implement HKDF-separated AES-256-GCM and HMAC-SHA-256**

Decode one 32-byte root key, then derive two independent 32-byte subkeys with HKDF-SHA-256 using fixed context strings `rayname-verification-encryption-v1` and `rayname-verification-lookup-v1`. Use the encryption subkey with 12 random IV bytes and a 16-byte auth tag; use the lookup subkey with domain separation:

```ts
const emailLookupPrefix = "rayname-verification-email-v1\0";
const lookupHash = createHmac("sha256", key)
  .update(emailLookupPrefix)
  .update(normalizeVerificationEmail(email))
  .digest("hex");
```

Reject keys that do not decode to exactly 32 bytes. Never expose the key from the returned crypto object.

- [ ] **Step 6: Implement raw-body Ed25519 verification**

```ts
export function verifyDiscordSignature(input: {
  body: string;
  publicKeyHex: string;
  signatureHex: string | null;
  timestamp: string | null;
}): boolean {
  if (!input.signatureHex || !input.timestamp) return false;
  // Validate exact hex lengths before Buffer conversion.
  return nacl.sign.detached.verify(
    Buffer.from(input.timestamp + input.body),
    Buffer.from(input.signatureHex, "hex"),
    Buffer.from(input.publicKeyHex, "hex"),
  );
}
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test -- src/lib/verification/input.test.ts src/lib/verification/crypto.test.ts src/lib/discord/signature.test.ts
npm run typecheck
npm run lint
```

Then commit:

```bash
git add package.json package-lock.json src/lib/verification/input* src/lib/verification/crypto* src/lib/discord/signature*
git commit -m "feat: secure Discord verification input"
```

---

### Task 3: Verification Repository and State Machine

**Files:**
- Create: `src/lib/verification/types.ts`
- Create: `src/lib/verification/repository.ts`
- Create: `src/lib/verification/repository.test.ts`
- Create: `src/lib/verification/service.ts`
- Create: `src/lib/verification/service.test.ts`
- Create: `src/test/verification-repository.ts`

**Interfaces:**
- Produces: `VerificationRepository`, `VerificationService`, `VerificationReviewRow`, `VerificationStatus`, `claimInteraction`, `submit`, `listForAdmin`, `approve`, `reject`, `retryRole`, `purgeExpiredSensitiveData`.
- Consumes: Drizzle database, verification crypto, a `DiscordRoleClient`, and an authorized actor ID.

- [ ] **Step 1: Define the pure service interfaces and failing transition tests**

Use these exact public command types:

```ts
export type ReviewVerificationCommand =
  | { kind: "approve-verification"; requestId: string }
  | { kind: "reject-verification"; requestId: string; reason: string }
  | { kind: "retry-verification-role"; requestId: string };

export type VerificationReviewRow = {
  id: string;
  discordUserId: string;
  displayName: string;
  discordHandle: string;
  email: string | null;
  domain: string | null;
  status: "pending" | "processing" | "approved" | "rejected" | "role_failed";
  createdAt: string;
  reviewedAt: string | null;
  roleAssignedAt: string | null;
  safeFailure: string | null;
};
```

Tests must prove:

- repeated submission returns the same active request;
- duplicate interaction IDs are claimed once and never repeat business handling;
- approved members receive an already-verified result;
- two concurrent approvals create one role operation;
- rejection requires 1–500 trimmed characters;
- approval failure becomes `role_failed`, not `approved`;
- Retry reuses the same operation;
- successful reconciliation records one approval audit event;
- approval/rejection notification failure is non-blocking and records only a safe notification audit outcome;
- sensitive cleanup nulls ciphertext/IV/tag/hash but leaves audit records.

- [ ] **Step 2: Run service tests and confirm RED**

Run: `npm test -- src/lib/verification/repository.test.ts src/lib/verification/service.test.ts`

Expected: FAIL because repository/service modules do not exist.

- [ ] **Step 3: Implement the test repository**

`src/test/verification-repository.ts` must implement `VerificationRepository` with explicit locks around transition methods. Keep records private and return structured clones so tests cannot mutate state outside repository methods.

- [ ] **Step 4: Implement atomic Neon transitions**

Use one SQL statement or a Neon transaction batch for each state transition. Approval claim must be equivalent to:

```sql
UPDATE verification_requests
SET status = 'processing', reviewed_by = $actor_id, reviewed_at = now(), updated_at = now()
WHERE id = $request_id
  AND status IN ('pending', 'role_failed')
RETURNING *;
```

Only after the claim returns a row may the repository upsert the unique `assign` role operation. A zero-row claim must re-read and return `already-processing`, `already-approved`, or `not-reviewable` without an external Discord call.

- [ ] **Step 5: Implement orchestration without holding a database lock over HTTP**

`approve` and `retryRole` must follow:

1. claim durable state;
2. commit the claim;
3. call Discord REST;
4. persist success or safe failure;
5. append one non-secret audit event.

The service accepts a `DiscordRoleClient` interface:

```ts
export interface DiscordRoleClient {
  ensureRole(input: { discordUserId: string; guildId: string; roleId: string }): Promise<
    | { status: "assigned" | "already-present" }
    | { status: "failed"; code: string; safeMessage: string; retryable: boolean }
  >;
  notifyReviewOutcome(input: {
    discordUserId: string;
    outcome: "approved" | "rejected";
    safeReason?: string;
  }): Promise<{ status: "sent" } | { status: "failed"; code: string; safeMessage: string }>;
}
```

Persist the role/review result before attempting the private Discord notification. Notification failure must never roll back approval/rejection and must never store or send applicant email data.

- [ ] **Step 6: Verify repository/service behavior twice**

Run twice:

```bash
npm test -- src/lib/verification/repository.test.ts src/lib/verification/service.test.ts
```

Expected both runs: all pass with no unhandled rejection.

- [ ] **Step 7: Commit**

```bash
git add src/lib/verification/types.ts src/lib/verification/repository* src/lib/verification/service* src/test/verification-repository.ts
git commit -m "feat: add durable verification workflow"
```

---

### Task 4: Discord Interaction Endpoint and `/verify` Modal

**Files:**
- Create: `src/lib/discord/config.ts`
- Create: `src/lib/discord/config.test.ts`
- Create: `src/lib/discord/interactions.ts`
- Create: `src/lib/discord/interactions.test.ts`
- Create: `src/app/api/discord/interactions/route.ts`
- Create: `src/app/api/discord/interactions/route.test.ts`

**Interfaces:**
- Produces: `getDiscordRuntimeConfig`, `handleDiscordInteraction`, and `POST(request: Request)`.
- Consumes: verified raw body, `VerificationService.submit`, target guild ID, and Discord interaction response types.

- [ ] **Step 1: Write config and route RED tests**

Required cases:

- config is unavailable unless application ID, public key, guild ID, role ID, token, database, and verification key are all valid;
- safe config output never contains bot token or verification key;
- missing/invalid signature returns `401` before JSON parsing or service calls;
- PING returns `{ type: 1 }`;
- `/verify` returns modal response type `9` with custom ID `rayname_verify:v1`;
- modal submission returns private response type `4` with flags `64`;
- wrong guild, wrong command, malformed fields, duplicate interaction, active request, and already-verified states are private and honest.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm test -- src/lib/discord/config.test.ts src/lib/discord/interactions.test.ts src/app/api/discord/interactions/route.test.ts
```

- [ ] **Step 3: Implement pure interaction handling**

Atomically claim the interaction ID before any submit operation. For `/verify`, read the member's current verification state first: return a private status message for an active request or verified member, and return the modal only when no current request exists. Build that modal with these exact field IDs:

```ts
const textInput = (customId: string, label: string, required: boolean, maxLength: number) => ({
  type: 4,
  custom_id: customId,
  label,
  style: 1,
  required,
  max_length: maxLength,
});

const actionRow = (component: ReturnType<typeof textInput>) => ({
  type: 1,
  components: [component],
});

{
  type: 9,
  data: {
    custom_id: "rayname_verify:v1",
    title: "Verify your RayName account",
    components: [
      actionRow(textInput("rayname_email", "RayName registered email", true, 254)),
      actionRow(textInput("rayname_domain", "One RayName domain (optional)", false, 253)),
    ],
  },
}
```

Keep Discord protocol constants in `interactions.ts`; do not scatter magic values through the route.

- [ ] **Step 4: Implement the raw-body Route Handler**

```ts
export async function POST(request: Request) {
  const body = await request.text();
  const valid = verifyDiscordSignature({
    body,
    publicKeyHex: config.publicKey,
    signatureHex: request.headers.get("x-signature-ed25519"),
    timestamp: request.headers.get("x-signature-timestamp"),
  });
  if (!valid) return Response.json({ error: "Invalid request signature" }, { status: 401 });
  return Response.json(await handleDiscordInteraction(JSON.parse(body), dependencies));
}
```

Catch malformed JSON only after signature verification and return `400` without echoing input.

- [ ] **Step 5: Verify and commit**

Run focused tests twice, then `npm run typecheck`, `npm run lint`, and `npm run build` with all new secrets unset. The build must succeed and the route must fail closed at request time.

Commit:

```bash
git add src/lib/discord/config* src/lib/discord/interactions* src/app/api/discord/interactions/
git commit -m "feat: add Discord verification command"
```

---

### Task 5: Discord REST Role Assignment and Authorized Admin Actions

**Files:**
- Create: `src/lib/discord/rest-client.ts`
- Create: `src/lib/discord/rest-client.test.ts`
- Modify: `src/lib/admin-data/mutation-command.ts`
- Modify: `src/lib/admin-data/mutation-command.test.ts`
- Create: `src/app/(admin)/verification-actions.ts`
- Create: `src/app/(admin)/verification-actions.test.ts`

**Interfaces:**
- Produces: `createDiscordRoleClient(config, fetchImpl)`, `approveVerification`, `rejectVerification`, `retryVerificationRole`.
- Consumes: `VerificationService`, `requireAdminActor`, strict review commands, and Discord API v10.

- [ ] **Step 1: Add failing REST mapping and authorization tests**

Assert exact role REST behavior:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
  expect.objectContaining({ method: "PUT", headers: { Authorization: "Bot [redacted]" } }),
);
```

Do not snapshot or log the real Authorization value. Cover 204 success, existing-role reconciliation, 401, 403 hierarchy error, 404 member/role error, 429 retryable error, and 5xx retryable error. Also cover private outcome notification success/failure, verify that notification content contains no email/domain, and prove notification failure does not change a durable approved/rejected result.

Server Action tests must prove validation occurs before actor resolution, actor ID cannot be supplied by the browser, every action calls `requireAdminActor`, and denied actions leave repository state untouched.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm test -- src/lib/discord/rest-client.test.ts src/lib/admin-data/mutation-command.test.ts src/app/'(admin)'/verification-actions.test.ts
```

- [ ] **Step 3: Extend the strict mutation schema**

Add these variants to the existing discriminated union:

```ts
z.object({ kind: z.literal("approve-verification"), requestId: identifierSchema }).strict(),
z.object({ kind: z.literal("reject-verification"), requestId: identifierSchema, reason: textSchema }).strict(),
z.object({ kind: z.literal("retry-verification-role"), requestId: identifierSchema }).strict(),
```

- [ ] **Step 4: Implement safe Discord REST mapping**

Use `fetch` with `cache: "no-store"`, `AbortSignal.timeout(10_000)`, API v10, and a bot authorization header constructed inside the server-only client. Implement role assignment plus best-effort private outcome notification. Parse response bodies only for safe error classification and never return or persist raw bodies.

- [ ] **Step 5: Implement one authorization wrapper for all review actions**

Each exported Server Action must:

1. parse the strict command;
2. call `requireAdminActor` with existing auth/environment dependencies;
3. load configured database/crypto/Discord dependencies server-side;
4. call the service with the actor ID;
5. return a serializable `{ ok, status, message }` result;
6. call `revalidatePath("/members")` after a durable state change.

- [ ] **Step 6: Verify and commit**

Run the focused suite twice plus typecheck/lint. Commit:

```bash
git add src/lib/discord/rest-client* src/lib/admin-data/mutation-command* src/app/'(admin)'/verification-actions*
git commit -m "feat: authorize verification reviews"
```

---

### Task 6: Partial-Live Availability and Verification Queue UI

**Files:**
- Modify: `src/lib/admin-data/availability.ts`
- Modify: `src/lib/admin-data/availability.test.ts`
- Modify: `src/components/admin-shell/runtime-admin-data-provider.tsx`
- Modify: `src/components/admin-shell/runtime-admin-data-provider.test.tsx`
- Modify: `src/app/(admin)/layout.tsx`
- Modify: `src/app/(admin)/members/page.tsx`
- Modify: `src/app/(admin)/read-routes.test.tsx`
- Create: `src/features/members/verification-queue.tsx`
- Create: `src/features/members/verification-detail.tsx`
- Create: `src/features/members/verification-queue.test.tsx`
- Modify: `src/features/members/members-screen.module.css`

**Interfaces:**
- Produces: `review-verifications` capability, `partial-live` data mode, safe availability passed from the server layout, and `VerificationQueue` UI.
- Consumes: authorized `VerificationReviewRow[]`, existing `CapabilityBoundary`, and verification Server Actions.

- [ ] **Step 1: Write availability and UI RED tests**

Prove:

- full missing config retains `unavailable` and existing member fallback;
- configured database plus successful ping and configured Discord role produces `partial-live` with only `review-verifications` newly available;
- `read-members` remains unavailable;
- database ping failure reports `degraded`, not connected;
- connected-empty queue says `No verification requests yet`;
- pending row exposes Approve and Reject;
- role-failed row exposes Retry and no false Approved label;
- approved/rejected rows have no repeat mutation controls;
- decrypted email is rendered only inside the authorized review dialog;
- dialog traps focus, closes on Escape, and returns focus to its opener;
- all mutation outcomes use live regions and disabled pending buttons.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm test -- src/lib/admin-data/availability.test.ts src/components/admin-shell/runtime-admin-data-provider.test.tsx src/features/members/verification-queue.test.tsx src/app/'(admin)'/read-routes.test.tsx
```

- [ ] **Step 3: Add independent capability resolution**

Extend:

```ts
export const adminCapabilities = [
  // existing capabilities
  "review-verifications",
] as const;

export type AdminAvailability = {
  dataMode: "unavailable" | "partial-live" | "live";
  // existing fields
};
```

Create a server-only resolver that performs one lightweight `select 1` and returns only safe status/detail strings. Pass the completed `AdminAvailability` into `RuntimeAdminDataProvider`; do not perform database work inside the Client Component.

- [ ] **Step 4: Compose the Members page server-side**

The page must render:

1. `VerificationQueue` when `review-verifications` is available;
2. a queue-specific unavailable/degraded state otherwise;
3. the existing member directory inside `CapabilityBoundary capability="read-members"` below it.

Call the authorized DAL directly from the Server Component. Do not fetch the app's own Route Handler from the Server Component.

- [ ] **Step 5: Implement accessible review UI**

Use native buttons and a dialog pattern consistent with existing member/lead dialogs. Rejection requires an explicit reason input and confirmation. Approval has clear copy: `Approve and assign Verified Customer`. Do not reuse the old fixture-only `verifyMember` button for the live review flow.

- [ ] **Step 6: Verify twice and commit**

Run the focused suite twice, then all affected member/shell tests, typecheck, lint, and build. Commit:

```bash
git add src/lib/admin-data/availability* src/components/admin-shell/runtime-admin-data-provider* src/app/'(admin)'/layout.tsx src/app/'(admin)'/members/ src/app/'(admin)'/read-routes.test.tsx src/features/members/
git commit -m "feat: review Discord verification requests"
```

---

### Task 7: Retention Cleanup, Honest Health, and Operations

**Files:**
- Create: `src/app/api/internal/verification-retention/route.ts`
- Create: `src/app/api/internal/verification-retention/route.test.ts`
- Create: `vercel.json`
- Modify: `src/features/system-health/bot-automations-screen.tsx`
- Modify: `src/features/system-health/bot-automations-screen.test.tsx`
- Modify: `src/features/settings/settings-screen.tsx`
- Modify: `src/features/settings/settings-screen.test.tsx`
- Modify: `docs/operations.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: protected daily cleanup route and truthful Discord/database/verification health states.
- Consumes: `CRON_SECRET`, `VerificationService.purgeExpiredSensitiveData`, safe availability.

- [ ] **Step 1: Write failing cleanup and health tests**

Assert unauthorized cron calls return `401`, authorized calls return only `{ purged: number }`, repeated cleanup returns `0`, and no response contains encrypted fields or lookup hashes.

Assert Bot & Automations and Settings show:

- `Discord bot configured` only when required safe config exists;
- `Database connected` only after the successful ping;
- `Verification endpoint ready` only when both are true;
- Marketing API remains `Awaiting access`;
- no recent command, reminder, or job activity is synthesized.

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test -- src/app/api/internal/verification-retention/route.test.ts src/features/system-health/bot-automations-screen.test.tsx src/features/settings/settings-screen.test.tsx
```

- [ ] **Step 3: Implement the protected cleanup route and daily schedule**

`GET` must compare `Authorization` to `Bearer ${process.env.CRON_SECRET}` using a timing-safe comparison after equal-length validation. Use:

```json
{
  "crons": [
    { "path": "/api/internal/verification-retention", "schedule": "17 3 * * *" }
  ]
}
```

- [ ] **Step 4: Update operations documentation**

Document exact environment variable names, migration commands, token/key rotation order, interaction endpoint URL, guild command registration, bot role hierarchy requirement, retry behavior, cleanup schedule, Neon branch strategy, rollback, and how to return the verification capability to unavailable without deleting records.

- [ ] **Step 5: Verify and commit**

Run focused tests twice plus typecheck/lint/build. Commit:

```bash
git add src/app/api/internal/verification-retention/ vercel.json src/features/system-health/ src/features/settings/ docs/operations.md .env.example
git commit -m "feat: operate Discord verification safely"
```

---

### Task 8: Guild Command Registration and Database Migration Verification

**Files:**
- Create: `scripts/register-discord-commands.mjs`
- Create: `scripts/register-discord-commands.test.ts`
- Create: `src/lib/verification/neon-repository.integration.test.ts`
- Modify: `package.json`
- Modify: `docs/operations.md`

**Interfaces:**
- Produces: `npm run discord:register`, registering exactly one guild command named `verify`.
- Consumes: `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, and `DISCORD_BOT_TOKEN` from the operator environment.

- [ ] **Step 1: Write the registration payload test**

Export a pure payload builder and assert:

```ts
expect(buildGuildCommands()).toEqual([{
  name: "verify",
  description: "Request RayName customer verification",
  type: 1,
  dm_permission: false,
}]);
```

The script must use `PUT /applications/{application.id}/guilds/{guild.id}/commands`, never print the Authorization header, and exit non-zero on non-2xx responses.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- scripts/register-discord-commands.test.ts`

- [ ] **Step 3: Implement and verify the script locally with mocked fetch**

Add:

```json
"discord:register": "node scripts/register-discord-commands.mjs"
```

Run the unit test twice. Do not call the real Discord API until the production interaction route is deployed and accepted by Discord.

- [ ] **Step 4: Create a Neon test branch and apply the migration**

Through Neon, create a branch named `verification-test` from `production`. Store its URL only in a local or approved test secret. Run:

```bash
test -n "$VERIFICATION_TEST_DATABASE_URL"
env DATABASE_URL="$VERIFICATION_TEST_DATABASE_URL" npx drizzle-kit migrate
```

Expected: the first command exits `0` only when the secure test URL exists; migration exits `0`; tables, enums, foreign keys, and named unique indexes are present. Re-run the same `env DATABASE_URL=... npx drizzle-kit migrate`; expected: no new migration and exit `0`.

- [ ] **Step 5: Run integration tests against the test branch**

Run repository concurrency, duplicate interaction, approval failure, retry, and cleanup tests with `VERIFICATION_TEST_DATABASE_URL` set securely. Tests must truncate only their known test tables and must refuse to run when the URL host/database matches the production configuration.

- [ ] **Step 6: Commit**

```bash
git add scripts/register-discord-commands.mjs scripts/register-discord-commands.test.ts src/lib/verification/neon-repository.integration.test.ts package.json docs/operations.md
git commit -m "chore: register Discord verification command"
```

---

### Task 9: Browser Coverage, Production Deployment, and Live Smoke Test

**Files:**
- Create: `e2e/verification-review.spec.ts`
- Create: `scripts/discord-api-stub.mjs`
- Create: `scripts/run-verification-e2e.mjs`
- Modify: `e2e/accessibility.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `src/lib/discord/config.ts`
- Modify: `src/lib/discord/config.test.ts`
- Modify: `src/lib/admin-data/runtime-boundary.test.ts`
- Modify: `docs/operations.md`

**Interfaces:**
- Consumes: Neon `verification-test` branch, dev-only allowlisted actor, deployed Vercel environment, Discord guild command.
- Produces: repeatable browser review coverage and a verified production rollout.

- [ ] **Step 1: Add RED browser journeys against the test database branch**

Cover:

- connected-empty queue;
- pending request detail with authorized decrypted email;
- Approve pending state while action runs;
- durable approved state after refresh;
- rejection reason and removed mutation controls;
- role failure with Retry and no false success;
- Escape/focus restoration and keyboard-only review;
- 1180px and 390px responsive layouts;
- light/dark axe scans with no serious or critical violations;
- zero browser console errors and page errors.

Playwright setup must use a Neon test branch URL from the environment and must fail fast if it is absent during the verification E2E job. Role calls must go to a loopback-only Discord REST stub that records deterministic 204/403/429 outcomes; never use the production bot token or a real Discord role in automated browser tests. Do not add a fixture provider to the production runtime graph.

- [ ] **Step 2: Run browser tests and confirm RED**

Run: `npm run test:e2e -- e2e/verification-review.spec.ts`

Expected: FAIL until route wiring and test-branch setup are complete.

- [ ] **Step 3: Finish test wiring without weakening production boundaries**

Extend `runtime-boundary.test.ts` so no production module imports `src/test`, `VERIFICATION_E2E`, or an in-memory verification adapter. E2E records are inserted through a test script using only the test branch, not through a production HTTP seed route.

`scripts/discord-api-stub.mjs` must bind only to `127.0.0.1:3114`, reject non-test guild/member/role IDs, expose no credentials, and reset recorded calls before each browser run. `scripts/run-verification-e2e.mjs` must launch the stub and Next dev server, pass a non-secret dummy bot token plus `DISCORD_API_BASE_URL=http://127.0.0.1:3114`, and cleanly stop both children.

`getDiscordRuntimeConfig` may honor `DISCORD_API_BASE_URL` only when `NODE_ENV !== "production"`, the URL uses `http:`, and the hostname is exactly `127.0.0.1`. Production must always use `https://discord.com/api/v10` even if an override is supplied. Add config tests proving the production override is ignored and non-loopback development overrides fail closed.

- [ ] **Step 4: Run all local quality gates**

Run in this order:

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all tests and checks pass; build succeeds with integration env absent; worktree contains only intentional changes before the final commit.

- [ ] **Step 5: Commit final verification coverage**

```bash
git add e2e/ scripts/discord-api-stub.mjs scripts/run-verification-e2e.mjs playwright.config.ts src/lib/discord/config* src/lib/admin-data/runtime-boundary.test.ts docs/operations.md
git commit -m "test: prove Discord verification journey"
```

- [ ] **Step 6: Configure production secrets without exposing values**

In Vercel add or confirm Sensitive Production and Preview variables:

- `DATABASE_URL`
- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_GUILD_ID`
- `DISCORD_VERIFIED_ROLE_ID`
- `VERIFICATION_DATA_KEY`
- `CRON_SECRET`

Do not display values in screenshots, logs, terminal output, or the handoff report.

- [ ] **Step 7: Apply production migration and deploy**

Apply checked-in migrations to Neon `production`, push the verified commit to GitHub `main`, and wait for the Vercel deployment. Confirm the app still builds and signs in if any live integration configuration is temporarily unavailable.

- [ ] **Step 8: Configure Discord only after route verification**

Set the Discord Interactions Endpoint URL to:

```text
https://rayname-admin.vercel.app/api/discord/interactions
```

Discord must accept its signature challenge. Then run `npm run discord:register` with secure environment access and confirm exactly one guild-scoped `/verify` command exists.

- [ ] **Step 9: Perform one controlled live verification smoke test**

Use a designated test Discord member:

1. submit `/verify` with a non-production test email and optional test domain;
2. confirm one pending Neon record and no plaintext email column;
3. open the Dashboard queue as the allowlisted admin;
4. approve and confirm the `Verified Customer` role appears once;
5. refresh and confirm the request remains approved;
6. retry/repeat and confirm there is no second role operation or second success audit event;
7. remove only the test role/request data according to the documented safe cleanup procedure.

- [ ] **Step 10: Final evidence gate**

After every deployment/configuration change, re-run production OAuth/provider checks and capture only non-secret evidence:

- root redirects unauthenticated users to `/sign-in`;
- Discord OAuth provider callback remains the production domain;
- `/api/discord/interactions` rejects unsigned requests with `401`;
- Members shows real connected-empty or live queue state;
- Marketing API-dependent routes remain honest/unavailable;
- no fake notifications, health claims, seeded metrics, or fixture names reappear;
- GitHub `main` matches local `HEAD` and the worktree is clean.
