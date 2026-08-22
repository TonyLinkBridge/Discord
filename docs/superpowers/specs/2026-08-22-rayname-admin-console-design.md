# RayName Admin Console Design Specification

**Date:** 2026-08-22  
**Status:** Approved visual direction; implementation pending specification review  
**Primary operator:** One RayName marketing operator  
**Deployment target:** Vercel  

## 1. Objective

Build a modern operations console for RayName's English-language Discord community. The console exists to turn community activity into measurable business outcomes: new RayName registrations, domain transfers, renewals, verified customers, and qualified VIP relationships.

The product must help one operator answer three questions immediately:

1. Is the community and conversion funnel healthy?
2. Who or what needs attention today?
3. Which campaign, offer, or source is producing revenue?

This specification covers the web admin console. The Discord bot, Discord server configuration, and future RayName Marketing API are connected systems, but their implementation will be specified separately. The console must expose stable adapter boundaries so those systems can be connected without redesigning the UI.

## 2. Approved Visual Baselines

The approved design system is **RayName Precision**, inspired by the clarity of financial SaaS dashboards and the calm hierarchy of modern productivity tools.

- Light theme reference: [`docs/design/references/rayname-admin-light.png`](../../design/references/rayname-admin-light.png)
- Dark theme reference: [`docs/design/references/rayname-admin-dark.png`](../../design/references/rayname-admin-dark.png)

The references are authoritative for layout, density, typography hierarchy, spacing, component proportions, chart placement, and overall visual tone. The implementation must use real UI components and icons rather than embedding the reference screenshots.

### 2.1 Theme relationship

Light and dark are two token sets for the same interface. Switching theme must not change:

- information architecture;
- component size or position;
- chart geometry;
- table columns;
- available actions;
- spacing or density.

Light uses warm white and cool-gray surfaces, near-black text, restrained violet accents, and subtle separators. Dark uses graphite and charcoal surfaces, crisp off-white text, restrained electric violet and cool cyan accents, and green system-health states. Neither theme uses glassmorphism, neon bloom, heavy gradients, oversized rounded cards, or decorative imagery.

### 2.2 Theme behavior

The theme control supports `light`, `dark`, and `system`.

- First visit defaults to `system`.
- A manual choice is saved locally and restored on later visits.
- The document theme is applied before first paint to avoid a light/dark flash.
- The control is keyboard accessible and exposes its current state to assistive technology.

## 3. Product Scope

### 3.1 Navigation

The persistent sidebar contains these destinations in this order:

1. Overview
2. Community
3. Members
4. Leads
5. Campaigns
6. Offers
7. Content
8. Bot & Automations
9. Analytics
10. Settings

The sidebar also shows the RayName Admin brand, current workspace, system status, and operator identity. It collapses to an icon rail on narrower desktop widths.

### 3.2 Global controls

Every route shares a top command bar containing:

- page title;
- global search for members, Discord handles, domains, leads, and campaigns;
- date-range selector;
- system-health summary;
- theme selector;
- notifications;
- operator menu.

Global search opens a keyboard-navigable command panel and groups results by entity type. Date range affects metrics, charts, and tables on analytical routes.

## 4. Overview Screen

The Overview screen is the default route and must match the approved references most closely.

### 4.1 KPI strip

Show six primary metrics with the selected period, comparison period, value, delta, and trend direction:

- Discord Members;
- Verified Customers;
- Registrations;
- Transfers;
- Renewal Rate;
- Attributed Revenue.

The corrected sample values are 1,248 members, 326 verified customers, 168 registrations, 39 transfers, 91.4% renewal rate, and USD 18,420 attributed revenue. Registrations, transfers, and attributed revenue are selected-period flows derived from dated facts; members, verified customers, and renewal rate are latest available snapshots when the seed has no period history.

### 4.2 Conversion performance

The main visualization shows daily performance for the selected period. Tabs switch between Registrations, Transfers, and Renewals without navigating away. The chart provides accessible labels and a tabular fallback for screen readers.

### 4.3 Today's priorities

The action queue ranks operational work by urgency and value. Initial action types are:

