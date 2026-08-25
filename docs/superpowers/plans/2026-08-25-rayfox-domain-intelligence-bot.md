# RayFox Domain Intelligence Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task with checkpoints. Do not dispatch subagents; the user explicitly requires inline execution only. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private `/domain` workflow to the existing RayFox Discord application that enforces 1/day and 3/day member allowances, combines authoritative public domain facts with RayName-owned commercial data, and converts users to prefilled RayName registration or transfer pages.

**Architecture:** Keep the existing signed Discord HTTP interaction route. Return an ephemeral deferred response immediately, then use Next.js `after()` to run a provider-agnostic domain-intelligence service and edit the original Discord response. Store atomic query reservations and safe result snapshots in Neon; require the RayName commerce provider for every successful public result and treat RDAP, WHOIS, DNS, and certificate facts as optional enrichment.

**Tech Stack:** Next.js 16.3 App Router Route Handlers, TypeScript 6 strict mode, Discord Interactions API v10, Drizzle ORM 0.45, Neon PostgreSQL, Zod 4, Node.js DNS/TCP/TLS APIs, Vitest 4, PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-rayfox-domain-intelligence-bot-design.md`

## Global Constraints

- Work inline in this session; never create or dispatch a subagent.
- Before changing a Next.js Route Handler, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` completely.
- Extend the existing RayFox application and preserve `/verify` behavior.
- Every Discord result is ephemeral and visible only to the invoking member.
- Non-Verified members receive 1 successful search per `Asia/Kuala_Lumpur` day; Verified Customer members receive 3.
- Invalid input, provider failure, and incomplete RayName commercial data never consume allowance.
- A five-minute repeat of the same normalized domain replays the stored result without consuming allowance.
- RayName is the only source for availability, premium status and price, registration price, renewal price, transfer price, and RayName destinations.
- Public launch remains disabled until the real RayName provider passes contract tests.
- Do not store raw WHOIS, registrant personal data, Discord message content, email, provider credentials, or authorization headers.
- Use checked-in Drizzle migrations and the existing transactional migration command; never run schema push against production.
- Use native, concise English for user-facing RayFox copy.
- Follow TDD: observe each targeted test fail before writing the minimal implementation.
- Commit only files from the current task. Preserve the user's existing untracked brand assets and `audit/` directory.

## File structure

### Domain core

- `src/lib/domain-intelligence/types.ts` — normalized domain, provider, outcome, repository, and rendering contracts.
- `src/lib/domain-intelligence/input.ts` — Unicode/ASCII normalization and strict domain validation.
- `src/lib/domain-intelligence/time.ts` — Kuala Lumpur usage-day calculation.
- `src/lib/domain-intelligence/config.ts` — fail-closed feature and RayName provider configuration.
- `src/lib/domain-intelligence/ttl-cache.ts` — bounded process-local freshness cache used by provider adapters.
- `src/lib/domain-intelligence/rayname-client.ts` — validated server-to-server RayName commerce client.
- `src/lib/domain-intelligence/registration-client.ts` — IANA RDAP bootstrap, authoritative RDAP lookup, and WHOIS fallback orchestration.
- `src/lib/domain-intelligence/whois-transport.ts` — bounded TCP/43 transport behind an injectable interface.
- `src/lib/domain-intelligence/network-safety.ts` — public-address and referral-host validation shared by WHOIS and TLS.
- `src/lib/domain-intelligence/dns-client.ts` — bounded direct DNS summary.
- `src/lib/domain-intelligence/certificate-client.ts` — safe public-host TLS certificate inspection.
- `src/lib/domain-intelligence/repository.ts` — Neon atomic allowance reservations, replay, completion, failure, and conversion records.
- `src/lib/domain-intelligence/service.ts` — RayName-required orchestration and optional enrichment merge.
- `src/lib/domain-intelligence/runtime.ts` — production composition without affecting `/verify` availability.

### Discord boundary

- `src/lib/discord/domain-message.ts` — available, registered, premium, exhausted, and unavailable payloads.
- `src/lib/discord/interaction-client.ts` — edit-original-response webhook client.
- `src/lib/discord/interactions.ts` — command/component dispatch and background-work description.
- `src/app/api/discord/interactions/route.ts` — signature validation, `after()` scheduling, and initial response.
- `scripts/register-discord-commands.mjs` — guild `/domain` command registration alongside `/verify`.

### Persistence and attribution

- `src/lib/database/schema.ts` — domain query and conversion tables/enums.
- `drizzle/0002_rayfox_domain_intelligence.sql` — generated checked-in migration.
- `drizzle/meta/0002_snapshot.json` and `drizzle/meta/_journal.json` — generated migration metadata.
- `src/lib/domain-intelligence/link-token.ts` — short-lived signed outbound token.
- `src/app/api/rayfox/outbound/[token]/route.ts` — validated click record and safe RayName redirect.

### Test support

- Unit tests colocated with every new module.
- `src/lib/domain-intelligence/neon-repository.integration.test.ts` — PGlite proof of atomic allowance behavior.
- `scripts/rayname-commerce-api-stub.mjs` — loopback RayName contract stub.
- `scripts/discord-api-stub.mjs` — extend existing stub to record interaction webhook edits.
- `scripts/domain-intelligence-e2e-fixtures.mjs` — disposable Neon fixtures and signed Discord interactions.
- `scripts/run-domain-intelligence-e2e.mjs` — local app plus provider stubs.
- `e2e/domain-intelligence.spec.ts` — normal, Verified, failure, privacy, and attribution acceptance tests.

---

### Task 1: Normalized domain input and Kuala Lumpur usage day

**Files:**
- Create: `src/lib/domain-intelligence/types.ts`
- Create: `src/lib/domain-intelligence/input.ts`
- Create: `src/lib/domain-intelligence/input.test.ts`
- Create: `src/lib/domain-intelligence/time.ts`
- Create: `src/lib/domain-intelligence/time.test.ts`

**Interfaces:**
- Produces: `normalizeDomain(raw: string): NormalizeDomainResult`
- Produces: `usageDayAt(date: Date): string`
- Produces: shared `Money`, `DomainTier`, `RayNameCommercialResult`, `RayNameTldPrice`, `RegistrationFacts`, `DnsSummary`, `CertificateSummary`, `DomainIntelligenceResult`, and `SafeProviderFailure` types.

