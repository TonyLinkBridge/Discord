# RayFox Domain Intelligence Bot Design

**Date:** 2026-08-25  
**Status:** Product direction approved in chat; pending written-spec review  
**Scope:** Internal-beta Discord Bot, RayName domain-intelligence boundary, usage limits, and website conversion

## 1. Goal

Turn the existing RayFox Discord application into a private, RayName-first domain research and purchase assistant.

Members use one command to understand a domain, see RayName registration, renewal, transfer, availability, and premium information, and continue the transaction on RayName. RayName-owned commercial data must come from RayName. External providers are used only for public registration, DNS, and certificate facts that RayName does not own.

The first release is an internal beta. It must not be publicly enabled until the RayName commerce provider can return truthful availability, premium, and price data.

## 2. Confirmed product decisions

- Extend the existing **RayFox** Discord application; do not create a second bot.
- The primary command is `/domain <domain>`.
- Results are Discord ephemeral responses, visible only to the invoking member.
- A non-Verified member receives **1 successful search per day**.
- A member with the configured **Verified Customer** Discord role receives **3 successful searches per day**.
- Daily allowances reset at `00:00` in `Asia/Kuala_Lumpur`.
- Invalid input, provider errors, and results missing required RayName commercial data do not consume an allowance.
- Repeating the same normalized domain within five minutes returns the existing result and does not consume another allowance.
- Once the allowance is exhausted, RayFox does not call paid or expensive lookup providers. It returns a concise website CTA.
- Pricing, availability, premium status, purchase links, and transfer links must be RayName-sourced.
- A purchase CTA opens a prefilled RayName domain page rather than skipping directly to payment.
- RayName revalidates availability, premium status, and price before checkout.
- The internal beta may show official registration, DNS, and certificate facts while RayName integration is being tested, but public launch remains disabled until the required RayName fields are connected.

## 3. Why Bot first

Slash commands provide the lowest-friction Discord experience and reuse the current HTTP interaction endpoint, signature verification, Verified Customer role, member synchronization, and private-response pattern.

A Discord Activity is intentionally deferred. It becomes useful later for bulk comparison, larger tables, history, charts, and portfolio workflows. Building it before the core provider and commerce contracts would add a second interface without improving data quality.

## 4. User experience

### 4.1 Primary flow

1. The member invokes `/domain lucidgrid.ai`.
2. RayFox acknowledges the interaction privately and shows a loading state.
3. The service normalizes and validates the domain.
4. The service checks membership tier, allowance, idempotency, and the five-minute duplicate window.
5. If allowance exists, the domain-intelligence orchestrator requests the required providers.
6. RayFox edits the private response with a result card.
7. A RayName CTA opens a prefilled domain page with Discord attribution.

### 4.2 Available domain

Display:

- normalized domain
- `Available`
- RayName registration price
- RayName renewal price
- RayName transfer price when applicable
- RayName premium status and premium amount when applicable
- registry or TLD operator when known
- checked-at time
- remaining daily allowance
- **Register on RayName**
- **Compare extensions**

### 4.3 Registered domain

Display:

- normalized domain
- `Registered`
- registrar
- creation, expiry, and updated dates when published
- domain status
- nameservers and DNSSEC summary
- certificate summary when safely available
- RayName transfer price and transfer eligibility when RayName can determine it
- remaining daily allowance
- **Transfer to RayName**
- **View full intelligence**

Redacted registrant information is not treated as an error and is not reconstructed from other sources.

### 4.4 Premium domain

Never display only a generic `Premium` label when RayName has returned a price. Display:

- premium registration price
- premium renewal price
- whether renewal remains premium
- checked-at time
- a short note that final price and availability are revalidated on RayName

### 4.5 Compare extensions and price ranking

The result card includes **Compare extensions**. It updates the same private interaction with RayName-supported extensions for the queried label.