- verify new members;
- follow up with high-intent leads;
- promote an active transfer offer;
- contact customers with at-risk renewals;
- review potential VIP candidates.

Each item has one primary action. Completing or dismissing an item updates the visible state immediately and records an activity event through the data adapter.

### 4.4 Conversion funnel

Show Discord Visitors, Verified Customers, and Paid Customers with counts and step conversion rates. This seed has no dated funnel-stage facts, so the funnel is visibly disclosed as a modeled estimate derived from the selected range's registration-activity ratio. Show the seeded Aug 9–15 comparison only for the Aug 16–22 baseline; do not claim a period comparison for other ranges. The funnel is a compact visual summary, not the sole representation of the data.

### 4.5 High-intent leads

Show a compact table with Name, Segment, Intent, Last Activity, and Next Action. Initial segments are Investor, Flipper, Startup, Builder, and Beginner. Actions include Message, Follow Up, Send Offer, Review VIP, and Mark Converted.

### 4.6 Campaign performance

Show Campaign, Visitors, Conversions, Conversion Rate, Revenue, and Status. The initial sample campaigns are `.com Transfer Week`, `New Member Welcome`, `Investor Outreach`, and `Renewal Reminder`.

## 5. Supporting Routes

### 5.1 Community

Show Discord member growth, active-member trend, role distribution, channel activity, new-member onboarding completion, and community-to-customer conversion. Provide quick links to the Discord server and member list.

### 5.2 Members

Provide a searchable and filterable member table with Discord identity, RayName verification state, audience segment, assigned roles, registration source, customer status, VIP signal, last activity, and owner notes.

Allowed actions are manual verification, role assignment, VIP review, opening a private support ticket, adding an internal note, and copying a tracked RayName link. The console must never store RayName passwords, payment details, or complete domain portfolios.

### 5.3 Leads

Provide both table and pipeline views. Stages are New, Engaged, High Intent, Offer Sent, Converted, and Closed. Each lead includes source, campaign, segment, portfolio-size band, stated intent, last activity, next action, follow-up date, and attributed value.

### 5.4 Campaigns

Manage campaigns and tracked RayName URLs. Each campaign includes name, objective, audience, channel, destination URL, generated tracking parameters, start and end dates, status, clicks, verified customers, conversions, and attributed revenue.

The console generates links but does not claim a conversion until the adapter provides an attributable event or the operator records it manually.

### 5.5 Offers

Manage active, scheduled, expired, and draft offers. An offer includes title, short description, eligible audience, destination, validity period, CTA label, campaign association, Discord publishing status, and performance summary.

### 5.6 Content

Provide a lightweight content calendar for the six RayName Domain Intelligence formats: Market Pulse, Domain 101, Name Battle, Domain Breakdown, Risk Check, and Brand Launch.

The calendar supports the agreed 4:2:1 publishing mix over each seven-post cycle: four educational posts, two soft conversion posts, and one direct offer. Each post has exactly one CTA.

### 5.7 Bot & Automations

Show Discord interaction health, Vercel deployment health, database health, RayName API connection state, recent bot commands, scheduled jobs, failures, and renewal-reminder runs.

Before RayName Marketing API access is available, the API state reads `Awaiting access`. Bot features that require that API are disabled with an explanation; tracked links, manual verification, offers, leads, and operator-entered conversions remain usable.

### 5.8 Analytics

Show the full conversion funnel, revenue by source, campaign attribution, conversion by audience segment, registration/transfer/renewal trends, lead velocity, offer performance, and retention. Every chart shares the global date range and can expose its underlying rows. Label the dated trend and campaign attribution as exact dated facts. Label funnel, revenue-by-source, segment, lead-velocity, and offer values as modeled estimates derived from selected-range activity or revenue ratios. Label retention as the latest available snapshot and state that it is not a selected-period fact.

### 5.9 Settings

Provide workspace profile, Discord configuration, operator allowlist, RayName API connection placeholder, tracking defaults, notification preferences, data-retention settings, and theme preference.

Secrets are configured only through deployment environment variables. The UI may show whether a secret is configured but must never reveal its value.

## 6. Data and Integration Architecture