- [ ] **Step 1: Write the failing normalization tests**

```ts
import { describe, expect, test } from "vitest";
import { normalizeDomain } from "./input";

describe("normalizeDomain", () => {
  test.each([
    [" Example.COM. ", "example.com"],
    ["münchen.de", "xn--mnchen-3ya.de"],
  ])("normalizes %s", (raw, ascii) => {
    expect(normalizeDomain(raw)).toMatchObject({
      valid: true,
      domain: { ascii },
    });
  });

  test.each(["", "localhost", "a..com", "-bad.com", "bad-.com", "https://rayname.com", "a".repeat(64) + ".com"])(
    "rejects %s",
    (raw) => expect(normalizeDomain(raw)).toEqual({ valid: false, code: "invalid_domain" }),
  );
});
```

- [ ] **Step 2: Run the input test and verify the missing-module failure**

Run: `npm test -- src/lib/domain-intelligence/input.test.ts`
Expected: FAIL because `./input` does not exist.

- [ ] **Step 3: Define the shared contracts and minimal normalizer**

```ts
// types.ts
export type Money = { amount: string; currency: string };
export type DomainTier = "member" | "verified";
export type NormalizedDomain = { ascii: string; unicode: string; label: string; tld: string };
export type SafeProviderFailure = {
  code: "unavailable" | "timeout" | "rate_limited" | "malformed" | "not_supported";
  safeMessage: string;
  retryable: boolean;
};

export type RayNameCommercialResult = {
  availability: "available" | "registered" | "reserved" | "unknown";
  premium: boolean;
  premiumRenewal: boolean | null;
  registrationPrice: Money | null;
  renewalPrice: Money | null;
  transferPrice: Money | null;
  transferEligible: boolean | null;
  destination: string;
  checkedAt: string;
};

export type RayNameTldPrice = {
  tld: string;
  availability: RayNameCommercialResult["availability"];
  premium: boolean;
  registrationPrice: Money | null;
  renewalPrice: Money | null;
  transferPrice: Money | null;
  destination: string;
  checkedAt: string;
};

export type RegistrationFacts = {
  state: "found" | "not-found" | "not-supported";
  registrar: string | null;
  registrarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  statuses: string[];
  nameservers: string[];
  dnssec: boolean | null;
  source: { kind: "rdap" | "whois"; name: string; checkedAt: string } | null;
};

export type DnsSummary = {
  a: string[];
  aaaa: string[];
  mx: Array<{ exchange: string; priority: number }>;
  txt: string[];
  ns: string[];
  checkedAt: string;
};

export type CertificateSummary = {
  issuerCommonName: string | null;
  subjectCommonName: string | null;
  validFrom: string | null;
  validTo: string | null;
  protocol: string | null;
  checkedAt: string;
};

export type DomainIntelligenceResult = {
  domain: NormalizedDomain;
  commercial: RayNameCommercialResult;
  registration: RegistrationFacts | null;
  dns: DnsSummary | null;
  certificate: CertificateSummary | null;
  checkedAt: string;
};
```

```ts
// input.ts
import { domainToASCII, domainToUnicode } from "node:url";
import type { NormalizedDomain } from "./types";

export type NormalizeDomainResult =
  | { valid: true; domain: NormalizedDomain }
  | { valid: false; code: "invalid_domain" };

export function normalizeDomain(raw: string): NormalizeDomainResult {
  const trimmed = raw.trim().replace(/\.$/, "");
  const ascii = domainToASCII(trimmed).toLowerCase();
  if (!ascii || ascii.length > 253 || ascii.includes("..")) return { valid: false, code: "invalid_domain" };
  const labels = ascii.split(".");
  if (labels.length < 2 || labels.some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))) {
    return { valid: false, code: "invalid_domain" };
  }
  return {
    valid: true,
    domain: {
      ascii,
      unicode: domainToUnicode(ascii),
      label: labels.slice(0, -1).join("."),
      tld: labels.at(-1)!,
    },
  };
}
```

- [ ] **Step 4: Add and pass usage-day boundary tests**

```ts
import { expect, test } from "vitest";
import { usageDayAt } from "./time";

test("uses the Kuala Lumpur calendar day", () => {
  expect(usageDayAt(new Date("2026-08-24T15:59:59.999Z"))).toBe("2026-08-24");
  expect(usageDayAt(new Date("2026-08-24T16:00:00.000Z"))).toBe("2026-08-25");
});
```

Implement `usageDayAt` with `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" })`, then run:
`npm test -- src/lib/domain-intelligence/input.test.ts src/lib/domain-intelligence/time.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain-intelligence/types.ts src/lib/domain-intelligence/input.ts src/lib/domain-intelligence/input.test.ts src/lib/domain-intelligence/time.ts src/lib/domain-intelligence/time.test.ts
git commit -m "feat: add domain intelligence input model"
```

### Task 2: Fail-closed feature configuration and RayName commerce client

**Files:**
- Create: `src/lib/domain-intelligence/config.ts`
- Create: `src/lib/domain-intelligence/config.test.ts`
- Create: `src/lib/domain-intelligence/ttl-cache.ts`
- Create: `src/lib/domain-intelligence/ttl-cache.test.ts`
- Create: `src/lib/domain-intelligence/rayname-client.ts`
- Create: `src/lib/domain-intelligence/rayname-client.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `NormalizedDomain`, `Money`, `RayNameCommercialResult`, `SafeProviderFailure`.
- Produces: `getDomainIntelligenceConfig(env): DomainIntelligenceConfig`.
- Produces: `createTtlCache<K, V>({ maxEntries, now })` with `.get`, `.set`, and `.clear`.
- Produces: `RayNameCommerceProvider.lookup(domain)` and `RayNameCommerceProvider.listTldPrices(label)`.

```ts
export interface RayNameCommerceProvider {
  lookup(domain: NormalizedDomain): Promise<RayNameCommercialResult | SafeProviderFailure>;
  listTldPrices(label: string): Promise<RayNameTldPrice[] | SafeProviderFailure>;
}
```

- [ ] **Step 1: Write failing configuration tests**

Cover these exact rules:

```ts
const valid = {
  NODE_ENV: "production",
  RAYFOX_DOMAIN_INTELLIGENCE_MODE: "internal",
  RAYFOX_DOMAIN_BETA_ROLE_IDS: "1540611679023276114",
  RAYNAME_COMMERCE_API_BASE_URL: "https://api.rayname.com",
  RAYNAME_COMMERCE_API_TOKEN: "test-token-at-least-20-characters",
  RAYNAME_DOMAIN_PAGE_BASE_URL: "https://www.rayname.com/domain/search",
  RAYFOX_LINK_SIGNING_KEY: Buffer.alloc(32, 9).toString("base64"),
};