- Sort controls: registration, renewal, or transfer price.
- Show five extensions at a time with next/previous buttons.
- Show availability only when the RayName provider can return it truthfully.
- Price catalogue comparison is part of the original search and does not consume another allowance.
- Selecting a different label or invoking a new `/domain` command is a new search.

### 4.6 Allowance exhausted

Return native, concise English:

> **You’re out of Discord searches for today.**  
> Keep going on RayName for live pricing, availability, and the full lookup.

Buttons:

- **Continue on RayName**
- **Verify your RayName account** for non-Verified members only

Do not reveal partial expensive-provider results after the allowance check fails.

### 4.7 Provider unavailable

If RayName commercial data is unavailable, do not substitute another registrar's price or invent a value. Return:

> **RayName pricing is temporarily unavailable.**  
> We didn’t count this search. Try again in a moment.

Official registration facts may be included below this message during internal beta, clearly separated from RayName commercial data.

## 5. Architecture

```text
Discord /domain
      │
      ▼
Existing signed Interaction Endpoint
      │
      ├── Interaction idempotency
      ├── Guild/member/role validation
      ├── Daily allowance service
      │
      ▼
Domain Intelligence Orchestrator
      │
      ├── RayName Commerce Provider (required for public launch)
      │     ├── availability
      │     ├── premium status and prices
      │     ├── register / renew / transfer prices
      │     ├── transfer eligibility
      │     └── prefilled RayName URL
      │
      ├── Registration Provider
      │     ├── authoritative RDAP first
      │     └── WHOIS fallback where required
      │
      ├── DNS Provider
      └── Safe Certificate Inspector
            │
            ▼
Normalized result + provenance + freshness
            │
            ▼
Private Discord card + attributed RayName CTA
```

The orchestrator depends on provider interfaces, not concrete vendors. A provider can be replaced without changing Discord rendering, quota rules, or database records.

## 6. Provider contracts

### 6.1 RayName commerce provider

The RayName technical team must expose a server-to-server contract equivalent to:

```ts
interface RayNameCommerceProvider {
  lookup(domain: string): Promise<{
    availability: "available" | "registered" | "reserved" | "unknown";
    premium: boolean;
    premiumRenewal: boolean | null;
    currency: string;
    registrationPrice: string | null;
    renewalPrice: string | null;
    transferPrice: string | null;
    transferEligible: boolean | null;
    checkoutUrl: string;
    checkedAt: string;
  }>;
  listTldPrices(label: string): Promise<RayNameTldPrice[]>;
}
```

Money travels as decimal strings plus ISO currency codes, never binary floating-point numbers. The provider must distinguish `unknown` from `available`. A timeout or incomplete price set is a typed failure, not an empty result.

### 6.2 Registration provider

- Use authoritative RDAP when the queried TLD or IP registry supports it.
- Use WHOIS only as a compatibility fallback.
- Preserve provider and checked-at metadata.
- Normalize dates, status codes, registrar identifiers, and nameservers.
- Do not scrape arbitrary result websites when an authoritative protocol exists.

### 6.3 DNS provider

Return a small supported record summary. Bound the query count and timeout. DNS data is informational and does not decide commercial availability.

### 6.4 Certificate provider

Certificate inspection is optional enrichment. Resolve the hostname first and reject private, loopback, link-local, multicast, and otherwise non-public destinations before opening a connection. Certificate failure must not fail the core lookup.

## 7. Data ownership policy

| Fact | Required source |
|---|---|
| RayName registration price | RayName |
| RayName renewal price | RayName |
| RayName transfer price | RayName |
| Domain availability | RayName commercial provider for purchase decisions |
| Premium status and price | RayName commercial provider |
| Purchase/transfer destination | RayName |
| Registration record | Authoritative RDAP, WHOIS fallback |
| DNS records | Direct DNS lookup |
| Certificate facts | Direct safe certificate inspection |
| Marketplace or comparable sales | Separate contracted provider in a later release |

