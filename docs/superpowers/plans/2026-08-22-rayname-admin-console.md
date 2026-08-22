# RayName Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete RayName Admin web console with matched Light and Dark RayName Precision themes, deterministic local data, working operator actions, private production access, and all approved operational routes.

**Architecture:** A Next.js App Router application renders a shared desktop admin shell and route-level feature modules. UI code consumes a typed `AdminDataProvider`; the first provider uses deterministic in-memory seed data so the complete console works before Discord, Neon, or RayName Marketing API credentials exist. Theme, navigation, search, actions, and analytical views are functional client experiences, while authentication and future external providers remain server-side boundaries.

**Tech Stack:** Node.js 24, npm, Next.js App Router, React, TypeScript, CSS Modules plus semantic CSS custom properties, next-themes, React Aria Components, Phosphor Icons, Recharts, Auth.js/next-auth with Discord OAuth, Zod, Vitest, Testing Library, axe-core, and Playwright.

**Spec:** `docs/superpowers/specs/2026-08-22-rayname-admin-console-design.md`

## Global Constraints

- Primary visual target is exactly 1440 × 1024 using `docs/design/references/rayname-admin-light.png` and `docs/design/references/rayname-admin-dark.png`.
- RayName Precision is one component system with `light`, `dark`, and `system` theme modes; theme switching must never change layout geometry.
- The application must remain usable from 1024 CSS pixels upward and collapse the sidebar below 1180 pixels.
- Local provider mode must start without Discord, database, or RayName Marketing API credentials.
- Production authentication must fail closed when Discord credentials or `ADMIN_DISCORD_USER_IDS` are absent.
- Do not store RayName passwords, payment data, or complete customer domain portfolios.
- Use `@phosphor-icons/react` for UI icons; do not create custom SVG, CSS-drawn, emoji, or text-glyph icons.
- Use semantic CSS tokens and WCAG AA contrast in both themes.
- Follow strict TDD for every behavior: write one failing test, verify the intended failure, implement the minimum, and rerun the focused test before the full suite.
- The user-approved Next.js/Vercel architecture overrides the Product Design plugin's default Vite/Sites prototype bootstrap.

---

## Planned File Structure

```text
src/
  app/
    (admin)/
      layout.tsx                  # authenticated admin shell boundary
      page.tsx                    # Overview route
      community/page.tsx
      members/page.tsx
      leads/page.tsx
      campaigns/page.tsx
      offers/page.tsx
      content/page.tsx
      bot-automations/page.tsx
      analytics/page.tsx
      settings/page.tsx
    api/auth/[...nextauth]/route.ts
    access-denied/page.tsx
    sign-in/page.tsx
    layout.tsx                    # document, fonts, theme bootstrap
    globals.css                   # reset and semantic light/dark tokens
  components/
    admin-shell/                  # sidebar, command bar, global search
    charts/                       # accessible chart wrappers
    theme/                        # Light/Dark/System provider and selector
    ui/                           # button, badge, table, menu, tabs, panel
  features/
    analytics/
    auth/
    campaigns/
    community/
    content/
    leads/
    members/
    offers/
    overview/
    settings/
    system-health/
  lib/
    admin-data/
      types.ts                    # shared domain contracts
      seed.ts                     # deterministic Aug 2026 fixture
      provider.ts                 # AdminDataProvider interface
      local-provider.ts           # in-memory implementation
      context.tsx                 # React provider and mutation refresh
    auth.ts                       # Auth.js configuration
    format.ts                     # date, percent, currency helpers
    tracking.ts                   # tracked-link construction
  test/
    render.tsx                    # real provider/theme test wrapper
    setup.ts
e2e/
  operator-journey.spec.ts
  responsive.spec.ts
public/
  brand/                          # approved source-owned brand assets only
design-qa.md
```

Files remain feature-focused; no route page should contain domain fixtures, provider mutations, or global shell implementation.

---

### Task 1: Bootstrap the Next.js Application and Test Harness

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/(admin)/page.tsx`
- Test: `src/app/(admin)/page.test.tsx`

**Interfaces:**
- Produces: working `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, and `npm test` commands.
- Produces: a minimal root route that later tasks replace incrementally.

- [ ] **Step 1: Create the package manifest and install locked dependencies**

Run:

```bash
npm init -y
npm install next@latest react@latest react-dom@latest next-themes react-aria-components @phosphor-icons/react recharts next-auth zod
npm install --save-dev typescript @types/node @types/react @types/react-dom eslint eslint-config-next vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @axe-core/playwright
```

Set these scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Configure TypeScript, Next.js, ESLint, jsdom, and Testing Library**

Configure `vitest.config.ts` with the `@` alias mapped to `src`, `environment: "jsdom"`, and setup file `src/test/setup.ts`. Import `@testing-library/jest-dom/vitest` in the setup file. Keep `next.config.ts` free of deployment-specific hostnames.

- [ ] **Step 3: Write the failing root-route test**

```tsx
import { render, screen } from "@testing-library/react";
import OverviewPage from "./page";

test("shows the RayName admin entry point", () => {
  render(<OverviewPage />);
  expect(screen.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(screen.getByText("RayName Admin")).toBeVisible();
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm test -- 'src/app/(admin)/page.test.tsx'`  
Expected: FAIL because the Overview page and RayName Admin entry point do not exist.

- [ ] **Step 5: Add the minimal document and route implementation**

Create a root layout that imports `globals.css`, loads Geist Sans and Geist Mono through `next/font/google`, sets English metadata, and renders children. Create the Overview route with one visible `h1` and a `RayName Admin` label only; visual shell work belongs to later tasks.

- [ ] **Step 6: Verify GREEN and the project gates**

Run:

```bash
npm test -- 'src/app/(admin)/page.test.tsx'
npm run typecheck
npm run lint
npm run build
```