expect(getDomainIntelligenceConfig(valid)).toMatchObject({
  configured: true,
  mode: "internal",
  betaRoleIds: ["1540611679023276114"],
});
expect(JSON.stringify(getDomainIntelligenceConfig(valid))).not.toContain("test-token");
```

Also prove `disabled | internal | public` is the complete mode set, production accepts only HTTPS `rayname.com` subdomains, development accepts only explicit `http://127.0.0.1:<port>` overrides, and a missing 32-byte signing key fails closed.

- [ ] **Step 2: Run the tests and observe failure**

Run: `npm test -- src/lib/domain-intelligence/config.test.ts`
Expected: FAIL because the configuration module does not exist.

- [ ] **Step 3: Implement configuration without coupling it to `/verify`**

Return a discriminated union:

```ts
export type DomainIntelligenceConfig =
  | { configured: false; reason: string; mode: "disabled" }
  | {
      configured: true;
      mode: "internal" | "public";
      betaRoleIds: string[];
      commerceApiBaseUrl: string;
      commerceApiToken: string;
      domainPageBaseUrl: string;
      linkSigningKey: string;
      safe: { mode: "internal" | "public"; commerceHost: string; domainPageHost: string };
    };
```

Make secret properties non-enumerable using the pattern in `src/lib/discord/config.ts`. Add the seven environment names to `.env.example` with empty values and a comment that public mode requires a real RayName provider.

- [ ] **Step 4: Add the bounded freshness cache and satisfy the RayName client contract tests**

The generic cache removes expired entries on read, caps itself at 1,000 entries by evicting the oldest expiry, and stores successful values only. Prove expiration, overwrite, eviction, and failure non-caching in `ttl-cache.test.ts`.

The client calls:

```text
GET /v1/domains/lookup?domain=example.com
GET /v1/tlds/prices?label=example
Authorization: Bearer <RAYNAME_COMMERCE_API_TOKEN>
```

Use Zod to reject malformed availability values, non-ISO currencies, non-decimal money, missing `checkedAt`, non-RayName destinations, and successful HTTP responses with incomplete required fields. Use `cache: "no-store"` and `AbortSignal.timeout(5_000)`. Map 429 to `rate_limited`, timeouts to `timeout`, 5xx/network errors to `unavailable`, and schema failures to `malformed`. Never include the response body or token in the failure. Cache successful domain lookup results for at most 60 seconds and successful TLD price catalogues for at most 15 minutes; tests advance an injected clock and prove expiry causes a new request.

Run: `npm test -- src/lib/domain-intelligence/config.test.ts src/lib/domain-intelligence/ttl-cache.test.ts src/lib/domain-intelligence/rayname-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/domain-intelligence/config.ts src/lib/domain-intelligence/config.test.ts src/lib/domain-intelligence/ttl-cache.ts src/lib/domain-intelligence/ttl-cache.test.ts src/lib/domain-intelligence/rayname-client.ts src/lib/domain-intelligence/rayname-client.test.ts
git commit -m "feat: add RayName commerce provider contract"
```

### Task 3: Query and conversion persistence schema

**Files:**
- Modify: `src/lib/database/schema.ts`
- Create: `drizzle/0002_rayfox_domain_intelligence.sql`
- Create: `drizzle/meta/0002_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/database/schema.test.ts`
- Modify: `scripts/neon-transactional-migrations.test.ts`

**Interfaces:**
- Produces: `domainQueryStatus`, `domainQueryTier`, `domainConversionAction` enums.
- Produces: `domainQueryRequests` and `domainConversionEvents` Drizzle tables.

- [ ] **Step 1: Add failing schema expectations**

Assert the schema exports these fields:

```ts
expect(getTableColumns(domainQueryRequests)).toMatchObject({
  interactionId: expect.anything(),
  guildId: expect.anything(),
  discordUserId: expect.anything(),
  normalizedDomain: expect.anything(),
  tier: expect.anything(),
  status: expect.anything(),
  usageDay: expect.anything(),
  chargedAt: expect.anything(),
  safeErrorCode: expect.anything(),
  providerSummary: expect.anything(),
  resultSnapshot: expect.anything(),
});
```

Also assert `domain_conversion_events.query_request_id` references `domain_query_requests.id` and `interaction_id` is unique.

- [ ] **Step 2: Run the schema test and observe failure**

Run: `npm test -- src/lib/database/schema.test.ts`
Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Add the schema and generate the migration**

Use PostgreSQL enums:

```ts
export const domainQueryTier = pgEnum("domain_query_tier", ["member", "verified"]);
export const domainQueryStatus = pgEnum("domain_query_status", ["started", "succeeded", "failed", "quota_rejected"]);
export const domainConversionAction = pgEnum("domain_conversion_action", ["register", "transfer", "full_intelligence", "continue_on_site"]);
```

Use UUID primary keys, `date("usage_day")`, JSONB for safe provider summary/result snapshot, timestamps with timezone, a unique index on `interaction_id`, an index on `(guild_id, discord_user_id, usage_day, status)`, an index on `(discord_user_id, normalized_domain, completed_at)`, and a unique conversion index on `(query_request_id, action)`.

Run: `npx drizzle-kit generate --name=rayfox_domain_intelligence`
Expected: a checked-in `0002` migration and snapshot; inspect the SQL to confirm it creates only the specified enums, tables, indexes, and foreign key.

- [ ] **Step 4: Prove the migration participates in the transactional runner**

