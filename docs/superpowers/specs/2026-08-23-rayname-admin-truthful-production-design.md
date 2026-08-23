# RayName Admin Truthful Production Data Design

**Date:** 2026-08-23

**Status:** Implemented

**Scope:** Remove production seed data and non-operational controls from the existing RayName Admin console while keeping the current visual system and authenticated shell.

## Context

The deployed console currently creates `createLocalAdminDataProvider()` inside the production admin layout. That provider clones a deterministic seed containing members, leads, campaigns, offers, content, analytics, priorities, service health, notifications, and workspace settings. Mutations update only the client-side provider state and reset after a fresh page load.

The UI therefore presents sample values and temporary actions as if they were live operations. A production audit also confirmed a `/priorities` link that returns 404, hard-coded notification and operator UI, and healthy integration states that are not backed by live checks.

RayName Marketing API access, a persistent application database, and Discord bot/API integration are not available yet. The production console must represent that state honestly.

## Goals

1. Remove all sample business data from the production runtime and production bundle.
2. Prevent any control from implying that it changed Discord or RayName when no live integration exists.
3. Preserve the approved RayName Precision visual system, navigation, OAuth access control, and theme switching.
4. Give operators clear empty and unavailable states that explain what must be connected next.
5. Keep deterministic fixtures for automated tests without exposing them to production code.
6. Create an explicit provider boundary that can accept the future RayName Marketing API, Discord bot, and database implementations.

## Non-goals

- Building the RayName Marketing API integration before credentials and documentation are supplied.
- Building a Discord bot or syncing Discord server members in this change.
- Adding a production database.
- Replacing the current design system or restructuring navigation for aesthetic reasons.
- Preserving a public or production-facing demo mode.

## Considered Approaches

### A. Honest unavailable mode — selected

Production loads an unavailable provider that returns no business records, publishes explicit capability status, and rejects every business mutation. Pages retain their structure but show honest empty states. Sample data moves under test-only support.

This is the safest option because the console remains usable for authentication and visual inspection without suggesting that any business system is connected.

### B. Hide every business route until integrations exist

This is simpler but gives operators no view of the intended product and no guidance about what is missing. It would also require another large navigation redesign when integrations arrive.

### C. Keep a clearly labelled demo mode in production

This preserves the current showcase, but it conflicts with the requirement to remove all fake production data and still creates a risk that operators mistake demo mutations for live work.

## Architecture

### Runtime provider boundary

The production admin shell will use a renamed `RuntimeAdminDataProvider`. It will instantiate only a new unavailable provider until a live adapter exists. Production code will no longer import `seed.ts` or `local-provider.ts`.

The provider contract will expose a read-only capability snapshot in addition to page data:

- `dataMode`: `unavailable` or `live`
- integrations: Discord bot, persistent database, RayName Marketing API, deployment monitoring
- capabilities: read members, read analytics, mutate members, create tracked links, manage campaigns, manage offers, schedule content, view notifications
- a short user-facing reason for every unavailable capability

The unavailable provider will:

- return structurally valid empty collections and null metrics;
- report integrations as `not-connected`, `awaiting-access`, or `unknown` rather than healthy;
- reject every mutation with a typed `IntegrationUnavailableError`;
- never synthesize activity, dates, revenue, status, or success responses.

Metric labels and page section names remain static presentation metadata. Their values come only from the provider; when unavailable, the UI renders an em dash and the integration explanation. This preserves orientation without inventing numbers.

`DATA_MODE` will default to `unavailable`. No environment value may activate sample data in a production build. A future `live` value will only be accepted when a real provider exists; until then it will fail closed to unavailable mode with a safe setup message.

### Test fixtures

The current deterministic seed and mutable local provider will move to test-only support. Runtime modules must not import them. Tests can continue to use fixtures to exercise filters, charts, dialogs, and mutation state machines.

A boundary test will fail if production app or component modules import the fixture provider or seed.

### Honest page states

Every business route will handle unavailable data consistently:

- **Overview:** metric values render as em dashes; charts, priorities, funnel, leads, and campaigns show one shared integration-empty state instead of sample content.
- **Community and Members:** no invented users, roles, growth, or activity. The directory explains that Discord member sync is not connected.
- **Leads:** no invented leads or intent scoring. Lead actions are absent.
- **Campaigns and Offers:** no sample campaigns or offers. Creation forms are disabled or replaced by an unavailable message because there is no durable store or publishing integration.
- **Content:** no fabricated schedule. Scheduling and replacement actions are unavailable until persistence and Discord publishing exist.
- **Bot & Automations:** Discord interactions, deployment monitoring, and database status show their real unconnected or unknown state. Marketing API remains awaiting access. Manual verification and tracked-link actions are unavailable.
- **Analytics:** no modeled or seeded charts. The page explains that reporting requires dated provider events.
- **Settings:** show only safe configuration facts that can be derived from server environment and authentication state. Never expose secret values.