Expected: all four commands succeed without warnings from project code.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs vitest.config.ts src
git commit -m "build: bootstrap RayName admin console"
```

---

### Task 2: Define Domain Contracts, Seed Data, and the Local Provider

**Files:**
- Create: `src/lib/admin-data/types.ts`
- Create: `src/lib/admin-data/seed.ts`
- Create: `src/lib/admin-data/provider.ts`
- Create: `src/lib/admin-data/local-provider.ts`
- Test: `src/lib/admin-data/local-provider.test.ts`
- Create: `src/lib/tracking.ts`
- Test: `src/lib/tracking.test.ts`

**Interfaces:**
- Produces: `AdminDataProvider`, `OverviewSnapshot`, `AdminState`, `DateRange`, `LeadAction`, and `SearchResult`.
- Produces: `createLocalAdminDataProvider(seed?: AdminState): AdminDataProvider`.
- Produces: `buildTrackedRayNameUrl(input: TrackingInput): string`.

- [ ] **Step 1: Write failing tests for overview reads and state mutations**

```ts
test("returns the approved overview totals for Aug 16–22", async () => {
  const provider = createLocalAdminDataProvider();
  const overview = await provider.getOverview({ from: "2026-08-16", to: "2026-08-22" });
  expect(overview.metrics.map((metric) => metric.value)).toEqual([
    "1,248", "326", "168", "39", "91.4%", "$18,420"
  ]);
});

test("completing a priority removes it from the active queue and records activity", async () => {
  const provider = createLocalAdminDataProvider();
  await provider.completePriority("verify-new-members", "local-ray");
  const overview = await provider.getOverview({ from: "2026-08-16", to: "2026-08-22" });
  expect(overview.priorities.map((item) => item.id)).not.toContain("verify-new-members");
  expect((await provider.getActivity())[0]).toMatchObject({
    actorId: "local-ray",
    entityId: "verify-new-members",
    action: "priority.completed"
  });
});
```

- [ ] **Step 2: Run the provider test and verify RED**

Run: `npm test -- src/lib/admin-data/local-provider.test.ts`  
Expected: FAIL because the provider contract and local implementation are missing.

- [ ] **Step 3: Define exact domain types and provider signatures**

```ts
export type ThemeMode = "light" | "dark" | "system";
export type LeadStage = "new" | "engaged" | "high-intent" | "offer-sent" | "converted" | "closed";
export type LeadAction = "message" | "follow-up" | "send-offer" | "review-vip" | "mark-converted";
export type DateRange = { from: string; to: string };

export interface Metric { id: string; label: string; value: string; delta: number; deltaLabel: string }
export interface TrendPoint { date: string; registrations: number; transfers: number; renewals: number; revenue: number }
export interface Priority { id: string; title: string; detail: string; actionLabel: string; kind: string; completed: boolean }
export interface Lead { id: string; name: string; segment: string; intent: string; stage: LeadStage; lastActivity: string; nextAction: LeadAction; attributedValue: number }
export interface Member { id: string; discordHandle: string; verified: boolean; segment: string; roles: string[]; customerStatus: string; vipSignal: "none" | "candidate" | "vip"; lastActivity: string; notes: string[] }
export type MemberPatch = Partial<Pick<Member, "verified" | "segment" | "roles" | "customerStatus" | "vipSignal" | "notes">>;
export type MemberAction = "open-ticket" | "review-vip";
export interface TrackingInput { destination: string; campaign: string; source: string; medium: string; content: string }
export interface TrackedLink extends TrackingInput { id: string; url: string; createdAt: string }
export interface Campaign { id: string; name: string; objective: string; audience: string; channel: string; destination: string; startDate: string; endDate: string; status: string; visitors: number; conversions: number; revenue: number }
export type CampaignInput = Omit<Campaign, "id" | "visitors" | "conversions" | "revenue">;
export interface Offer { id: string; title: string; description: string; audience: string; destination: string; startsAt: string; endsAt: string; cta: string; campaignId: string; status: "draft" | "scheduled" | "active" | "expired" }
export type OfferPatch = Partial<Omit<Offer, "id">>;
export interface ContentEntry { id: string; title: string; format: "market-pulse" | "domain-101" | "name-battle" | "domain-breakdown" | "risk-check" | "brand-launch"; conversionLevel: "education" | "soft" | "direct"; publishAt: string; ctas: string[]; status: "draft" | "scheduled" | "published" }
export type ContentPatch = Partial<Omit<ContentEntry, "id">>;
export interface ActivityEvent { id: string; actorId: string; entityId: string; action: string; occurredAt: string }
export interface SearchResult { id: string; type: "Member" | "Lead" | "Domain" | "Campaign"; primary: string; secondary: string; href: string }
export interface OverviewSnapshot { metrics: Metric[]; trend: TrendPoint[]; priorities: Priority[]; leads: Lead[]; campaigns: Campaign[] }
export interface AdminState { overview: OverviewSnapshot; members: Member[]; leads: Lead[]; campaigns: Campaign[]; offers: Offer[]; content: ContentEntry[]; trackedLinks: TrackedLink[]; activity: ActivityEvent[] }