Extend `scripts/neon-transactional-migrations.test.ts` to load the migration list and assert the last migration block contains `domain_query_requests` and `domain_conversion_events` without exposing `DATABASE_URL`. Run:
`npm test -- src/lib/database/schema.test.ts scripts/neon-transactional-migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/database/schema.ts src/lib/database/schema.test.ts drizzle/0002_rayfox_domain_intelligence.sql drizzle/meta/0002_snapshot.json drizzle/meta/_journal.json scripts/neon-transactional-migrations.test.ts
git commit -m "feat: add domain query persistence schema"
```

### Task 4: Atomic allowance, replay, and conversion repository

**Files:**
- Create: `src/lib/domain-intelligence/repository.ts`
- Create: `src/lib/domain-intelligence/repository.test.ts`
- Create: `src/lib/domain-intelligence/neon-repository.integration.test.ts`
- Create: `src/test/domain-intelligence-repository.ts`

**Interfaces:**
- Produces: `DomainQueryRepository.begin`, `.succeed`, `.fail`, `.getOwnedQuery`, and `.recordConversion`.
- Consumes: `DomainIntelligenceResult`, `DomainTier`.

- [ ] **Step 1: Define the repository contract and failing in-memory tests**

```ts
export type DomainConversionAction =
  | "register"
  | "transfer"
  | "full_intelligence"
  | "continue_on_site";

export type StoredDomainQuery = {
  id: string;
  discordUserId: string;
  normalizedDomain: string;
  tier: DomainTier;
  status: "started" | "succeeded" | "failed" | "quota_rejected";
  result: DomainIntelligenceResult | null;
  completedAt: Date | null;
};

export interface DomainQueryRepository {
  begin(input: {
    interactionId: string;
    guildId: string;
    discordUserId: string;
    normalizedDomain: string;
    tier: DomainTier;
    usageDay: string;
    limit: 1 | 3;
    now: Date;
    replayAfter: Date;
    staleBefore: Date;
  }): Promise<
    | { status: "started"; requestId: string }
    | { status: "replay"; requestId: string; result: DomainIntelligenceResult; completedAt: Date }
    | { status: "quota-rejected"; requestId: string; used: number; limit: 1 | 3 }
    | { status: "duplicate"; requestId: string; state: "started" | "succeeded" | "failed" | "quota_rejected" }
  >;
  succeed(input: { requestId: string; result: DomainIntelligenceResult; providers: Record<string, string>; completedAt: Date; limit: 1 | 3 }): Promise<{ used: number; limit: 1 | 3 }>;
  fail(input: { requestId: string; code: string; completedAt: Date }): Promise<void>;
  getOwnedQuery(input: { requestId: string; discordUserId: string }): Promise<StoredDomainQuery | null>;
  getQueryForOutbound(requestId: string): Promise<StoredDomainQuery | null>;
  recordConversion(input: { requestId: string; action: DomainConversionAction; destination: string; occurredAt: Date }): Promise<"recorded" | "duplicate" | "not-found">;
}
```

Tests must prove member limit 1, Verified limit 3, failed reservations release capacity, five-minute same-domain replay, six-minute repeat spends a new slot, duplicate interaction IDs do not charge, stale `started` rows are failed before counting, and a second Discord user cannot read or convert the first user's request.

- [ ] **Step 2: Run repository tests and observe failure**

Run: `npm test -- src/lib/domain-intelligence/repository.test.ts`
Expected: FAIL because the repository and test double do not exist.

- [ ] **Step 3: Implement the Neon repository with one atomic begin statement**

Use one SQL statement with data-modifying CTEs:

1. close this user's `started` rows older than `staleBefore` as `failed` with `stale_query_recovered`;
2. return a successful same-domain row completed after `replayAfter`;
3. count current-day `started` plus `succeeded` rows;
4. insert `started` only when there is no replay and count is below `limit`;
5. otherwise insert one `quota_rejected` audit row for the interaction;
6. return exactly one typed outcome.

`succeed` must atomically move only `started` to `succeeded`, set `charged_at`, safe provider summary, safe snapshot, and `completed_at`, then return the current successful count as `used` with the supplied limit. `fail` must clear any snapshot and store only a safe error code. `recordConversion` must derive `discord_user_id` from the owned query row and use a unique `(query_request_id, action)` index so browser retries do not inflate clicks.

- [ ] **Step 4: Prove PostgreSQL behavior with PGlite**

Integration tests must issue concurrent `begin` calls with `Promise.all`, prove only one member reservation starts at limit 1, prove exactly three Verified reservations start, migrate from the checked-in `drizzle/` folder, inspect JSON storage for absence of `rawWhois`, `registrant`, `email`, and `authorization`, and prove conversion idempotency.

Run:
`npm test -- src/lib/domain-intelligence/repository.test.ts src/lib/domain-intelligence/neon-repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain-intelligence/repository.ts src/lib/domain-intelligence/repository.test.ts src/lib/domain-intelligence/neon-repository.integration.test.ts src/test/domain-intelligence-repository.ts
git commit -m "feat: enforce atomic domain search allowances"
```

### Task 5: Authoritative RDAP with bounded WHOIS fallback

**Files:**
- Create: `src/lib/domain-intelligence/network-safety.ts`
- Create: `src/lib/domain-intelligence/network-safety.test.ts`
- Create: `src/lib/domain-intelligence/whois-transport.ts`
- Create: `src/lib/domain-intelligence/whois-transport.test.ts`
- Create: `src/lib/domain-intelligence/registration-client.ts`
- Create: `src/lib/domain-intelligence/registration-client.test.ts`

**Interfaces:**
- Produces: `isPublicIp(address: string): boolean`.
- Produces: `WhoisTransport.query(host: string, value: string, timeoutMs: number): Promise<string>`.
- Produces: `RegistrationProvider.lookup(domain: NormalizedDomain): Promise<RegistrationFacts | SafeProviderFailure>`.

- [ ] **Step 1: Write failing network-safety tests**

Test public examples (`8.8.8.8`, `1.1.1.1`, `2606:4700:4700::1111`) and reject loopback, RFC1918, link-local, carrier-grade NAT, documentation, multicast, unspecified, IPv4-mapped private IPv6, and malformed addresses. Also reject WHOIS hostnames containing credentials, ports other than 43, paths, control characters, or non-hostname syntax.

