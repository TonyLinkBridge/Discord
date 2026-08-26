# RayFox Trustworthy Beta and Card Navigation Design

Date: 2026-08-26

## Objective

Keep RayFox useful before the RayName commerce API is available without presenting fixture prices, fixture availability, or fixture premium decisions as customer-facing facts. Internal testers may continue exercising the complete pricing and comparison flow. Members receive only live public-domain intelligence and a safe link to check current commercial information on RayName.

The same change adds reversible navigation between a domain overview and the extension comparison board without consuming another daily query.

## Product Rules

### Community members

When the runtime is using fixture commerce data, a member who is not an internal tester sees:

- live registry data returned by RDAP or WHOIS;
- live DNS data when available;
- live TLS certificate data when available;
- a clear source label and lookup time for each displayed intelligence section;
- a `Check live price on RayName` link.

The member does not see:

- fixture registration, renewal, or transfer prices;
- fixture `Available`, `Registered`, or `Reserved` claims;
- fixture premium-domain decisions;
- extension price comparison or ranking controls;
- wording such as `RayName pricing · checked ...` when no RayName commerce request occurred.

Registry absence must be described as `No registry record found`, not `Available`, because RDAP or WHOIS absence is not a purchase guarantee. Provider failures display `unavailable`; RayFox never fills gaps with guessed data.

### Internal testers

Internal testers continue to see the current fixture commerce card and the extension comparison board. Every fixture view retains the prominent `Internal beta · Test data` warning.

Tester access is determined server-side from an explicit allow-list of Discord tester role IDs and existing admin Discord user IDs. A hidden button is not treated as access control: comparison requests are rejected server-side when the caller is not a tester.

### Live RayName mode

When the RayName commerce API is configured and test-data mode is disabled, all authorized members may see RayName availability, premium status, prices, comparison, and ranking. A missing or failed RayName response produces a safe unavailable state and never falls back to fixtures.

## Card Experience

### Member public-intelligence overview

The header describes the registry finding, not commercial availability:

- `Registry record found`
- `No registry record found`
- `Registry status unavailable`

Sections show only facts actually returned by their providers. Each section identifies its source, for example `Registry · RDAP`, `DNS · Live lookup`, or `Certificate · Live TLS lookup`. The primary action is `Check live price on RayName`.

### Tester or live-commerce overview

The existing commercial overview remains, with its current registration, renewal, transfer, premium, and RayName actions. In fixture mode it remains unmistakably marked as test data.

### Comparison navigation

The comparison card contains:

- registration, renewal, and transfer sort controls;
- `Previous` and `Next` pagination;
- `← Domain overview`.

`Domain overview` restores the original stored result for the same request and owner. It does not perform a new provider lookup, create a new request, or consume quota. `Compare extensions` can reopen the board from the restored overview.

The overview and comparison controls retain the original member ID in their component state, and every component request rechecks that ID server-side so another Discord member cannot operate them.

## Data and Service Boundaries

The stored query result remains the single source for returning to the overview. The domain service gains an owned-result read operation that accepts `requestId` and `discordUserId` and returns the completed stored outcome only when ownership matches.

The interaction layer passes the caller's user and role context to search, comparison, and overview operations. The service, not the message renderer, decides whether fixture commerce is visible and whether comparison is allowed. Renderers receive an explicit view model and do not infer permissions.

Daily quota is reserved only by a new `/domain` search. Comparison, sorting, pagination, and returning to the overview are reads against the existing request and never affect usage.

## Failure and Safety Behaviour

- Missing RDAP or WHOIS record: show `No registry record found`; do not claim the domain is available.
- Registry provider failure: show `Registry status unavailable` and any independently successful DNS or certificate facts.
- RayName API failure in live mode: show a commerce unavailable response; do not use fixtures.
- Expired, missing, or foreign request: show the existing safe ownership/expiry message.
- Non-tester requesting a fixture comparison through a stale or crafted control: reject privately without querying fixture prices.
- Back navigation failure: keep the current card and show a private safe error rather than replacing it with guessed content.

## Configuration

Add a validated internal-tester role allow-list for the Preview environment. Existing admin Discord user IDs are also treated as testers. Test-data mode remains restricted to internal Vercel Preview deployments.

No role names are hard-coded, and no Discord Administrator permission is granted to the bot.

## Verification

Automated coverage must prove:

- a normal member in fixture mode never receives fixture price, availability, premium, comparison, or fake pricing-time copy;
- the same member can see successful RDAP/WHOIS, DNS, and certificate facts with source labels;
- a tester still receives the fully labelled fixture overview and comparison board;
- a crafted comparison request from a non-tester is rejected server-side;
- `Compare extensions → Next → Domain overview → Compare extensions` works for the owner;
- comparison and back navigation do not increment daily usage;
- live mode never falls back to fixtures when the commerce provider fails;
- existing one-query and three-query tiers remain unchanged.

Discord verification uses a newly generated `/domain` response because Discord cannot rewrite component IDs already stored in old ephemeral cards.

## Rollout

1. Deploy to the fixed Vercel Preview branch with test-data mode enabled.
2. Configure internal tester role IDs.
3. Test once as a normal member: only live public intelligence and the RayName link are visible.
4. Test once as an internal tester: fixture commerce, comparison, pagination, and back navigation are visible and functional.
5. Keep production commerce disabled until RayName provides the authenticated commerce API endpoint and response contract.

## Out of Scope

- inventing, scraping, or importing third-party registrar prices;
- declaring a domain purchasable from RDAP or WHOIS absence alone;
- changing the one-per-day and three-per-day quota policy;
- changing Discord verification or VIP access;
- enabling the feature in production before the RayName commerce API is ready.