export interface AdminDataProvider {
  getState(): Promise<AdminState>;
  getOverview(range: DateRange): Promise<OverviewSnapshot>;
  getActivity(): Promise<ActivityEvent[]>;
  search(query: string): Promise<SearchResult[]>;
  completePriority(priorityId: string, actorId: string): Promise<void>;
  updateLeadAction(leadId: string, action: LeadAction, actorId: string): Promise<void>;
  updateMember(memberId: string, patch: MemberPatch, actorId: string): Promise<Member>;
  recordMemberAction(memberId: string, action: MemberAction, actorId: string): Promise<void>;
  createTrackedLink(input: TrackingInput, actorId: string): Promise<TrackedLink>;
  createCampaign(input: CampaignInput, actorId: string): Promise<Campaign>;
  updateOffer(offerId: string, patch: OfferPatch, actorId: string): Promise<Offer>;
  updateContentEntry(entryId: string, patch: ContentPatch, actorId: string): Promise<ContentEntry>;
}
```

Define all referenced interfaces in `types.ts`; do not use `any` or untyped record bags.

- [ ] **Step 4: Implement deterministic seed data and clone-on-read provider behavior**

Use the corrected Aug 16–22, 2026 values, deriving flow totals from canonical dated facts while labeling stock/rate values with their available snapshot precision. Return cloned arrays and objects so UI code cannot mutate provider state accidentally. Throw a typed `EntityNotFoundError` for invalid priority, member, lead, campaign, offer, tracked-link, and content IDs.

- [ ] **Step 5: Verify provider GREEN**

Run: `npm test -- src/lib/admin-data/local-provider.test.ts`  
Expected: PASS, including invalid-ID and empty-search cases.

- [ ] **Step 6: Write the failing tracked-link test**

```ts
test("builds a stable RayName registration URL with campaign attribution", () => {
  expect(buildTrackedRayNameUrl({
    destination: "https://www.rayname.com/domain/search",
    campaign: "com-transfer-week",
    source: "discord",
    medium: "community",
    content: "priority-card"
  })).toBe("https://www.rayname.com/domain/search?utm_campaign=com-transfer-week&utm_content=priority-card&utm_medium=community&utm_source=discord");
});
```

- [ ] **Step 7: Run RED, implement URL validation and stable parameter ordering, then run GREEN**

Run twice: `npm test -- src/lib/tracking.test.ts`  
First expected result: FAIL because `buildTrackedRayNameUrl` is missing.  
Second expected result: PASS after rejecting non-HTTPS or non-RayName destinations and serializing parameters in alphabetical key order.

- [ ] **Step 8: Run the full unit suite and commit**

```bash
npm test
git add src/lib/admin-data src/lib/tracking.ts src/lib/tracking.test.ts
git commit -m "feat: add local admin data provider"
```

---

### Task 3: Implement RayName Precision Tokens and Theme Behavior

**Files:**
- Create: `src/components/theme/theme-provider.tsx`
- Create: `src/components/theme/theme-selector.tsx`
- Create: `src/components/theme/theme-selector.module.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/theme/theme-selector.test.tsx`

**Interfaces:**
- Produces: `RayNameThemeProvider({ children })`.
- Produces: `ThemeSelector()` supporting `light`, `dark`, and `system`.
- Consumes: `ThemeMode` from Task 2.

- [ ] **Step 1: Write a failing interaction test**

```tsx
test("selects dark mode and preserves the three-mode contract", async () => {
  const user = userEvent.setup();
  renderWithTheme(<ThemeSelector />);
  await user.click(screen.getByRole("button", { name: /theme/i }));
  expect(screen.getByRole("menuitemradio", { name: "System" })).toBeVisible();
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem("rayname-theme")).toBe("dark");
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/components/theme/theme-selector.test.tsx`  
Expected: FAIL because no theme provider or selector exists.

- [ ] **Step 3: Define semantic tokens for both approved themes**

Use tokens including `--bg-canvas`, `--bg-sidebar`, `--bg-panel`, `--bg-subtle`, `--text-primary`, `--text-secondary`, `--border-subtle`, `--accent`, `--accent-muted`, `--positive`, `--warning`, `--critical`, `--chart-1`, `--chart-2`, `--chart-3`, `--shadow-panel`, `--radius-sm`, and `--radius-md`. Match colors by visually sampling the approved references during design QA rather than introducing a third palette.

Start from these reference-derived values and adjust only through recorded visual QA:

```css
:root {
  --bg-canvas: #f8f9fb;
  --bg-sidebar: #fbfbfc;
  --bg-panel: #ffffff;
  --bg-subtle: #f4f5f8;
  --text-primary: #12141a;
  --text-secondary: #687080;
  --border-subtle: #e4e7ee;
  --accent: #6f4cff;
  --accent-muted: #f0ecff;
  --positive: #20a65a;
  --warning: #e98b0c;
  --critical: #e54855;
  --chart-1: #6f4cff;
  --chart-2: #299fe5;
  --chart-3: #2dbd68;
  --shadow-panel: 0 1px 2px rgb(18 20 26 / 5%);
  --radius-sm: 6px;
  --radius-md: 9px;
}

.dark {
  --bg-canvas: #071018;
  --bg-sidebar: #08111b;
  --bg-panel: #0a151f;
  --bg-subtle: #0f1c27;
  --text-primary: #f3f5f8;
  --text-secondary: #a3adba;
  --border-subtle: #22313e;
  --accent: #8b5cf6;
  --accent-muted: #21173c;
  --positive: #46d17d;
  --warning: #f2a51a;
  --critical: #ff5d6c;
  --chart-1: #8b5cf6;
  --chart-2: #38bdf8;
  --chart-3: #49d17f;
  --shadow-panel: 0 1px 2px rgb(0 0 0 / 28%);
}
```

- [ ] **Step 4: Implement provider and accessible selector**

Wrap `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `storageKey="rayname-theme"`, and `disableTransitionOnChange`. Use React Aria menu radio items and Phosphor `Sun`, `Moon`, and `Desktop` icons.

- [ ] **Step 5: Verify GREEN and no hydration warning**

Run:

```bash
npm test -- src/components/theme/theme-selector.test.tsx
npm run typecheck
npm run build
```

Expected: all pass; build output contains no hydration mismatch from the theme control.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components/theme
git commit -m "feat: add RayName Precision themes"
```

---

### Task 4: Build the Shared Admin Shell, Navigation, and Global Search

**Files:**
- Create: `src/components/admin-shell/admin-shell.tsx`
- Create: `src/components/admin-shell/admin-shell.module.css`
- Create: `src/components/admin-shell/sidebar.tsx`
- Create: `src/components/admin-shell/command-bar.tsx`
- Create: `src/components/admin-shell/global-search.tsx`
- Create: `src/components/admin-shell/nav-items.ts`
- Create: `src/lib/admin-data/context.tsx`
- Create: `src/test/render.tsx`
- Create: `src/app/(admin)/layout.tsx`
- Test: `src/components/admin-shell/admin-shell.test.tsx`
- Test: `src/components/admin-shell/global-search.test.tsx`

**Interfaces:**
- Produces: `AdminShell({ children, title })` and `AdminDataContext`.
- Produces: `renderAdmin(ui, options?)` returning the Testing Library render result plus the real local `provider` used by the rendered tree.
- Consumes: `AdminDataProvider.search`, theme selector, and deterministic seed provider.

- [ ] **Step 1: Write failing navigation and command-search tests**

```tsx
test("renders the approved navigation in order", () => {
  renderAdmin(<div>Route content</div>);
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "Overview", "Community", "Members", "Leads", "Campaigns", "Offers",
    "Content", "Bot & Automations", "Analytics", "Settings"
  ]);
});