- [ ] **Step 2: Run the tests and observe failure**

Run: `npm test -- src/lib/domain-intelligence/network-safety.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement and test the bounded TCP transport**

Inject DNS and socket creation so tests never reach the network:

```ts
export type WhoisTransportDependencies = {
  resolve(host: string): Promise<string[]>;
  connect(input: { host: string; port: 43; timeoutMs: number; query: string; maxBytes: number }): Promise<string>;
};

export function createWhoisTransport(dependencies: WhoisTransportDependencies): WhoisTransport;
```

Resolve all addresses, reject the host if any selected address is non-public, connect to port 43 only, append `\r\n`, time out at 4 seconds, cap the response at 256 KiB, and reject NUL/control characters in the query. Tests prove timeout, oversized output, private resolution, socket error, and successful bounded output.

- [ ] **Step 4: Implement the registration client from fixtures**

Use the IANA bootstrap URL `https://data.iana.org/rdap/dns.json`, cache a validated bootstrap for 24 hours, select the queried TLD's service, and request the authoritative `domain/<ASCII domain>` URL with a 5-second timeout. Parse only registrar, registrar URL, creation/updated/expiry dates, status, nameservers, DNSSEC, source, and checked time.

When no RDAP service exists or the authoritative endpoint returns a typed unsupported response, query `whois.iana.org` for the TLD, accept only the `whois:` referral hostname, and query that host for the domain. Parse the same normalized fields without retaining raw text. A 404 RDAP result returns an empty registration record; it never declares commercial availability.

Tests use captured minimal IANA/RDAP/WHOIS fixtures and prove RDAP-first order, WHOIS fallback, no fallback on malformed/security failures, a 24-hour IANA bootstrap cache, a 60-minute successful registration-facts cache, redacted registrant omission, failure non-caching, and absence of raw responses.

Run:
`npm test -- src/lib/domain-intelligence/network-safety.test.ts src/lib/domain-intelligence/whois-transport.test.ts src/lib/domain-intelligence/registration-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain-intelligence/network-safety.ts src/lib/domain-intelligence/network-safety.test.ts src/lib/domain-intelligence/whois-transport.ts src/lib/domain-intelligence/whois-transport.test.ts src/lib/domain-intelligence/registration-client.ts src/lib/domain-intelligence/registration-client.test.ts
git commit -m "feat: add authoritative registration lookup"
```

### Task 6: Optional DNS and safe certificate enrichment

**Files:**
- Create: `src/lib/domain-intelligence/dns-client.ts`
- Create: `src/lib/domain-intelligence/dns-client.test.ts`
- Create: `src/lib/domain-intelligence/certificate-client.ts`
- Create: `src/lib/domain-intelligence/certificate-client.test.ts`

**Interfaces:**
- Consumes: `NormalizedDomain`, `isPublicIp`, `DnsSummary`, `CertificateSummary`, `SafeProviderFailure`.
- Produces: `DnsProvider.lookup(domain)` and `CertificateProvider.inspect(domain)`.

```ts
export interface DnsProvider {
  lookup(domain: NormalizedDomain): Promise<DnsSummary | SafeProviderFailure>;
}

export interface CertificateProvider {
  inspect(domain: NormalizedDomain): Promise<CertificateSummary | SafeProviderFailure>;
}
```

- [ ] **Step 1: Write failing DNS summary tests**

Inject `resolve4`, `resolve6`, `resolveMx`, `resolveTxt`, and `resolveNs`. Prove the client:

- runs bounded parallel lookups;
- sorts and deduplicates records;
- caps each record type at 10 entries and TXT strings at 512 characters;
- returns `null` for record-level `ENODATA`/`ENOTFOUND` without failing the whole summary;
- maps timeout/service failure to an optional safe failure;
- never uses DNS results as commercial availability.

- [ ] **Step 2: Run the DNS test and observe failure**

Run: `npm test -- src/lib/domain-intelligence/dns-client.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the bounded DNS provider and pass its tests**

Use a 3-second overall timeout, cache successful summaries for at most five minutes, and return only `{ a, aaaa, mx, txt, ns, checkedAt }`. Run:
`npm test -- src/lib/domain-intelligence/dns-client.test.ts`
Expected: PASS.

- [ ] **Step 4: Write and satisfy certificate safety tests**

Inject hostname resolution and TLS connection. Resolve first; reject inspection if the chosen address is not public. Connect to the validated public address while setting `servername` to the normalized domain, require TLS certificate retrieval, time out at 4 seconds, and return only issuer common name, subject common name, valid-from, valid-to, protocol, and checked-at.

Tests prove no connection occurs for private/loopback/link-local resolution, SNI uses the normalized domain, a certificate error becomes optional enrichment failure, successful summaries expire after 15 minutes, failures are not cached, and raw certificate bytes are not returned.

Run: `npm test -- src/lib/domain-intelligence/certificate-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain-intelligence/dns-client.ts src/lib/domain-intelligence/dns-client.test.ts src/lib/domain-intelligence/certificate-client.ts src/lib/domain-intelligence/certificate-client.test.ts
git commit -m "feat: add safe DNS and certificate enrichment"
```

### Task 7: RayName-required domain intelligence service

**Files:**
- Create: `src/lib/domain-intelligence/service.ts`
- Create: `src/lib/domain-intelligence/service.test.ts`
- Create: `src/lib/domain-intelligence/runtime.ts`
- Create: `src/lib/domain-intelligence/runtime.test.ts`

**Interfaces:**
- Consumes: all provider and repository contracts from Tasks 1–6.
- Produces: `DomainIntelligenceService.search(input)` and `.compare(input)`.
- Produces: `createDomainIntelligenceRuntime(env, fetchImpl)` without changing verification runtime.

- [ ] **Step 1: Write the failing orchestration tests**

Use this public service contract:

```ts
type DomainSearchInput = {
  interactionId: string;
  guildId: string;
  discordUserId: string;
  roleIds: string[];
  rawDomain: string;
};