No third-party registrar price is presented as RayName data. Every normalized result retains source and freshness internally even when the compact Discord card does not show the full provenance list.

## 8. Allowance and idempotency

Allowance is enforced server-side by Discord user ID and guild ID.

- Tier is read from the invoking interaction's member roles and checked against the configured Verified Customer role ID.
- The synchronized role snapshot may support administration and reporting, but the interaction role payload is authoritative for the current command.
- The daily key is calculated in `Asia/Kuala_Lumpur`, independent of server timezone.
- One allowance is committed only after a valid result containing required RayName commercial data is ready to deliver.
- The allowance commit and completed-query record are atomic.
- Duplicate Discord interaction IDs return the stored outcome and never charge twice.
- A five-minute normalized-domain reuse window returns the previous completed result for that member without another charge.
- Concurrent requests from the same member cannot exceed the daily ceiling.
- Admin, staff, and bot accounts receive no hidden unlimited tier in the first release; testing bypasses use an explicit non-production configuration.

## 9. Persistence

Add checked-in Drizzle migrations; do not use production schema push.

### `domain_query_requests`

- `id`
- `interaction_id` unique
- `guild_id`
- `discord_user_id`
- `normalized_domain`
- `tier`: `member | verified`
- `status`: `started | succeeded | failed | quota_rejected`
- `usage_day`
- `charged_at`
- `safe_error_code`
- `provider_summary` containing source names and freshness only
- `result_snapshot` containing the minimum normalized data needed for five-minute replay
- `created_at`, `completed_at`

Do not store raw WHOIS responses, registrant personal data, Discord message content, or provider secrets in this table.

### `domain_conversion_events`

- `id`
- `query_request_id`
- `discord_user_id`
- `normalized_domain`
- `action`: `register | transfer | full_intelligence | continue_on_site`
- `destination_url`
- `occurred_at`

The Discord click is an outbound-intent event. Purchase completion becomes a separate RayName-side event when the website integration exists; the bot must not report a click as revenue.

## 10. Discord interaction behavior

- Continue receiving interactions over the existing signed HTTP endpoint.
- Add the `/domain` command without changing `/verify`.
- Defer the response ephemerally before provider work, then edit the original response.
- Handle button and select-menu interactions for price sorting, pagination, and related actions.
- Bind every component custom ID to the requesting user and query request; another member cannot reuse it.
- Allow interaction components to expire safely. An expired result directs the user to run a new command without charging until a new successful result is returned.
- Use native, concise, non-textbook English consistent with RayName V3 brand voice.

## 11. Caching and freshness

- RayName availability and premium lookup: maximum 60 seconds, followed by checkout revalidation.
- RayName TLD price catalogue: maximum 15 minutes or provider-driven invalidation.
- RDAP/WHOIS registration facts: maximum 60 minutes.
- DNS summary: maximum 5 minutes.
- Certificate summary: maximum 15 minutes.
- Per-member five-minute replay uses the original result and displays its checked-at time.

Caching reduces provider cost but never changes the daily allowance rule. Public-launch monitoring must show provider freshness and failure rates to admins.

## 12. Security and abuse controls

- Retain Ed25519 Discord request-signature verification.
- Normalize Unicode domains to ASCII/Punycode for provider calls while displaying a safe Unicode form where possible.
- Validate domain length, label length, public suffix, characters, and control-character absence.
- Prevent SSRF in all network enrichments.
- Keep RayName and third-party credentials server-only.
- Apply bounded timeouts, response-size limits, typed provider failures, and Discord/API rate-limit handling.
- Never log authorization headers, raw provider responses containing personal data, or verification email information.
- Website CTA parameters contain query and attribution IDs, not Discord usernames or email addresses.

## 13. Tracking

Every RayName URL includes a server-generated attribution identifier and fixed campaign fields equivalent to:

- source: `discord`
- medium: `rayfox`
- campaign: `domain-intelligence`
- content: `register`, `transfer`, `full-intelligence`, or `limit`