Shared empty-state copy will use plain language such as “Data source not connected” and “Available after the RayName Marketing API is connected.”

### Legitimate shell controls

The shell will retain only controls with real behavior:

- navigation links to existing routes;
- theme switching;
- Discord OAuth access control;
- a real sign-out action;
- external links with verified destinations.

The shell will change as follows:

- remove the hard-coded notification count and notification button until a notification provider exists;
- replace “All systems operational” with provider-derived setup status;
- replace the hard-coded operator name and initial with the authenticated Discord session profile;
- remove “Account settings” until a real route or action exists;
- wire “Sign out” to NextAuth and return to `/sign-in`;
- remove the broken `/priorities` link;
- disable the date-range control when reporting data is unavailable and provide an accessible explanation;
- keep global search available only when at least one searchable data capability is connected; otherwise show a clear unavailable state.

The server layout will derive a safe actor summary (`id`, display name, and image URL) from the NextAuth Discord session and pass it to the shell. It will also pass safe runtime configuration facts to the provider. Secret values never cross the server boundary.

### Mutation safety

Authorization remains mandatory, but authorization alone must never imply that a backing service exists. Every mutation follows this order:

1. validate the command;
2. require the authenticated and allowlisted Discord actor;
3. verify that the provider advertises the required capability;
4. execute against a live durable provider;
5. report success only after the provider confirms the operation.

In unavailable mode, step 3 always stops the operation. The UI will normally hide or disable the control, while the provider rejection remains a defensive boundary.

## Error and Loading Behavior

- Unavailable integrations are a stable product state, not an error alert.
- Unexpected provider failures use the existing alert and retry patterns.
- Loading states never temporarily display seed values.
- Empty results from a connected provider are distinguished from an unconnected provider.
- Disabled controls include an accessible reason; controls with no near-term value are removed entirely.

## Testing Strategy

### Unit and integration tests

- production runtime selects the unavailable provider and does not import test fixtures;
- every production data reader returns empty or null values without sample records;
- every unavailable mutation rejects without changing state;
- all page routes render their correct unavailable state;
- no hard-coded member names, business metrics, notification counts, health claims, or 2026 snapshot dates appear in production renders;
- operator UI uses session profile data and sign-out calls NextAuth;
- the `/priorities` link and other unresolved actions are absent;
- enabled buttons have an asserted behavior; unavailable operations are disabled with a reason or not rendered.

### Browser tests

- authenticated production-like journey across all admin routes;
- no seeded names or seeded metric values appear;
- no enabled action ends in a no-op or 404;
- sign-out works;
- theme, keyboard, responsive, accessibility, and console-error checks remain green;
- visible unconnected states pass WCAG AA in light and dark themes.

### Quality gates

Run the focused tests twice, then the full unit suite, Playwright suite, TypeScript, lint, production build, and diff checks before declaring completion.

## Migration and Deployment

1. Add capability and unavailable-provider contracts with failing tests.
2. Move sample state and the local mutable provider into test-only support.
3. Switch the production layout to `RuntimeAdminDataProvider` in unavailable mode.
4. Convert every route to honest empty or unavailable states.
5. replace hard-coded shell identity, status, notifications, and unresolved actions.
6. update `.env.example` and operating documentation.
7. verify locally with production-like environment values.
8. push the completed commit to GitHub and let Vercel redeploy.
9. confirm the deployed OAuth guard, unavailable states, sign-out flow, and absence of sample values.

The Vercel project should use `DATA_MODE=unavailable` until a live provider is implemented. Existing `DATA_MODE=local` must not enable local data in production.

## Acceptance Criteria

- No sample member, lead, campaign, offer, content, analytics, priority, notification, revenue, or health data is visible on the deployed console.
- No sample business data module is reachable from the production runtime dependency graph.
- No enabled production control performs an in-memory-only mutation or a no-op.
- No admin navigation or action leads to 404.
- The UI clearly distinguishes unconnected, connected-empty, loading, and failed states.
- Discord OAuth access remains fail-closed and the operator can sign out.
- The visual system and responsive behavior remain consistent with the approved dashboard.
- All automated quality gates pass before deployment.