type DomainSearchOutcome =
  | { status: "success"; requestId: string; result: DomainIntelligenceResult; replayed: boolean; used: number; limit: 1 | 3 }
  | { status: "quota-rejected"; requestId: string; used: number; limit: 1 | 3; verifyAvailable: boolean }
  | { status: "invalid" }
  | { status: "unavailable"; safeMessage: string; retryable: boolean }
  | { status: "not-enabled" };

type DomainCompareSort = "registration" | "renewal" | "transfer";
type DomainComparisonOutcome =
  | { status: "success"; requestId: string; sort: DomainCompareSort; page: number; pageCount: number; rows: RayNameTldPrice[] }
  | { status: "not-owned" | "unavailable" | "not-enabled"; safeMessage: string };
```

Prove:

- Verified tier comes only from the configured role ID in `roleIds`;
- member/Verified limits are 1/3;
- internal mode requires intersection with `betaRoleIds`;
- public mode permits guild members;
- disabled/unconfigured mode returns `not-enabled` without calling providers;
- quota rejection happens before providers;
- RayName failure fails the query and releases the reservation;
- registration, DNS, and certificate failures do not fail valid RayName data;
- provider results run in parallel after the reservation;
- successful results store only normalized safe data;
- replay calls no provider and consumes no allowance;
- `compare` verifies query ownership, supports `registration | renewal | transfer`, returns five rows per page, and does not reserve allowance.

- [ ] **Step 2: Run the service tests and observe failure**

Run: `npm test -- src/lib/domain-intelligence/service.test.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the orchestrator**

Use `normalizeDomain`, `usageDayAt(now())`, a two-minute stale reservation, and a five-minute replay boundary. Call `repository.begin` first. Require a valid RayName result. Merge optional `Promise.allSettled` enrichment, then call `repository.succeed`. Any failure before completion calls `repository.fail` with a fixed safe code.

Calculate returned `used` from the `{ used, limit }` value returned by `repository.succeed`; never derive it from an in-memory counter.

- [ ] **Step 4: Implement runtime composition and fail-closed tests**

`createDomainIntelligenceRuntime` composes database, repository, RayName client, registration provider, DNS provider, certificate provider, clock, and configuration. Missing RayName config makes only domain intelligence unavailable; `createVerificationRuntime` and `/verify` remain ready.

Run:
`npm test -- src/lib/domain-intelligence/service.test.ts src/lib/domain-intelligence/runtime.test.ts src/lib/verification/runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain-intelligence/service.ts src/lib/domain-intelligence/service.test.ts src/lib/domain-intelligence/runtime.ts src/lib/domain-intelligence/runtime.test.ts src/lib/domain-intelligence/repository.ts src/lib/domain-intelligence/repository.test.ts src/lib/domain-intelligence/neon-repository.integration.test.ts
git commit -m "feat: orchestrate RayName domain intelligence"
```

### Task 8: Native Discord result payloads and original-response client

**Files:**
- Create: `src/lib/discord/domain-message.ts`
- Create: `src/lib/discord/domain-message.test.ts`
- Create: `src/lib/discord/interaction-client.ts`
- Create: `src/lib/discord/interaction-client.test.ts`
- Modify: `src/lib/discord/rest-client.ts`
- Modify: `src/lib/discord/rest-client.test.ts`

**Interfaces:**
- Consumes: `DomainSearchOutcome` and comparison outcomes.
- Produces: `renderDomainOutcome(outcome, links): DiscordWebhookMessage`.
- Produces: `DiscordInteractionClient.editOriginal(input)`.

Define the rendering boundary as:

```ts
export type DiscordWebhookMessage = {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
  }>;
  components?: Array<{
    type: 1;
    components: Array<{
      type: 2;
      style: 1 | 2 | 5;
      label: string;
      custom_id?: string;
      url?: string;
      disabled?: boolean;
    }>;
  }>;
};

export type DomainMessageLinks = {
  primary: string | null;
  fullIntelligence: string | null;
};
```

- [ ] **Step 1: Write failing message snapshots as structural assertions**

Do not snapshot entire JSON strings. Assert exact important fields:

```ts
const message = renderDomainOutcome(successOutcome, links);
expect(message.embeds?.[0]).toMatchObject({
  title: "lucidgrid.ai",
  description: expect.stringContaining("**Available**"),
});
expect(JSON.stringify(message)).toContain("RayName pricing");
expect(JSON.stringify(message)).toContain("Register on RayName");
expect(JSON.stringify(message)).toContain("2 of 3 searches left today");
expect(JSON.stringify(message)).not.toContain("rawWhois");
```

Cover available, registered, premium-with-renewal-premium, premium-with-standard-renewal, quota exhausted, RayName unavailable, optional enrichment unavailable, and five-row comparison pagination. Assert no message exceeds Discord embed, field, component-row, button-label, or custom-ID limits.

- [ ] **Step 2: Run the renderer tests and observe failure**

Run: `npm test -- src/lib/discord/domain-message.test.ts`
Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: Implement the renderer with V3 copy**

Use one compact embed, a purple RayName accent, bold status, three price fields, at most four intelligence fields, remaining allowance in the footer, and at most two action rows. Use link buttons for RayName destinations and bound custom IDs for compare/sort/page/verify actions. Keep the exact exhausted and unavailable copy from the spec.

- [ ] **Step 4: Add and pass the Discord edit-original client tests**

The client must call:

```text
PATCH /webhooks/{applicationId}/{interactionToken}/messages/@original
Content-Type: application/json
```

It does not send the bot token. Use a 10-second timeout. Return `{ status: "edited" }` for 2xx and typed safe failures for 401/404, 429, timeout, and 5xx. Never include the interaction token, response body, or payload in safe failures.

Run:
`npm test -- src/lib/discord/domain-message.test.ts src/lib/discord/interaction-client.test.ts src/lib/discord/rest-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discord/domain-message.ts src/lib/discord/domain-message.test.ts src/lib/discord/interaction-client.ts src/lib/discord/interaction-client.test.ts src/lib/discord/rest-client.ts src/lib/discord/rest-client.test.ts
git commit -m "feat: render private RayFox domain results"
```

### Task 9: `/domain` dispatch, components, and Next.js background execution