test("opens grouped search results from the keyboard", async () => {
  const user = userEvent.setup();
  renderAdmin(<div />);
  await user.keyboard("{Meta>}k{/Meta}");
  await user.type(screen.getByRole("searchbox"), "alex");
  expect(await screen.findByRole("option", { name: /Alex Chen.*Lead/i })).toBeVisible();
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/components/admin-shell`  
Expected: FAIL because the shell, links, context, and command search do not exist.

- [ ] **Step 3: Implement the desktop shell to reference geometry**

Use CSS Grid with a 196–216px sidebar at 1440px and a single content column. Place the command bar above route content. Use Phosphor's regular-weight navigation icons. At widths below 1180px, collapse navigation labels while keeping accessible names and tooltips.

- [ ] **Step 4: Implement real provider-backed global search**

Open search with `Meta+K` and `Control+K`, debounce only the display update by 100ms, group actual provider results by Member, Lead, Domain, and Campaign, support arrow-key movement, and close on Escape. Do not mock search results in the component.

- [ ] **Step 5: Verify GREEN, keyboard behavior, and accessibility**

Run:

```bash
npm test -- src/components/admin-shell
npm run typecheck
```

Expected: PASS with real local provider results and no inaccessible unnamed buttons.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin-shell src/lib/admin-data/context.tsx src/test/render.tsx 'src/app/(admin)/layout.tsx'
git commit -m "feat: build RayName admin shell"
```

---

### Task 5: Recreate the Read-Only Overview Dashboard

**Files:**
- Create: `src/features/overview/overview-screen.tsx`
- Create: `src/features/overview/overview-screen.module.css`
- Create: `src/features/overview/metric-strip.tsx`
- Create: `src/features/overview/conversion-performance.tsx`
- Create: `src/features/overview/conversion-funnel.tsx`
- Create: `src/features/overview/campaign-performance.tsx`
- Create: `src/components/charts/accessible-line-chart.tsx`
- Modify: `src/app/(admin)/page.tsx`
- Test: `src/features/overview/overview-screen.test.tsx`
- Test: `src/features/overview/conversion-performance.test.tsx`

**Interfaces:**
- Produces: `OverviewScreen()` matching both approved references.
- Consumes: `AdminDataContext.getOverview(range)` and shared `DateRange`.

- [ ] **Step 1: Write a failing approved-content test**

```tsx
test("shows all six approved metrics and the three lower summaries", async () => {
  renderAdmin(<OverviewScreen />);
  expect(await screen.findByText("Discord Members")).toBeVisible();
  expect(screen.getByText("$18,420")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Conversion performance" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Conversion funnel" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "High-intent leads" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Campaign performance" })).toBeVisible();
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/features/overview/overview-screen.test.tsx`  
Expected: FAIL because Overview sections are not implemented.

- [ ] **Step 3: Build the exact 1440px layout and real seed-data summaries**

Implement the KPI strip, 2:1 main grid, and three-column lower grid. Keep section order and proportions identical in both themes. Use lightweight separators and base surfaces; do not wrap every subsection in nested cards.

- [ ] **Step 4: Write a failing chart-tab behavior test**

```tsx
test("switches the accessible chart data from registrations to transfers", async () => {
  const user = userEvent.setup();
  renderAdmin(<ConversionPerformance />);
  expect(await screen.findByText("Registrations data table")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Transfers" }));
  expect(screen.getByText("Transfers data table")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "39" })).toBeVisible();
});
```

- [ ] **Step 5: Run RED, implement Recharts tabs and accessible fallback, then run GREEN**

Run twice: `npm test -- src/features/overview/conversion-performance.test.tsx`  
First expected result: FAIL on missing tab behavior.  
Second expected result: PASS after the visual chart and visually-hidden data table share the selected series.

- [ ] **Step 6: Run Overview tests in both themes**

Run: `npm test -- src/features/overview`  
Expected: PASS when the test wrapper sets either `light` or `dark`; DOM order and section count remain identical.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(admin)/page.tsx' src/features/overview src/components/charts
git commit -m "feat: recreate RayName overview dashboard"
```

---

### Task 6: Add Today's Priorities and High-Intent Lead Actions

**Files:**
- Create: `src/features/overview/todays-priorities.tsx`
- Create: `src/features/overview/high-intent-leads.tsx`
- Create: `src/components/ui/action-menu.tsx`
- Modify: `src/features/overview/overview-screen.tsx`
- Test: `src/features/overview/todays-priorities.test.tsx`
- Test: `src/features/overview/high-intent-leads.test.tsx`

**Interfaces:**
- Consumes: `completePriority(priorityId, actorId)` and `updateLeadAction(leadId, action, actorId)`.
- Produces: immediately updated queue and lead status without route reload.

- [ ] **Step 1: Write the failing priority-action test**

```tsx
test("completes a priority and removes it from today's queue", async () => {
  const user = userEvent.setup();
  renderAdmin(<TodaysPriorities />);
  expect(await screen.findByText("Verify 12 new members")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Review Verify 12 new members" }));
  await user.click(screen.getByRole("button", { name: "Mark complete" }));
  expect(screen.queryByText("Verify 12 new members")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Priority completed");
});
```

- [ ] **Step 2: Run RED, implement the real provider mutation, then run GREEN**

Run twice: `npm test -- src/features/overview/todays-priorities.test.tsx`  
Expected: missing action flow on RED; passing state mutation and success status on GREEN.

- [ ] **Step 3: Write the failing lead-action test**

```tsx
test("records Send Offer as the next action for Sarah K.", async () => {
  const user = userEvent.setup();
  renderAdmin(<HighIntentLeads />);
  await user.click(await screen.findByRole("button", { name: "Actions for Sarah K." }));
  await user.click(screen.getByRole("menuitem", { name: "Send offer" }));
  expect(screen.getByRole("status")).toHaveTextContent("Sarah K. updated");
  expect(screen.getByText("Offer sent")).toBeVisible();
});
```

- [ ] **Step 4: Run RED, implement the action menu and mutation, then run GREEN**

Run twice: `npm test -- src/features/overview/high-intent-leads.test.tsx`.

- [ ] **Step 5: Run full suite and commit**

```bash
npm test
git add src/features/overview src/components/ui/action-menu.tsx
git commit -m "feat: add overview operator actions"
```

---

### Task 7: Build Community and Members Operations

**Files:**
- Create: `src/app/(admin)/community/page.tsx`
- Create: `src/features/community/community-screen.tsx`
- Create: `src/app/(admin)/members/page.tsx`
- Create: `src/features/members/members-screen.tsx`
- Create: `src/features/members/member-detail.tsx`
- Create: `src/components/ui/data-table.tsx`
- Test: `src/features/community/community-screen.test.tsx`
- Test: `src/features/members/members-screen.test.tsx`

**Interfaces:**
- Consumes: seeded community metrics and member records from `AdminDataProvider.getState()`.
- Produces: filters by verification, segment, customer status, and VIP signal.
- Produces: member-detail actions for manual verification, role assignment, VIP review, internal note, ticket, and tracked link.

- [ ] **Step 1: Write failing Community content test**

```tsx
test("shows the community health and conversion sections", async () => {
  renderAdmin(<CommunityScreen />);
  expect(await screen.findByRole("heading", { name: "Member growth" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Role distribution" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Channel activity" })).toBeVisible();
  expect(screen.getByText("78% onboarding completion")).toBeVisible();
  expect(screen.getByText("13.5% community-to-customer conversion")).toBeVisible();
});
```

- [ ] **Step 2: Run RED, implement Community with accessible charts, then run GREEN**

Run twice: `npm test -- src/features/community/community-screen.test.tsx`.

- [ ] **Step 3: Write failing Members filter and verification test**

```tsx
test("filters unverified VIP signals and manually verifies one member", async () => {
  const user = userEvent.setup();
  renderAdmin(<MembersScreen />);
  await user.selectOptions(screen.getByLabelText("Verification"), "unverified");
  await user.selectOptions(screen.getByLabelText("VIP signal"), "candidate");
  expect(await screen.findByText("DomainNomad")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Open DomainNomad" }));
  await user.click(screen.getByRole("button", { name: "Verify customer" }));
  expect(screen.getByRole("status")).toHaveTextContent("Customer verified manually");
});
```

- [ ] **Step 4: Run RED, implement the table/detail flow and real mutation, then run GREEN**

Run twice: `npm test -- src/features/members/members-screen.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(admin)/community' 'src/app/(admin)/members' src/features/community src/features/members src/components/ui/data-table.tsx
git commit -m "feat: add community and member operations"
```

---

### Task 8: Build the Complete Lead Pipeline Journey

**Files:**
- Create: `src/app/(admin)/leads/page.tsx`
- Create: `src/features/leads/leads-screen.tsx`
- Create: `src/features/leads/lead-pipeline.tsx`
- Create: `src/features/leads/lead-table.tsx`
- Create: `src/features/leads/lead-detail.tsx`
- Test: `src/features/leads/leads-screen.test.tsx`
- Test: `src/features/leads/lead-detail.test.tsx`

**Interfaces:**
- Consumes: `LeadStage`, `LeadAction`, local provider mutations, and `createTrackedLink`.
- Produces: table/pipeline view state, segment/intent filters, follow-up completion, and copyable tracked URL.

- [ ] **Step 1: Write a failing pipeline-filter test**

```tsx
test("shows only high-intent investors after filtering", async () => {
  const user = userEvent.setup();
  renderAdmin(<LeadsScreen />);
  await user.selectOptions(screen.getByLabelText("Segment"), "investor");
  await user.selectOptions(screen.getByLabelText("Intent"), "very-high");
  expect(await screen.findByText("Alex Chen")).toBeVisible();
  expect(screen.queryByText("Web3Builder")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED, implement table/pipeline views and filters, then run GREEN**

Run twice: `npm test -- src/features/leads/leads-screen.test.tsx`.

- [ ] **Step 3: Write the failing core lead-journey test**

```tsx
test("completes Alex Chen follow-up and creates an attributed registration link", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<LeadsScreen />);
  await user.click(await screen.findByRole("button", { name: "Open Alex Chen" }));
  await user.selectOptions(screen.getByLabelText("Next action"), "follow-up");
  await user.click(screen.getByRole("button", { name: "Mark follow-up complete" }));
  await user.click(screen.getByRole("button", { name: "Create tracked link" }));
  expect(screen.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_medium=community/);
  expect((await provider.getActivity()).slice(0, 2).map((event) => event.action)).toEqual([
    "tracking.link.created",
    "lead.action.completed"
  ]);
});
```

- [ ] **Step 4: Run RED, implement the detail journey, then run GREEN**

Run twice: `npm test -- src/features/leads/lead-detail.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(admin)/leads' src/features/leads
git commit -m "feat: build lead conversion pipeline"
```

---

### Task 9: Build Campaign and Offer Management

**Files:**
- Create: `src/app/(admin)/campaigns/page.tsx`
- Create: `src/features/campaigns/campaigns-screen.tsx`
- Create: `src/features/campaigns/campaign-form.tsx`
- Create: `src/app/(admin)/offers/page.tsx`
- Create: `src/features/offers/offers-screen.tsx`
- Create: `src/features/offers/offer-form.tsx`
- Test: `src/features/campaigns/campaign-form.test.tsx`
- Test: `src/features/offers/offer-form.test.tsx`

**Interfaces:**
- Consumes: `createCampaign`, `updateOffer`, and `buildTrackedRayNameUrl`.
- Produces: validated campaigns, attribution URLs, and offer lifecycle states `draft`, `scheduled`, `active`, `expired`.

- [ ] **Step 1: Write a failing campaign creation test**

```tsx
test("creates Renewal Rescue with a Discord-attributed RayName URL", async () => {
  const user = userEvent.setup();
  renderAdmin(<CampaignForm />);
  await user.type(screen.getByLabelText("Campaign name"), "Renewal Rescue");
  await user.selectOptions(screen.getByLabelText("Channel"), "discord");
  await user.type(screen.getByLabelText("Destination"), "https://www.rayname.com/domain/search");
  await user.type(screen.getByLabelText("Start date"), "2026-08-23");
  await user.type(screen.getByLabelText("End date"), "2026-09-06");
  await user.click(screen.getByRole("button", { name: "Create campaign" }));
  expect(await screen.findByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_campaign=renewal-rescue/);
  expect(screen.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
});
```

- [ ] **Step 2: Run RED, implement Zod-validated campaign creation, then run GREEN**

Run twice: `npm test -- src/features/campaigns/campaign-form.test.tsx`. Reject external destinations and end dates earlier than start dates.

- [ ] **Step 3: Write a failing offer lifecycle test**

```tsx
test("extends and activates the .com Transfer Week offer", async () => {
  const user = userEvent.setup();
  renderAdmin(<OfferForm offerId="com-transfer-week" />);
  await user.clear(screen.getByLabelText("End date"));
  await user.type(screen.getByLabelText("End date"), "2026-08-30");
  await user.selectOptions(screen.getByLabelText("Status"), "active");
  await user.click(screen.getByRole("button", { name: "Save offer" }));
  expect(await screen.findByText("Live")).toBeVisible();
  expect(screen.getByText("Aug 17–30, 2026")).toBeVisible();
});
```

- [ ] **Step 4: Run RED, implement offer mutations and status derivation, then run GREEN**

Run twice: `npm test -- src/features/offers/offer-form.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(admin)/campaigns' 'src/app/(admin)/offers' src/features/campaigns src/features/offers
git commit -m "feat: manage campaigns and offers"
```

---

### Task 10: Build the 4:2:1 Content Operations Calendar

**Files:**
- Create: `src/app/(admin)/content/page.tsx`
- Create: `src/features/content/content-screen.tsx`
- Create: `src/features/content/content-calendar.tsx`
- Create: `src/features/content/content-editor.tsx`
- Create: `src/features/content/content-mix.ts`
- Test: `src/features/content/content-mix.test.ts`
- Test: `src/features/content/content-editor.test.tsx`

**Interfaces:**
- Produces: `summarizeContentMix(entries): { education: number; soft: number; direct: number; compliant: boolean }`.
- Produces: `validateContentEntry(input): { success: true } | { success: false; issues: string[] }`.
- Consumes: six approved Domain Intelligence formats and `updateContentEntry`.

- [ ] **Step 1: Write failing mix-validation tests**

```ts
test("accepts four educational, two soft, and one direct post", () => {
  expect(summarizeContentMix(["education", "education", "education", "education", "soft", "soft", "direct"]))
    .toEqual({ education: 4, soft: 2, direct: 1, compliant: true });
});

test("rejects an entry with more than one CTA", () => {
  expect(validateContentEntry({ title: "Transfer guide", ctas: ["Read", "Transfer"] }).success).toBe(false);
});
```

- [ ] **Step 2: Run RED, implement literal count validation, then run GREEN**

Run twice: `npm test -- src/features/content/content-mix.test.ts`.

- [ ] **Step 3: Write failing editor test for format, conversion level, and one CTA**

```tsx
test("schedules a Domain Breakdown education post with one CTA", async () => {
  const user = userEvent.setup();
  renderAdmin(<ContentEditor />);
  await user.type(screen.getByLabelText("Title"), "What makes a strong two-word .com");
  await user.selectOptions(screen.getByLabelText("Format"), "domain-breakdown");
  await user.selectOptions(screen.getByLabelText("Conversion level"), "education");
  await user.type(screen.getByLabelText("Publish date"), "2026-08-24");
  await user.type(screen.getByLabelText("CTA"), "Search similar names");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));
  expect(await screen.findByText("What makes a strong two-word .com")).toBeVisible();
  expect(screen.getByText("Aug 24, 2026")).toBeVisible();
  expect(screen.getByText("4:2:1 cycle compliant")).toBeVisible();
});
```

- [ ] **Step 4: Run RED, implement calendar/editor, then run GREEN**

Run twice: `npm test -- src/features/content/content-editor.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(admin)/content' src/features/content
git commit -m "feat: add content operations calendar"
```

---

### Task 11: Build Bot Health, Analytics, and Settings Routes

**Files:**
- Create: `src/app/(admin)/bot-automations/page.tsx`
- Create: `src/features/system-health/bot-automations-screen.tsx`
- Create: `src/app/(admin)/analytics/page.tsx`
- Create: `src/features/analytics/analytics-screen.tsx`
- Create: `src/app/(admin)/settings/page.tsx`
- Create: `src/features/settings/settings-screen.tsx`
- Test: `src/features/system-health/bot-automations-screen.test.tsx`
- Test: `src/features/analytics/analytics-screen.test.tsx`
- Test: `src/features/settings/settings-screen.test.tsx`

**Interfaces:**
- Consumes: provider system-health, attribution, funnel, and workspace settings state.
- Produces: clearly disabled API-dependent automation controls while API status is `awaiting-access`.

- [ ] **Step 1: Write failing Bot & Automations state test**

```tsx
test("keeps manual operations available while RayName API access is pending", async () => {
  renderAdmin(<BotAutomationsScreen />);
  expect(await screen.findAllByText("Healthy")).toHaveLength(3);
  expect(screen.getByText("Awaiting access")).toBeVisible();
  for (const name of ["Enable /price", "Enable /search", "Enable /verify", "Enable renewal events"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
  expect(screen.getByRole("button", { name: "Create tracked link" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Verify customer manually" })).toBeEnabled();
});
```

- [ ] **Step 2: Run RED, implement operational health state, then run GREEN**

Run twice: `npm test -- src/features/system-health/bot-automations-screen.test.tsx`.

- [ ] **Step 3: Write failing Analytics synchronization test**

```tsx
test("applies one date range to every analytics section", async () => {
  const user = userEvent.setup();
  renderAdmin(<AnalyticsScreen />);
  await user.click(screen.getByRole("button", { name: "Date range" }));
  await user.click(screen.getByRole("option", { name: "Aug 18–22, 2026" }));
  expect(screen.getAllByText("Aug 18–22, 2026")).toHaveLength(3);
  expect(screen.getByText("Conversion trend data table")).toBeInTheDocument();
  expect(screen.getByText("Attribution data table")).toBeInTheDocument();
  expect(screen.getByText("Funnel data table")).toBeInTheDocument();
});
```

- [ ] **Step 4: Run RED, implement Analytics, then run GREEN**

Run twice: `npm test -- src/features/analytics/analytics-screen.test.tsx`.

- [ ] **Step 5: Write failing safe-settings test**

```tsx
test("shows connection state without exposing configured secret values", async () => {
  renderAdmin(<SettingsScreen />);
  expect(await screen.findByText("Discord OAuth")).toBeVisible();
  expect(screen.getByText("Configured")).toBeVisible();
  expect(screen.getByText("Awaiting access")).toBeVisible();
  expect(document.body.innerHTML).not.toContain("discord-oauth-client-secret");
  expect(document.body.innerHTML).not.toContain("AUTH_SECRET");
});
```

- [ ] **Step 6: Run RED, implement Settings, then run GREEN**

Run twice: `npm test -- src/features/settings/settings-screen.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(admin)/bot-automations' 'src/app/(admin)/analytics' 'src/app/(admin)/settings' src/features/system-health src/features/analytics src/features/settings
git commit -m "feat: add health analytics and settings"
```

---

### Task 12: Add Private Production Access with Discord OAuth

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/features/auth/access-policy.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/sign-in/page.tsx`
- Create: `src/app/access-denied/page.tsx`
- Modify: `src/app/(admin)/layout.tsx`
- Create: `.env.example`
- Test: `src/features/auth/access-policy.test.ts`

**Interfaces:**
- Produces: `evaluateAdminAccess(input): "allow" | "sign-in" | "deny" | "misconfigured"`.
- Consumes environment keys `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `ADMIN_DISCORD_USER_IDS`, and `DEV_OPERATOR_ID`.

- [ ] **Step 1: Write failing pure policy tests**

```ts
test.each([
  [{ environment: "production", authenticatedUserId: null, allowlist: ["42"], credentialsReady: true }, "sign-in"],
  [{ environment: "production", authenticatedUserId: "7", allowlist: ["42"], credentialsReady: true }, "deny"],
  [{ environment: "production", authenticatedUserId: "42", allowlist: ["42"], credentialsReady: true }, "allow"],
  [{ environment: "production", authenticatedUserId: "42", allowlist: [], credentialsReady: false }, "misconfigured"],
  [{ environment: "development", authenticatedUserId: "local-ray", allowlist: [], credentialsReady: false }, "allow"]
])("evaluates admin access without failing open", (input, expected) => {
  expect(evaluateAdminAccess(input)).toBe(expected);
});
```

- [ ] **Step 2: Run RED, implement policy, then run GREEN**

Run twice: `npm test -- src/features/auth/access-policy.test.ts`.

- [ ] **Step 3: Configure Auth.js Discord provider and route guards**

Read server-only environment variables, normalize the comma-separated allowlist, and redirect each policy result to its explicit state. Development bypass is allowed only when `NODE_ENV === "development"` and `DEV_OPERATOR_ID` is non-empty.

- [ ] **Step 4: Document exact environment contract**

`.env.example` contains names and safe examples only:

```dotenv
AUTH_SECRET=generate-a-long-random-value
AUTH_DISCORD_ID=discord-oauth-application-id
AUTH_DISCORD_SECRET=discord-oauth-client-secret
ADMIN_DISCORD_USER_IDS=123456789012345678
DEV_OPERATOR_ID=local-ray
DATA_MODE=local
```

- [ ] **Step 5: Verify policy tests, typecheck, and production build**

```bash
npm test -- src/features/auth/access-policy.test.ts
npm run typecheck
npm run build
```

Expected: build succeeds; running production without configuration shows a closed misconfiguration page rather than admin content.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/features/auth src/app/api/auth src/app/sign-in src/app/access-denied 'src/app/(admin)/layout.tsx' .env.example
git commit -m "feat: protect admin with Discord access policy"
```

---

### Task 13: Verify the Core Journey, Responsiveness, and Accessibility

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/operator-journey.spec.ts`
- Create: `e2e/responsive.spec.ts`
- Create: `e2e/accessibility.spec.ts`
- Modify: responsive CSS modules found by failures.

**Interfaces:**
- Consumes: complete local-provider application from Tasks 1–12.
- Produces: reproducible browser verification at 1440 × 1024, 1180 × 900, and 1024 × 768.

- [ ] **Step 1: Write the failing operator-journey browser test**

```ts
test("operator completes a lead action and switches theme without losing state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Leads" }).click();
  await page.getByLabel("Segment").selectOption("investor");
  await page.getByRole("button", { name: "Open Alex Chen" }).click();
  await page.getByRole("button", { name: "Create tracked link" }).click();
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
  await page.getByRole("button", { name: /theme/i }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("textbox", { name: "Tracked URL" })).toHaveValue(/utm_source=discord/);
});
```

- [ ] **Step 2: Start the app, run the focused E2E test, and verify RED**

Run `npx playwright install chromium` once, then run the dev server in one terminal and `npm run test:e2e -- e2e/operator-journey.spec.ts` in another.  
Expected: FAIL on the first incomplete interaction or selector.

- [ ] **Step 3: Fix only the behavior exposed by the failing journey and verify GREEN**

Repeat the focused browser test until the full approved journey passes without hard-coded test-only paths.

- [ ] **Step 4: Add responsive assertions**

At 1440px assert the full sidebar labels are visible. At 1180px assert the icon rail is visible and has accessible names. At 1024px assert no persistent action or route content is clipped and lower Overview sections stack without horizontal page overflow.

```ts
for (const viewport of [{ width: 1440, height: 1024 }, { width: 1180, height: 900 }, { width: 1024, height: 768 }]) {
  test(`keeps admin controls usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
  });
}
```

- [ ] **Step 5: Add automated accessibility checks**

Run axe against Overview, Members, Leads, Campaigns, and Settings in both themes. Fail on serious or critical violations. Separately keyboard-test global search, theme menu, chart tabs, filters, detail drawer, and action menu.

```ts
import AxeBuilder from "@axe-core/playwright";

for (const route of ["/", "/members", "/leads", "/campaigns", "/settings"]) {
  test(`has no serious accessibility violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });
}
```

- [ ] **Step 6: Run all quality gates**

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

Expected: every command succeeds with no serious/critical accessibility violation and no browser console error.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e src
git commit -m "test: verify RayName operator journey"
```

---

### Task 14: Run Blocking Product Design QA Against Both References

**Files:**
- Create: `artifacts/design-qa/reference-light-1440x1024.png`
- Create: `artifacts/design-qa/reference-dark-1440x1024.png`
- Create: `artifacts/design-qa/overview-light.png`
- Create: `artifacts/design-qa/overview-dark.png`
- Create: `artifacts/design-qa/light-comparison.png`
- Create: `artifacts/design-qa/dark-comparison.png`
- Create: `design-qa.md`
- Modify: visual components and token files identified by QA.

**Interfaces:**
- Consumes: exact source references under `docs/design/references/` and browser-rendered implementation.
- Produces: `design-qa.md` whose final line is exactly `final result: passed` before handoff.

- [ ] **Step 1: Start and keep the local preview running**

Run: `npm run dev -- --hostname 0.0.0.0 --port 3000`.

- [ ] **Step 2: Capture matching browser evidence**

Using the user's in-app browser, open the local app, set viewport to 1440 × 1024 at device scale factor 1, set the date range to Aug 16–22, 2026, and capture Overview in Light and Dark. Check the browser console and exercise theme, chart tabs, priorities, global search, navigation, and lead actions.

- [ ] **Step 3: Create normalized side-by-side comparison images**

The source files are 1487 × 1058 pixels. Normalize each proportionally to the 1440 × 1024 CSS target, using a sub-pixel-equivalent center crop rather than non-uniform stretching, and save the normalized references listed above. Place each normalized source and implementation capture side by side. Record original source pixels, normalized pixels, implementation pixels, CSS viewport, density, route, range, and theme in `design-qa.md`.

- [ ] **Step 4: Run the Product Design QA rubric**

Evaluate full view plus focused crops for sidebar/command bar, KPI strip, main chart and priorities, and the lower tables. Explicitly review typography, spacing/layout rhythm, colors/tokens, image/icon fidelity, and copy/content.

- [ ] **Step 5: Fix every P0, P1, and P2 finding and compare again**

Keep `final result: blocked` while any actionable P0/P1/P2 remains. After each fix, recapture the same viewport/state, rebuild the combined comparison, and record previous finding, fix, and post-fix evidence. Do not stop because build or tests pass.

- [ ] **Step 6: Write the passing report and run final verification**

`design-qa.md` must include both source paths, both implementation paths, comparison paths, viewport/density, interactions tested, console result, comparison history, remaining P3 polish, and the exact final line:

```text
final result: passed
```

Run:

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 7: Commit the verified build and QA evidence**

```bash
git add src e2e artifacts/design-qa design-qa.md package.json package-lock.json
git commit -m "feat: complete verified RayName admin console"
```

---

## Plan Completion Check

- Every approved navigation route is implemented in Tasks 5–12.
- Theme persistence and identical Light/Dark geometry are implemented in Task 3 and visually verified in Task 14.
- The local provider, manual operations, and tracked links are implemented in Tasks 2, 6–10.
- Missing Marketing API access is represented safely in Task 11.
- Production access control is implemented and fails closed in Task 12.
- The core operator journey, responsiveness, accessibility, build, and visual fidelity are independently gated in Tasks 13–14.
- Discord bot commands, Discord server setup, database persistence, and the future RayName Marketing API remain outside this web-console plan as required by the specification.