The identifier allows RayName to connect a website visit and eventual conversion without placing Discord identity in the URL.

## 14. Admin visibility

The existing admin console may show only provider-backed facts:

- searches attempted, succeeded, failed, and quota-rejected
- member versus Verified usage
- unique querying members
- top queried TLDs, excluding full domain labels by default
- outbound RayName CTA clicks
- provider availability, latency bands, and freshness

Revenue, registrations, and transfers remain unavailable until RayName returns real conversion events.

## 15. Testing strategy

Follow test-driven development.

### Unit and contract tests

- domain normalization, IDN/Punycode, and invalid input
- member and Verified allowance at the Kuala Lumpur day boundary
- atomic charging, concurrent requests, duplicate interaction IDs, and five-minute replay
- successful, unavailable, partial, malformed, timed-out, and rate-limited providers
- premium and premium-renewal price handling
- money and currency formatting
- source and freshness preservation
- SSRF rejection for private and non-public destinations

### Route and interaction tests

- `/verify` behavior remains unchanged
- `/domain` is guild-only and always private
- deferred private response is edited with the correct available, registered, premium, unavailable, or exhausted state
- failed results do not charge
- buttons cannot be used by another member
- comparison sorting and pagination do not spend another allowance
- over-quota requests do not call lookup providers

### Repository and integration tests

- migrations apply to a disposable Neon branch
- query completion and allowance charging are atomic
- stored snapshots omit raw WHOIS and personal registration data
- RayName provider contract runs against a controlled stub until the real provider is available
- conversion clicks and completed purchases remain distinct events

### Browser and Discord acceptance tests

- test with a normal member and a Verified Customer account
- confirm 1/day and 3/day behavior across the Kuala Lumpur reset boundary
- confirm all results are private
- confirm mobile readability and button order
- confirm RayName deep links preserve the domain and attribution
- confirm a provider outage never shows external prices as RayName prices

## 16. Release sequence

### Stage 1 — Foundation

- provider interfaces and normalized domain result
- allowance, idempotency, query storage, and safe caching
- `/domain` private flow using controlled provider stubs
- feature flag restricted to staff/test accounts

### Stage 2 — RayName integration

- connect real RayName availability, premium, price catalogue, and prefilled URLs
- run contract tests against a non-production RayName environment
- verify checkout revalidation and attribution handoff

### Stage 3 — Internal beta

- enable the command for selected RayName Discord roles
- test normal and Verified accounts
- monitor correctness, latency, provider cost, and website click-through

### Stage 4 — Public Discord release

- require healthy RayName commercial data and an approved rollback path
- enable 1/day and 3/day allowances for all eligible members
- keep bulk search, AI valuation, sales comparables, Discord Activity, and portfolio actions out of the first public release

## 17. Dependencies required from the RayName technical team

Public launch is blocked until RayName supplies all of the following:

1. server-authenticated availability and premium lookup
2. registration, renewal, and transfer price catalogue with currency
3. premium registration and renewal pricing semantics
4. transfer eligibility or an explicit `unknown` response
5. a stable prefilled domain-page URL contract
6. a non-production environment or deterministic test fixture
7. documented timeout, rate-limit, error, and freshness behavior

The Bot can be built and tested against the defined contract before these endpoints exist. It must fail closed and remain internal until the real integration passes contract and acceptance tests.

## 18. Success criteria

- A normal member receives exactly one successful private domain search per Kuala Lumpur day.
- A Verified Customer receives exactly three.
- A failed or incomplete result never consumes allowance.
- RayName price, availability, premium, and purchase facts come only from RayName.
- Registration, DNS, and certificate facts are clearly separated from RayName commercial data.
- Available domains lead to a prefilled RayName registration page.
- Registered domains lead to a prefilled RayName transfer or intelligence page.
- Over-quota users are directed to RayName without triggering expensive provider work.
- No public release occurs with placeholder, external, stale, or fabricated RayName pricing.