The frontend consumes a typed `AdminDataProvider` interface instead of calling Discord or RayName services directly.

The provider exposes the following capabilities:

- read overview metrics, trends, priorities, leads, campaigns, and system health;
- search members, domains, leads, and campaigns;
- update a priority state;
- update lead stage and next action;
- create tracked campaign links;
- record manual verification and manual conversion events;
- read and update offers and content entries.

The first implementation uses deterministic seed data through a local provider so the approved interface can be built and tested before external credentials exist. A database-backed provider and a future `RayNameMarketingProvider` implement the same domain types.

The future RayName adapter is expected to support customer verification, domain availability, TLD pricing, current offers, customer status, VIP eligibility, and renewal events. Missing Marketing API access must never block the console from starting.

## 7. Authentication and Security

The production console is private. Authentication uses Discord OAuth and an environment-configured allowlist of Discord user IDs. Local development may use an explicit development-only operator identity.

- Unauthenticated production requests are redirected to sign-in.
- Authenticated but unapproved Discord identities receive an access-denied state.
- All write operations are validated server-side.
- Secrets and provider credentials remain server-only.
- Activity records identify the operator and timestamp.
- Only the minimum Discord and customer metadata required for operations is retained.

## 8. Responsive and Accessibility Requirements

The primary design target is 1440 × 1024. The console must remain fully usable from 1024 CSS pixels upward.

- At widths below 1180 pixels, the sidebar collapses and bottom dashboard sections stack.
- Data tables use horizontal scrolling only when columns cannot be responsibly reduced.
- Text maintains WCAG AA contrast in both themes.
- Every interactive control has visible focus state and keyboard behavior.
- Charts do not rely on color alone and expose text summaries.
- Reduced-motion preference disables nonessential transitions.

Mobile administration is not part of this implementation. Small screens may display a message directing the operator to use a desktop or tablet-sized viewport.

## 9. Technical Direction

Use Next.js with TypeScript and the App Router, deployed on Vercel. Use CSS custom properties for semantic design tokens, a mature React icon package, and a charting library that supports responsive SVG charts and accessible labeling. Use Vitest and Testing Library for domain and component behavior, and Playwright-compatible browser checks for the primary operator journey.

The database-backed phase uses Neon Postgres and Drizzle. The UI and local provider must not require database credentials. External integrations are server-side adapters behind route handlers or server actions.

## 10. Core Operator Journey

The required end-to-end journey is:

1. Open Overview and identify an elevated registration trend.
2. Inspect Today's Priorities.
3. Open the high-intent lead queue.
4. Filter leads by segment and intent.
5. Open a lead, select the next action, and mark follow-up complete.
6. Copy or create a tracked RayName registration link.
7. Return to Overview and see the priority and activity state updated.
8. Switch between Light and Dark without losing route, filters, or data state.

## 11. Acceptance Criteria

The admin console is acceptable when:

- the Overview screen visually matches the approved Light and Dark references at 1440 × 1024;
- Light, Dark, and System themes switch without layout movement or first-paint flashing;
- navigation, global search, date range, chart tabs, priorities, lead actions, and theme controls work with deterministic seed data;
- every supporting route listed in this specification exists and presents its required operational content;
- the core operator journey works from start to finish;
- the app starts without Discord, database, or RayName Marketing API credentials in local provider mode;
- production authentication fails closed when credentials or an operator allowlist are absent;
- automated tests cover theme preference, provider behavior, priority updates, lead actions, tracked-link generation, and access control;
- visual comparison at the approved viewport has no unresolved P0, P1, or P2 design issues;
- the repository contains a passing `design-qa.md` before the implementation is handed off.

## 12. Explicit Non-Goals

This implementation does not include:

- configuring or administering the Discord server itself;
- implementing Discord bot commands or Discord HTTP Interactions;
- live RayName customer verification, availability, pricing, or renewal data before Marketing API access is granted;
- domain auction, drop-catching, backorder, or marketplace functionality;
- public multi-tenant accounts;
- a customer-facing RayName portal;
- mobile-first administration;
- storing passwords, payment data, or complete customer portfolios.