**Files:**
- Modify: `src/lib/discord/interactions.ts`
- Modify: `src/lib/discord/interactions.test.ts`
- Modify: `src/app/api/discord/interactions/route.ts`
- Modify: `src/app/api/discord/interactions/route.test.ts`
- Modify: `scripts/register-discord-commands.mjs`
- Modify: `scripts/register-discord-commands.test.ts`

**Interfaces:**
- Consumes: `DomainIntelligenceService`, renderer, and interaction client.
- Produces: `DiscordInteractionDispatch = { response: DiscordInteractionResponse; background?: () => Promise<void> }`.
- Produces: registered guild commands `verify` and `domain`.

- [ ] **Step 1: Read the installed Next.js 16 guides completely**

Run:

```bash
sed -n '1,400p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
sed -n '1,320p' node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md
```

Confirm the implementation uses the installed `after` API rather than assumptions from earlier Next.js versions.

- [ ] **Step 2: Write failing dispatch and route tests**

Prove:

- PING still returns type 1 with no background task;
- `/verify` still opens/submits the same modal and copy;
- `/domain` rejects malformed/missing domain privately without background work;
- valid `/domain` returns type 5 with `flags: 64` and a background callback;
- the callback invokes the service and edits the original response;
- a compare/sort/page component returns a private deferred update and can be used only by the original user;
- the exhausted-result verification button opens the existing RayName verification modal for a non-Verified member;
- another user's component attempt receives a private denial and does not call the provider;
- the route validates the signature before scheduling;
- the route passes a background promise to an injected scheduler exactly once;
- a background failure is caught and converted to a best-effort safe edit without rejecting the completed HTTP response.

Use an injectable `schedule(task: () => Promise<void>): void`; production passes `task => after(task)`.

- [ ] **Step 3: Run the targeted tests and observe failure**

Run:
`npm test -- src/lib/discord/interactions.test.ts src/app/api/discord/interactions/route.test.ts`
Expected: FAIL because deferred/background dispatch is not implemented.

- [ ] **Step 4: Implement dispatch and command registration**

Extend response types with type 5 (`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`) and type 6 (`DEFERRED_UPDATE_MESSAGE`). Parse the slash option named `domain`; never use message text. Capture only interaction ID, token, application ID, guild ID, invoking user ID, roles, and normalized command data in the background closure. Set `export const maxDuration = 30` on the production Route Handler so `after()` remains bounded by the provider timeout budget.

Register:

```js
{
  name: "domain",
  description: "Check a domain with RayName Intelligence",
  type: 1,
  dm_permission: false,
  options: [{
    type: 3,
    name: "domain",
    description: "Domain name, for example lucidgrid.ai",
    required: true,
    min_length: 3,
    max_length: 253,
  }],
}
```

Keep guild PUT registration atomic so `/verify` is not removed. Run:
`npm test -- src/lib/discord/interactions.test.ts src/app/api/discord/interactions/route.test.ts scripts/register-discord-commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discord/interactions.ts src/lib/discord/interactions.test.ts src/app/api/discord/interactions/route.ts src/app/api/discord/interactions/route.test.ts scripts/register-discord-commands.mjs scripts/register-discord-commands.test.ts
git commit -m "feat: add private RayFox domain command"
```

### Task 10: Signed RayName outbound attribution

**Files:**
- Create: `src/lib/domain-intelligence/link-token.ts`
- Create: `src/lib/domain-intelligence/link-token.test.ts`
- Create: `src/app/api/rayfox/outbound/[token]/route.ts`
- Create: `src/app/api/rayfox/outbound/[token]/route.test.ts`
- Modify: `src/lib/tracking.ts`
- Modify: `src/lib/tracking.test.ts`

**Interfaces:**
- Consumes: repository `getQueryForOutbound` and `recordConversion`, configured link signing key.
- Produces: `createOutboundToken` and `verifyOutboundToken`.
- Produces: safe 302 redirect route.

- [ ] **Step 1: Write failing token tests**

Use HMAC-SHA-256 with a separate 32-byte key and a base64url payload containing only `{ requestId, action, expiresAt }`. Tokens expire 24 hours after creation. Prove round-trip, signature tampering rejection, expired token rejection, malformed payload rejection, invalid action rejection, and timing-safe signature verification.

- [ ] **Step 2: Run token tests and observe failure**

Run: `npm test -- src/lib/domain-intelligence/link-token.test.ts`
Expected: FAIL because the token module does not exist.

- [ ] **Step 3: Implement the outbound route from stored trusted data**

The route must:

1. verify the token;
2. load the query server-side using request ID;
3. select a destination from the stored RayName result based on action; for `continue_on_site`, use the configured RayName domain-page base URL plus the stored normalized domain;
4. validate HTTPS and `rayname.com`/subdomain using `buildTrackedRayNameUrl`;
5. add fixed attribution: source `discord`, medium `rayfox`, campaign `domain-intelligence`, content matching the action;
6. record an idempotent click;
7. redirect with 302;
8. return 404 for invalid, expired, unowned, or missing tokens without disclosing which check failed.

The internal token must not contain Discord identity and must not be forwarded to RayName. Do not accept a destination URL from request query parameters.

- [ ] **Step 4: Pass route and tracking tests**

Tests prove register/transfer/full-intelligence/limit destinations, idempotent browser retry, non-RayName destination rejection, no Discord username/email in the redirect, and no open redirect.

Run:
`npm test -- src/lib/domain-intelligence/link-token.test.ts src/app/api/rayfox/outbound/[token]/route.test.ts src/lib/tracking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain-intelligence/link-token.ts src/lib/domain-intelligence/link-token.test.ts src/app/api/rayfox/outbound/[token]/route.ts src/app/api/rayfox/outbound/[token]/route.test.ts src/lib/tracking.ts src/lib/tracking.test.ts
git commit -m "feat: track safe RayName domain conversions"
```

### Task 11: Controlled stubs and full acceptance journey

**Files:**
- Create: `scripts/rayname-commerce-api-stub.mjs`
- Create: `scripts/rayname-commerce-api-stub.test.ts`
- Modify: `scripts/discord-api-stub.mjs`
- Modify: `scripts/discord-api-stub.test.ts`
- Create: `scripts/domain-intelligence-e2e-fixtures.mjs`
- Create: `scripts/domain-intelligence-e2e-fixtures.test.ts`
- Create: `scripts/run-domain-intelligence-e2e.mjs`
- Create: `scripts/run-domain-intelligence-e2e.test.ts`
- Create: `e2e/domain-intelligence.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: production HTTP contracts without real Discord or real RayName mutation.
- Produces: reproducible local acceptance environment on loopback only.

- [ ] **Step 1: Write failing stub contract tests**

RayName stub modes: `available`, `registered`, `premium`, `malformed`, `rate-limited`, and `unavailable`. It must require the test bearer token, return deterministic prices, expose recorded safe request paths, and bind only to `127.0.0.1`.

Discord stub must accept and record `PATCH /webhooks/{applicationId}/{interactionToken}/messages/@original` without bot authorization, return configurable 429/5xx responses, and never persist interaction tokens in its public call summary; store a stable test alias instead.

- [ ] **Step 2: Run stub tests and observe failure**

Run:
`npm test -- scripts/rayname-commerce-api-stub.test.ts scripts/discord-api-stub.test.ts`
Expected: FAIL until both stub behaviors exist.

- [ ] **Step 3: Implement disposable fixtures and runner**

Use a deterministic Discord Ed25519 test keypair, normal and Verified member IDs, disposable Neon branch checks matching the existing verification E2E safety pattern, Discord stub port 3114, RayName stub port 3115, and app port 3113. The runner supplies internal mode plus both member roles as beta roles, never accepts a production database branch, and closes both stubs on SIGINT/SIGTERM.

- [ ] **Step 4: Implement and pass acceptance tests**

Prove through signed HTTP interactions and recorded webhook edits:

- normal member receives one successful private result and the second request gets the exhausted copy;
- Verified member receives three successful results and the fourth gets exhausted copy;
- available, registered, and premium cards contain the correct RayName CTA and prices;
- repeat within five minutes replays without another provider call;
- malformed/upstream failure does not consume allowance;
- quota rejection produces no RayName, RDAP, DNS, or TLS request;
- `/verify` still works;
- all initial domain responses are deferred ephemeral responses;
- outbound redirect preserves domain and fixed attribution while recording one click.

Run: `npm run test:e2e -- e2e/domain-intelligence.spec.ts` with the documented disposable environment.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/rayname-commerce-api-stub.mjs scripts/rayname-commerce-api-stub.test.ts scripts/discord-api-stub.mjs scripts/discord-api-stub.test.ts scripts/domain-intelligence-e2e-fixtures.mjs scripts/domain-intelligence-e2e-fixtures.test.ts scripts/run-domain-intelligence-e2e.mjs scripts/run-domain-intelligence-e2e.test.ts e2e/domain-intelligence.spec.ts playwright.config.ts
git commit -m "test: prove RayFox domain intelligence journey"
```

### Task 12: Operational documentation and final release gates

**Files:**
- Modify: `docs/operations.md`
- Modify: `.env.example`
- Modify: `package.json`
- Create: `scripts/run-domain-intelligence-e2e.d.mts`

**Interfaces:**
- Produces: operator commands for command registration, migrations, internal enablement, rollback, and public-launch criteria.

- [ ] **Step 1: Add an executable E2E script entry and type declaration**

Add:

```json
"test:domain-intelligence:e2e": "node scripts/run-domain-intelligence-e2e.mjs"
```

Declare the runner exports in `scripts/run-domain-intelligence-e2e.d.mts` so TypeScript checks test imports without weakening `allowJs: false`.

- [ ] **Step 2: Document the exact deployment sequence**

Document:

1. keep `RAYFOX_DOMAIN_INTELLIGENCE_MODE=disabled`;
2. apply `npm run db:migrate` to a disposable Neon branch;
3. run unit, integration, build, and domain E2E gates;
4. configure the real RayName non-production provider and run its contract suite;
5. register guild commands with `npm run discord:register`;
6. set mode `internal` and selected beta role IDs;
7. verify normal and Verified accounts, provider latency, and outbound attribution;
8. set mode `public` only after the seven RayName dependencies in the spec are satisfied;
9. rollback by setting mode `disabled` before reverting code; retain query and conversion audit rows.

Include the exact statement that click events are not registrations, transfers, or revenue.

Add read-only monitoring queries that report searches by status/tier, unique querying members, top TLDs without full labels, outbound actions, provider failure codes, and latest provider freshness. The queries must not select `normalized_domain`, Discord identity, result snapshots, or destinations in aggregate operator output.

- [ ] **Step 3: Run focused and full verification**

Run in order:

```bash
npm test -- src/lib/domain-intelligence src/lib/discord scripts/register-discord-commands.test.ts scripts/rayname-commerce-api-stub.test.ts
npm run typecheck
npm run lint
npm run build
npm test
npm run test:domain-intelligence:e2e
```

Expected: every command exits 0. If the disposable Neon environment is not configured, the final E2E command must stop with the documented safe prerequisite error; do not claim the E2E gate passed.

- [ ] **Step 4: Inspect the final diff and safety invariants**

Run:

```bash
git diff --check
git status --short
rg -n "rawWhois|registrantEmail|Authorization.*console|RAYNAME_COMMERCE_API_TOKEN.*console" src scripts e2e
```

Expected: no whitespace errors; only intended task files are changed; the secret/raw-data scan returns no unsafe logging or persistence. Confirm the user's pre-existing untracked assets and `audit/` directory remain untouched.

- [ ] **Step 5: Commit**

```bash
git add docs/operations.md .env.example package.json scripts/run-domain-intelligence-e2e.d.mts
git commit -m "docs: add RayFox domain intelligence operations"
```

## Checkpoint order for inline execution

Use `superpowers:executing-plans` with these checkpoints:

1. **Foundation checkpoint:** Tasks 1–4 — domain model, RayName contract, schema, atomic allowance.
2. **Data checkpoint:** Tasks 5–7 — authoritative lookup, safe enrichment, orchestrator/runtime.
3. **Discord checkpoint:** Tasks 8–10 — native card, deferred interactions, safe attribution.
4. **Release checkpoint:** Tasks 11–12 — controlled acceptance journey and operational gates.

At each checkpoint, run the targeted tests listed in its tasks, inspect the diff, and report evidence before continuing.
