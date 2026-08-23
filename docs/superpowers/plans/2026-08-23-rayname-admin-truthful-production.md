# RayName Admin Truthful Production Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production RayName Admin console with no seeded business data, no in-memory-only production actions, and clear integration-unavailable states until live RayName, Discord, and database providers exist.

**Architecture:** Add a capability-bearing provider contract and a fail-closed unavailable provider for production. Keep the existing mutable provider only as a test harness, render capability-aware empty states across the current routes, and derive shell identity/status from authenticated and safe runtime facts instead of constants.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 6.0.3, NextAuth 4.24.15, React Aria Components 1.20.0, Vitest 4.1.11, Testing Library, Playwright 1.62.1, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-23-rayname-admin-truthful-production-design.md`

## Global Constraints

- Production must not import or render deterministic member, lead, campaign, offer, content, analytics, priority, notification, revenue, or health data.
- `DATA_MODE` defaults to `unavailable`; `local` and unsupported values fail closed in production.
- No production control may report success unless a live durable provider confirms the operation.
- Keep the current RayName Precision visual system, responsive behavior, Discord OAuth access control, navigation, and theme switching.
- Secrets stay server-only; only safe actor and integration summaries may cross into client components.
- Test fixtures may contain deterministic records but must not be reachable from the production runtime dependency graph.
- Do not add application dependencies.
- Preserve WCAG AA behavior in light and dark themes.

## File Structure

- `src/lib/admin-data/availability.ts`: capability identifiers, integration states, fail-closed availability builders.
- `src/lib/admin-data/unavailable-provider.ts`: structurally empty reader and mutation rejections for production.
- `src/lib/admin-data/provider.ts`: provider interfaces and the typed unavailable error.
- `src/lib/admin-data/types.ts`: nullable empty-state data contracts and integration status types.
- `src/test/fixtures/admin-state.ts`: deterministic fixture moved out of runtime data modules.
- `src/test/admin-data.ts`: connected test provider and connected availability helpers.
- `src/components/data-state/data-unavailable.tsx`: shared route and capability fallback UI.
- `src/components/admin-shell/runtime-admin-data-provider.tsx`: production provider/context wiring.
- `src/components/admin-shell/*`: authenticated actor, real sign-out, honest status, and search availability.
- `src/features/*`: connected-empty handling and capability gates for business forms.
- `e2e/truthful-production.spec.ts`: production-like no-seed and legitimate-control coverage.

---

### Task 1: Capability and Integration Contracts

**Files:**
- Create: `src/lib/admin-data/availability.ts`
- Create: `src/lib/admin-data/availability.test.ts`
- Modify: `src/lib/admin-data/types.ts`
- Modify: `src/lib/admin-data/provider.ts`
- Modify: `src/lib/admin-data/authorized-provider.ts`
- Modify: `src/lib/admin-data/provider-contract.test.ts`

**Interfaces:**
- Produces: `AdminCapability`, `AdminAvailability`, `IntegrationState`, `IntegrationUnavailableError`, `AdminDataReader.availability`.
- Consumes: existing `AdminDataProvider`, `ActorAwareAdminDataStore`, and mutation method signatures.

- [ ] **Step 1: Write the failing availability contract tests**

```ts
import { describe, expect, test } from "vitest";
import {
  adminCapabilities,
  createUnavailableAvailability,
  resolveRuntimeDataMode,
} from "./availability";

describe("createUnavailableAvailability", () => {
  test("fails every business capability closed with a reason", () => {
    const availability = createUnavailableAvailability({
      discordOAuthConfigured: true,
      rayNameApiConfigured: false,
    });

    expect(availability.dataMode).toBe("unavailable");
    expect(Object.keys(availability.capabilities)).toEqual(adminCapabilities);
    for (const capability of adminCapabilities) {
      expect(availability.capabilities[capability]).toEqual({
        available: false,
        reason: expect.any(String),
      });
    }
    expect(availability.integrations.discordOAuth.status).toBe("connected");
    expect(availability.integrations.discordBot.status).toBe("not-connected");
    expect(availability.integrations.database.status).toBe("not-connected");
    expect(availability.integrations.rayNameMarketingApi.status).toBe("awaiting-access");
    expect(availability.integrations.deploymentMonitoring.status).toBe("unknown");
  });

  test.each([undefined, "", "local", "demo", "live", "unexpected"])(
    "fails requested mode %s closed while no live provider exists",
    (requestedMode) => {
      expect(resolveRuntimeDataMode(requestedMode)).toBe("unavailable");
    },
  );
});
```

Add a compile-time assertion to `provider-contract.test.ts`:

```ts
expectTypeOf<AdminDataProvider["availability"]>().toMatchTypeOf<AdminAvailability>();
expectTypeOf<ActorAwareAdminDataStore["availability"]>().toMatchTypeOf<AdminAvailability>();
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- src/lib/admin-data/availability.test.ts src/lib/admin-data/provider-contract.test.ts`

Expected: FAIL because `availability.ts`, `AdminAvailability`, and the provider property do not exist.

- [ ] **Step 3: Implement the minimal capability types and builder**

Use these exact capability identifiers in `availability.ts`:

```ts
export const adminCapabilities = [
  "read-overview",
  "read-community",
  "read-members",
  "read-leads",
  "read-campaigns",
  "read-offers",
  "read-content",
  "read-analytics",
  "mutate-members",
  "mutate-leads",
  "create-tracked-links",
  "manage-campaigns",
  "manage-offers",
  "schedule-content",
  "view-notifications",
] as const;

export type AdminCapability = (typeof adminCapabilities)[number];
// Define this union in types.ts and import it into availability.ts.
export type IntegrationStatus =
  | "connected"
  | "not-connected"
  | "awaiting-access"
  | "unknown"
  | "degraded";

export type AdminAvailability = {
  dataMode: "unavailable" | "live";
  capabilities: Record<AdminCapability, { available: boolean; reason: string | null }>;
  integrations: Record<
    "discordOAuth" | "discordBot" | "database" | "rayNameMarketingApi" | "deploymentMonitoring",
    { status: IntegrationStatus; detail: string }
  >;
};

export type SafeAdminRuntimeConfig = {
  workspaceName: string;
  timezone: string;
  discordServerName: string;
  discordOAuthConfigured: boolean;
  rayNameApiConfigured: boolean;
  operatorAllowlist: string[];
};

export function createUnavailableAvailability(
  input: Pick<SafeAdminRuntimeConfig, "discordOAuthConfigured" | "rayNameApiConfigured">,
): AdminAvailability {
  const reason = "Available after the required live data integration is connected.";
  return {
    dataMode: "unavailable",
    capabilities: Object.fromEntries(adminCapabilities.map((capability) => [
      capability,
      { available: false, reason },
    ])) as AdminAvailability["capabilities"],
    integrations: {
      discordOAuth: {
        status: input.discordOAuthConfigured ? "connected" : "not-connected",
        detail: input.discordOAuthConfigured ? "Admin sign-in configured" : "Admin sign-in not configured",
      },
      discordBot: { status: "not-connected", detail: "Discord bot is not connected" },
      database: { status: "not-connected", detail: "Persistent database is not connected" },
      rayNameMarketingApi: {
        status: input.rayNameApiConfigured ? "connected" : "awaiting-access",
        detail: input.rayNameApiConfigured ? "API credentials configured" : "Marketing API access pending",
      },
      deploymentMonitoring: { status: "unknown", detail: "No deployment health provider connected" },
    },
  };
}

export function resolveRuntimeDataMode(_requestedMode: string | undefined): "unavailable" {
  return "unavailable";
}
```

`createUnavailableAvailability()` must assign non-empty reasons and must not use metrics, dates, counts, or health claims. Add `readonly availability: AdminAvailability` to both provider reader interfaces. In `authorized-provider.ts`, expose the backing store value unchanged:

Replace the old `ServiceStatus` union with `IntegrationStatus` on `SystemService.status`; test fixtures that previously used `operational` must use `connected`.

```ts
return {
  availability: store.availability,
  // existing reader and authorized mutation methods
};
```

Add this error to `provider.ts` for defensive mutation rejection:

```ts
export class IntegrationUnavailableError extends Error {
  readonly name = "IntegrationUnavailableError";

  constructor(readonly capability: AdminCapability, message: string) {
    super(message);
  }
}
```

- [ ] **Step 4: Run focused tests twice**

Run twice: `npm test -- src/lib/admin-data/availability.test.ts src/lib/admin-data/provider-contract.test.ts src/lib/admin-data/authorized-provider.test.ts`

Expected: PASS on both runs.

- [ ] **Step 5: Commit the contract**

```bash
git add src/lib/admin-data/availability.ts src/lib/admin-data/availability.test.ts src/lib/admin-data/types.ts src/lib/admin-data/provider.ts src/lib/admin-data/authorized-provider.ts src/lib/admin-data/provider-contract.test.ts src/lib/admin-data/authorized-provider.test.ts
git commit -m "feat: define admin data availability"
```

---

### Task 2: Fail-Closed Production Provider

**Files:**
- Create: `src/lib/admin-data/unavailable-provider.ts`
- Create: `src/lib/admin-data/unavailable-provider.test.ts`
- Modify: `src/lib/admin-data/types.ts`

**Interfaces:**
- Consumes: `AdminAvailability`, `SafeAdminRuntimeConfig`, `ActorAwareAdminDataStore`, `IntegrationUnavailableError` from Task 1.
- Produces: `createUnavailableAdminDataStore(availability, config)` returning `ActorAwareAdminDataStore`.

- [ ] **Step 1: Write failing provider truth tests**

```ts
import { describe, expect, test } from "vitest";
import { createUnavailableAvailability } from "./availability";
import { IntegrationUnavailableError } from "./provider";
import { createUnavailableAdminDataStore } from "./unavailable-provider";

const availability = createUnavailableAvailability({
  discordOAuthConfigured: true,
  rayNameApiConfigured: false,
});

describe("createUnavailableAdminDataStore", () => {
  test("returns no business records or generated facts", async () => {
    const provider = createUnavailableAdminDataStore(availability, {
      workspaceName: "RayName Discord Community",
      timezone: "UTC",
      discordServerName: "RayName Domain Club",
      discordOAuthConfigured: true,
      operatorAllowlist: ["42"],
    });
    const state = await provider.getState();

    expect(state.members).toEqual([]);
    expect(state.leads).toEqual([]);
    expect(state.campaigns).toEqual([]);
    expect(state.offers).toEqual([]);
    expect(state.content).toEqual([]);
    expect(state.trackedLinks).toEqual([]);
    expect(state.activity).toEqual([]);
    expect(state.overview.metrics).toEqual([]);
    expect(state.overview.priorities).toEqual([]);
    expect(state.analytics.trend).toEqual([]);
    expect(state.systemHealth.recentCommands).toEqual([]);
  });

  test("rejects mutations instead of reporting local success", async () => {
    const provider = createUnavailableAdminDataStore(availability, {
      workspaceName: "RayName Discord Community",
      timezone: "UTC",
      discordServerName: "RayName Domain Club",
      discordOAuthConfigured: true,
      operatorAllowlist: ["42"],
    });

    await expect(provider.verifyMember("member-1", "42")).rejects.toBeInstanceOf(
      IntegrationUnavailableError,
    );
    await expect(provider.createTrackedLink({
      destination: "https://www.rayname.com",
      campaign: "discord",
      source: "discord",
      medium: "community",
      content: "member",
    }, "42")).rejects.toMatchObject({ capability: "create-tracked-links" });
  });
});
```

- [ ] **Step 2: Run the provider test and confirm RED**

Run: `npm test -- src/lib/admin-data/unavailable-provider.test.ts`

Expected: FAIL because the provider factory does not exist.

- [ ] **Step 3: Implement empty reads and typed mutation rejection**

Build a single frozen empty state and clone it per read. Mutation methods must call one helper:

Change `OverviewSnapshot.funnelSemantics` to `FunnelSemantics | null`, `AnalyticsSnapshot.semantics` to `AnalyticsSemantics | null`, and `AnalyticsSnapshot.retentionRate` to `number | null`. The empty state contains only structural absence and safe configuration:

```ts
const emptyState: AdminState = {
  overview: {
    metrics: [],
    trend: [],
    funnel: [],
    priorities: [],
    leads: [],
    campaigns: [],
  },
  members: [],
  leads: [],
  campaigns: [],
  offers: [],
  content: [],
  trackedLinks: [],
  activity: [],
  community: {
    memberGrowth: [],
    roleDistribution: [],
    channelActivity: [],
    onboarding: { started: 0, completed: 0, completionRate: 0 },
    conversion: { visitors: 0, verifiedCustomers: 0, paidCustomers: 0 },
    discordServerUrl: "",
  },
  systemHealth: {
    services: integrationServicesFrom(availability),
    recentCommands: [],
    scheduledJobs: [],
    failures: [],
    renewalReminderRuns: [],
  },
  analytics: {
    funnel: [],
    revenueBySource: [],
    campaignAttribution: [],
    conversionBySegment: [],
    trend: [],
    leadVelocity: [],
    offerPerformance: [],
    retentionRate: null,
  },
  analyticsEvents: [],
  workspaceSettings: {
    workspace: { name: config.workspaceName, timezone: config.timezone },
    discord: { serverName: config.discordServerName, configured: false },
    operatorAllowlist: [...config.operatorAllowlist],
    rayNameApi: { status: config.rayNameApiConfigured ? "configured" : "awaiting-access" },
    trackingDefaults: { source: "discord", medium: "community" },
    notifications: { dailySummary: false, failedJobs: false },
    dataRetentionDays: 0,
    theme: "system",
  },
};
```

`getOverview(range)` returns the cloned overview plus `{ range, funnelSemantics: null }`; `getAnalytics(range)` returns the cloned analytics plus `{ range, semantics: null }`.

```ts
const unavailable = (capability: AdminCapability): never => {
  const reason = availability.capabilities[capability].reason
    ?? "This integration is not connected.";
  throw new IntegrationUnavailableError(capability, reason);
};
```

Map mutations to their required capabilities:

```ts
completePriority: async () => unavailable("read-overview"),
updateLeadAction: async () => unavailable("mutate-leads"),
completeLeadAction: async () => unavailable("mutate-leads"),
updateMember: async () => unavailable("mutate-members"),
verifyMember: async () => unavailable("mutate-members"),
recordMemberAction: async () => unavailable("mutate-members"),
createTrackedLink: async () => unavailable("create-tracked-links"),
createCampaignWithTrackedLink: async () => unavailable("manage-campaigns"),
updateOffer: async () => unavailable("manage-offers"),
updateContentEntry: async () => unavailable("schedule-content"),
```

Entity getters and search return no records without manufacturing IDs:

```ts
search: async () => [],
getMember: async () => unavailable("read-members"),
getLead: async () => unavailable("read-leads"),
getCampaign: async () => unavailable("read-campaigns"),
getOffer: async () => unavailable("read-offers"),
getTrackedLink: async () => unavailable("create-tracked-links"),
getContentEntry: async () => unavailable("read-content"),
```

- [ ] **Step 4: Run focused tests twice**

Run twice: `npm test -- src/lib/admin-data/unavailable-provider.test.ts src/lib/admin-data/provider-contract.test.ts`

Expected: PASS on both runs.

- [ ] **Step 5: Commit the unavailable provider**

```bash
git add src/lib/admin-data/unavailable-provider.ts src/lib/admin-data/unavailable-provider.test.ts src/lib/admin-data/types.ts
git commit -m "feat: add fail-closed admin provider"
```

---

### Task 3: Isolate Fixtures and Switch Runtime Wiring

**Files:**
- Move: `src/lib/admin-data/seed.ts` to `src/test/fixtures/admin-state.ts`
- Create: `src/test/admin-data.ts`
- Create: `src/lib/admin-data/runtime-boundary.test.ts`
- Modify: `src/lib/admin-data/local-provider.ts`
- Modify: `src/lib/admin-data/local-provider.test.ts`
- Modify: `src/test/render.tsx`
- Modify: `src/test/render.test.tsx`
- Modify: `src/features/analytics/analytics-screen.test.tsx`
- Modify: `src/features/community/community-screen.test.tsx`
- Modify: `src/features/content/content-editor.test.tsx`
- Modify: `src/features/leads/lead-detail.test.tsx`
- Modify: `src/features/members/members-screen.test.tsx`
- Modify: `src/features/overview/overview-screen.test.tsx`
- Modify: `src/features/overview/todays-priorities.test.tsx`
- Modify: `src/features/system-health/bot-automations-screen.test.tsx`
- Modify: `src/lib/admin-data/authorized-provider.test.ts`
- Modify: `src/lib/admin-data/context.tsx`
- Rename: `src/components/admin-shell/admin-data-provider.tsx` to `src/components/admin-shell/runtime-admin-data-provider.tsx`
- Modify: `src/app/(admin)/layout.tsx`
- Modify: `.env.example`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: unavailable provider and availability contracts from Tasks 1–2.
- Produces: `createTestAdminDataProvider(seed?)`, `connectedTestAvailability`, `RuntimeAdminDataProvider`.

- [ ] **Step 1: Write failing import-boundary and runtime-mode tests**

`runtime-boundary.test.ts` must scan production modules and reject fixture imports:

```ts
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production admin data boundary", () => {
  test("production modules cannot import deterministic fixtures", () => {
    const files = globSync("src/{app,components,features,lib}/**/*.{ts,tsx}")
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"));
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("test/fixtures/admin-state")
        || source.includes("admin-data/seed")
        || source.includes("createLocalAdminDataProvider()");
    });
    expect(offenders).toEqual([]);
  });
});
```

Add a component test that renders `RuntimeAdminDataProvider` with `NODE_ENV="production"` semantics and asserts:

```ts
expect(screen.getByTestId("data-mode")).toHaveTextContent("unavailable");
expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the boundary tests and confirm RED**

Run: `npm test -- src/lib/admin-data/runtime-boundary.test.ts src/test/render.test.tsx`

Expected: FAIL because production still imports the local provider and the seed remains in a runtime module.

- [ ] **Step 3: Move fixtures and wire the unavailable runtime**

Use `git mv src/lib/admin-data/seed.ts src/test/fixtures/admin-state.ts`.

Change the mutable factory to require explicit state:

```ts
export function createLocalAdminDataProvider(seed: AdminState): ActorAwareAdminDataStore {
  const state = structuredClone(seed);
  // existing test-store implementation
}
```

Create the test helper:

```ts
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { createAuthorizedAdminDataProvider } from "@/lib/admin-data/authorized-provider";
import { createUnavailableAvailability } from "@/lib/admin-data/availability";
import { createUnavailableAdminDataStore } from "@/lib/admin-data/unavailable-provider";
import { localAdminSeed } from "@/test/fixtures/admin-state";
import type { AdminState } from "@/lib/admin-data/types";

export const testRuntimeConfig = {
  workspaceName: "RayName Discord Community",
  timezone: "UTC",
  discordServerName: "RayName Domain Club",
  discordOAuthConfigured: true,
  rayNameApiConfigured: false,
  operatorAllowlist: ["local-ray"],
} satisfies SafeAdminRuntimeConfig;

export const connectedTestAvailability: AdminAvailability = {
  ...createUnavailableAvailability(testRuntimeConfig),
  dataMode: "live",
  capabilities: Object.fromEntries(adminCapabilities.map((capability) => [
    capability,
    { available: true, reason: null },
  ])) as AdminAvailability["capabilities"],
};

export function createTestAvailability(
  overrides: Partial<AdminAvailability["capabilities"]> = {},
): AdminAvailability {
  return {
    ...connectedTestAvailability,
    capabilities: { ...connectedTestAvailability.capabilities, ...overrides },
  };
}

export function createTestAdminDataProvider(
  seed: AdminState = localAdminSeed,
  availability: AdminAvailability = connectedTestAvailability,
) {
  const store = createLocalAdminDataProvider(seed, availability);
  return createAuthorizedAdminDataProvider(store, async () => ({ actorId: "local-ray" }));
}

export function createUnavailableTestProvider() {
  const availability = createUnavailableAvailability(testRuntimeConfig);
  return createAuthorizedAdminDataProvider(
    createUnavailableAdminDataStore(availability, testRuntimeConfig),
    async () => ({ actorId: "local-ray" }),
  );
}
```

Update `createLocalAdminDataProvider` to accept `availability` as its second required argument and expose it on the returned store. Add this context hook:

```ts
export function useAdminAvailability(): AdminAvailability {
  return useAdminData().availability;
}
```

Change `src/test/render.tsx` so its `provider` option is an `AdminDataProvider` and is passed straight into context; do not wrap an already-authorized provider a second time:

```tsx
type AdminRenderOptions = Omit<RenderOptions, "wrapper"> & {
  provider?: AdminDataProvider;
};

export function renderAdmin(ui: React.ReactNode, options: AdminRenderOptions = {}) {
  const { provider = createTestAdminDataProvider(), ...renderOptions } = options;
  return render(
    <AdminDataProvider provider={provider}>
      <ReportingRangeProvider>{ui}</ReportingRangeProvider>
    </AdminDataProvider>,
    renderOptions,
  );
}
```

Update test imports to use `@/test/admin-data` and `@/test/fixtures/admin-state`. The production provider component must be:

```tsx
"use client";

type RuntimeAdminDataProviderProps = {
  children: React.ReactNode;
  mutationGate: AdminMutationGate;
  config: SafeAdminRuntimeConfig;
};

export function RuntimeAdminDataProvider({
  children,
  mutationGate,
  config,
}: Readonly<RuntimeAdminDataProviderProps>) {
  const [provider] = useState(() => createAuthorizedAdminDataProvider(
    createUnavailableAdminDataStore(
      createUnavailableAvailability(config),
      config,
    ),
    mutationGate,
  ));

  return (
    <AdminDataProvider provider={provider}>
      <ReportingRangeProvider>{children}</ReportingRangeProvider>
    </AdminDataProvider>
  );
}
```

In the server layout, normalize only safe values and pass them down:

```ts
const runtimeConfig = {
  workspaceName: "RayName Discord Community",
  timezone: "UTC",
  discordServerName: "RayName Domain Club",
  discordOAuthConfigured: authEnvironment.credentialsReady,
  rayNameApiConfigured: false,
  operatorAllowlist: [...authEnvironment.allowlist],
};
```

Set `.env.example` and Playwright web-server configuration to `DATA_MODE=unavailable`. Do not branch to sample data for `DATA_MODE=local`.

- [ ] **Step 4: Run fixture, boundary, provider, and type checks**

Run twice: `npm test -- src/lib/admin-data/runtime-boundary.test.ts src/lib/admin-data/local-provider.test.ts src/test/render.test.tsx src/lib/admin-data/unavailable-provider.test.ts`

Then run: `npm run typecheck`

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit runtime isolation**

```bash
git add -A src/lib/admin-data src/test src/components/admin-shell src/app/'(admin)'/layout.tsx .env.example playwright.config.ts src/features
git commit -m "refactor: isolate admin fixtures from production"
```

Before committing, inspect `git diff --cached --name-only` and confirm every changed feature/component file is a test import migration only.

---

### Task 4: Authenticated Operator and Honest Shell Controls

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth.test.ts`
- Modify: `src/app/(admin)/layout.tsx`
- Modify: `src/components/admin-shell/admin-shell.tsx`
- Modify: `src/components/admin-shell/command-bar.tsx`
- Modify: `src/components/admin-shell/sidebar.tsx`
- Modify: `src/components/admin-shell/global-search.tsx`
- Modify: `src/components/admin-shell/admin-shell.module.css`
- Modify: `src/components/admin-shell/admin-shell.test.tsx`
- Modify: `src/components/admin-shell/global-search.test.tsx`

**Interfaces:**
- Consumes: `AdminAvailability` and `useAdminAvailability()` from the provider context.
- Produces: `AdminActorSummary`, `getAuthenticatedAdminActor()`, real sign-out behavior, capability-aware search and status.

- [ ] **Step 1: Write failing shell truth tests**

Add an auth test:

```ts
expect(await getAuthenticatedAdminActor()).toEqual({
  id: "42",
  name: "Tony",
  image: "https://cdn.discordapp.com/avatars/42/avatar.png",
});
```

Add shell assertions using an unavailable provider and actor `{ id: "42", name: "Tony", image: null }`:

```ts
expect(screen.getByRole("status", { name: /setup incomplete/i })).toBeVisible();
expect(screen.getByRole("button", { name: "Operator menu" })).toHaveTextContent("Tony");
expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
expect(screen.queryByText("All systems operational")).not.toBeInTheDocument();
expect(screen.queryByText("Account settings")).not.toBeInTheDocument();
```

Mock `signOut` and assert selecting the menu item calls:

```ts
expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/sign-in" });
```

Global search under unavailable capabilities must show “Search is available after a data source is connected” without calling `provider.search`.

- [ ] **Step 2: Run shell tests and confirm RED**

Run: `npm test -- src/lib/auth.test.ts src/components/admin-shell/admin-shell.test.tsx src/components/admin-shell/global-search.test.tsx`

Expected: FAIL on hard-coded Ray, health, notifications, inactive sign-out, and searchable sample data.

- [ ] **Step 3: Implement the authenticated actor and capability-aware shell**

Use this server-only summary:

```ts
export type AdminActorSummary = {
  id: string;
  name: string;
  image: string | null;
};

export async function getAuthenticatedAdminActor(): Promise<AdminActorSummary | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as {
    discordUserId?: unknown;
    name?: unknown;
    image?: unknown;
  } | undefined;
  const id = typeof user?.discordUserId === "string" ? user.discordUserId.trim() : "";
  if (!id) return null;
  return {
    id,
    name: typeof user?.name === "string" && user.name.trim() ? user.name.trim() : "Discord operator",
    image: typeof user?.image === "string" && user.image.trim() ? user.image : null,
  };
}
```

For the development bypass, construct `{ id, name: "Development operator", image: null }`. Pass the actor through `AdminShell` to `CommandBar`.

Replace the operator menu with one working action:

```tsx
<Menu
  aria-label="Operator menu"
  className={styles.operatorMenu}
  onAction={(key) => {
    if (key === "sign-out") void signOut({ callbackUrl: "/sign-in" });
  }}
>
  <MenuItem id="sign-out">Sign out</MenuItem>
</Menu>
```

Remove the notification button and count. Use availability to display “Setup incomplete” and “Integrations pending”. Disable the date control when `read-analytics` is false with `aria-describedby` pointing to an explanation. Search must not query the provider when all searchable read capabilities are unavailable.

- [ ] **Step 4: Run shell tests twice and typecheck**

Run twice: `npm test -- src/lib/auth.test.ts src/components/admin-shell/admin-shell.test.tsx src/components/admin-shell/global-search.test.tsx`

Then run: `npm run typecheck`

Expected: PASS and no type errors.

- [ ] **Step 5: Commit the shell correction**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/app/'(admin)'/layout.tsx src/components/admin-shell
git commit -m "fix: make admin shell controls truthful"
```

---

### Task 5: Shared Unavailable States and Read-Only Routes

**Files:**
- Create: `src/components/data-state/data-unavailable.tsx`
- Create: `src/components/data-state/data-unavailable.module.css`
- Create: `src/components/data-state/data-unavailable.test.tsx`
- Modify: `src/app/(admin)/page.tsx`
- Modify: `src/app/(admin)/community/page.tsx`
- Modify: `src/app/(admin)/members/page.tsx`
- Modify: `src/app/(admin)/leads/page.tsx`
- Modify: `src/features/overview/overview-screen.tsx`
- Modify: `src/features/overview/todays-priorities.tsx`
- Modify: `src/features/overview/overview-screen.test.tsx`
- Modify: `src/features/community/community-screen.tsx`
- Modify: `src/features/community/community-screen.test.tsx`
- Modify: `src/features/members/members-screen.tsx`
- Modify: `src/features/members/members-screen.test.tsx`
- Modify: `src/features/leads/leads-screen.tsx`
- Modify: `src/features/leads/leads-screen.test.tsx`

**Interfaces:**
- Consumes: `AdminCapability`, `useAdminAvailability()`.
- Produces: `CapabilityBoundary`, `DataUnavailable`, `OverviewUnavailable`.

- [ ] **Step 1: Write failing route-state tests**

Test the shared boundary:

```tsx
renderAdmin(
  <CapabilityBoundary
    capability="read-members"
    title="Member data is not connected"
    description="Connect Discord member sync to use this page."
  >
    <p>Member directory</p>
  </CapabilityBoundary>,
  { provider: createUnavailableTestProvider() },
);

expect(screen.getByRole("heading", { name: "Member data is not connected" })).toBeVisible();
expect(screen.queryByText("Member directory")).not.toBeInTheDocument();
```

Add page tests proving unavailable routes omit `Alex Chen`, `DomainNomad`, `1,248`, `$18,420`, and “View all priorities”. Overview must render the six approved metric labels with `—` values and one “Data source not connected” explanation.

Add connected-empty tests for Community, Members, and Leads that assert “No members yet” or the equivalent connected-empty copy rather than an integration warning.

- [ ] **Step 2: Run route tests and confirm RED**

Run: `npm test -- src/components/data-state/data-unavailable.test.tsx src/features/overview/overview-screen.test.tsx src/features/community/community-screen.test.tsx src/features/members/members-screen.test.tsx src/features/leads/leads-screen.test.tsx`

Expected: FAIL because the capability boundary does not exist and sample UI still renders.

- [ ] **Step 3: Implement the shared boundary and honest routes**

The boundary must use the exact provider reason when a capability is unavailable:

```tsx
type CapabilityBoundaryProps = {
  capability: AdminCapability;
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function CapabilityBoundary({
  capability,
  title,
  description,
  children,
}: Readonly<CapabilityBoundaryProps>) {
  const availability = useAdminAvailability();
  const state = availability.capabilities[capability];
  if (state.available) return children;
  return (
    <DataUnavailable
      title={title}
      description={description ?? state.reason ?? "This data source is not connected."}
    />
  );
}
```

`OverviewUnavailable` renders these labels only:

```ts
const overviewMetricLabels = [
  "Discord Members",
  "Verified Customers",
  "Registrations",
  "Transfers",
  "Renewal Rate",
  "Attributed Revenue",
] as const;
```

Each value is `—`; there are no deltas. Remove the `/priorities` footer link entirely. Wrap Community, Members, and Leads pages in the matching read capability. When the capability is connected and a collection is empty, render connected-empty copy inside the feature screen.

- [ ] **Step 4: Run focused route tests twice and accessibility unit checks**

Run twice: `npm test -- src/components/data-state/data-unavailable.test.tsx src/features/overview/overview-screen.test.tsx src/features/community/community-screen.test.tsx src/features/members/members-screen.test.tsx src/features/leads/leads-screen.test.tsx`

Expected: PASS with no seeded copy.

- [ ] **Step 5: Commit read-route truth states**

```bash
git add src/components/data-state src/app/'(admin)'/page.tsx src/app/'(admin)'/community/page.tsx src/app/'(admin)'/members/page.tsx src/app/'(admin)'/leads/page.tsx src/features/overview src/features/community src/features/members src/features/leads
git commit -m "feat: add honest admin empty states"
```

---

### Task 6: Disable Non-Durable Campaign, Offer, and Content Actions

**Files:**
- Modify: `src/app/(admin)/campaigns/page.tsx`
- Modify: `src/app/(admin)/offers/page.tsx`
- Modify: `src/app/(admin)/content/page.tsx`
- Modify: `src/features/campaigns/campaigns-screen.tsx`
- Modify: `src/features/campaigns/campaign-form.tsx`
- Modify: `src/features/campaigns/campaign-form.test.tsx`
- Modify: `src/features/offers/offers-screen.tsx`
- Modify: `src/features/offers/offer-form.tsx`
- Modify: `src/features/offers/offer-form.test.tsx`
- Modify: `src/features/content/content-screen.tsx`
- Modify: `src/features/content/content-editor.tsx`
- Modify: `src/features/content/content-editor.test.tsx`

**Interfaces:**
- Consumes: `CapabilityBoundary`, `DataUnavailable`, `useAdminAvailability()`.
- Produces: read capability fallbacks and mutation capability gates for campaigns, offers, and content.

- [ ] **Step 1: Write failing action-legitimacy tests**

For unavailable providers, assert:

```ts
expect(screen.getByRole("heading", { name: "Campaign data is not connected" })).toBeVisible();
expect(screen.queryByRole("button", { name: /create campaign/i })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /save offer/i })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /schedule post/i })).not.toBeInTheDocument();
```

For a partially connected provider with read capability true and mutation capability false, assert the records can render while form submit buttons are disabled and associated with these explanations:

- “Campaign creation requires a persistent database and tracked-link provider.”
- “Offer publishing requires a persistent database and Discord publishing provider.”
- “Content scheduling requires a persistent database and Discord publishing provider.”

For connected-empty providers, assert each page shows “No campaigns yet”, “No offers yet”, or “No scheduled content yet”.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- src/features/campaigns/campaign-form.test.tsx src/features/offers/offer-form.test.tsx src/features/content/content-editor.test.tsx`

Expected: FAIL because forms remain enabled against the local mutation contract.

- [ ] **Step 3: Add read and mutation capability gates**

Wrap the routes with `read-campaigns`, `read-offers`, and `read-content`. Inside each connected screen, derive mutation availability:

```ts
const availability = useAdminAvailability();
const mutation = availability.capabilities["manage-campaigns"];
```

Pass `disabled={!mutation.available}` and an explanation ID into the form. The submit function must guard before calling the provider:

```ts
if (!mutation.available) {
  setStatus(mutation.reason ?? "Campaign creation is unavailable.");
  return;
}
```

Use `manage-offers` and `schedule-content` for the other forms. An unavailable read capability renders the route fallback and does not mount the forms at all.

- [ ] **Step 4: Run focused tests twice**

Run twice: `npm test -- src/features/campaigns/campaign-form.test.tsx src/features/offers/offer-form.test.tsx src/features/content/content-editor.test.tsx`

Expected: PASS on both runs.

- [ ] **Step 5: Commit durable-action gates**

```bash
git add src/app/'(admin)'/campaigns/page.tsx src/app/'(admin)'/offers/page.tsx src/app/'(admin)'/content/page.tsx src/features/campaigns src/features/offers src/features/content
git commit -m "fix: gate non-durable admin actions"
```

---

### Task 7: Honest Bot Health, Analytics, and Settings

**Files:**
- Modify: `src/app/(admin)/analytics/page.tsx`
- Modify: `src/features/analytics/analytics-screen.tsx`
- Modify: `src/features/analytics/analytics-screen.test.tsx`
- Modify: `src/features/system-health/bot-automations-screen.tsx`
- Modify: `src/features/system-health/bot-automations-screen.test.tsx`
- Modify: `src/features/settings/settings-screen.tsx`
- Modify: `src/features/settings/settings-screen.test.tsx`
- Modify: `src/features/system-health/bot-automations-screen.module.css`
- Modify: `src/features/settings/settings-screen.module.css`

**Interfaces:**
- Consumes: integration states and business capabilities from Task 1.
- Produces: real setup-state service cards, no-activity states, analytics fallback, safe configuration settings.

- [ ] **Step 1: Write failing operational-truth tests**

Under unavailable mode, Bot & Automations must assert:

```ts
expect(screen.getByText("Discord bot").closest("article")).toHaveTextContent("Not connected");
expect(screen.getByText("Database").closest("article")).toHaveTextContent("Not connected");
expect(screen.getByText("RayName Marketing API").closest("article")).toHaveTextContent("Awaiting access");
expect(screen.getByText("Deployment monitoring").closest("article")).toHaveTextContent("Unknown");
expect(screen.queryByText("Commands responding normally")).not.toBeInTheDocument();
expect(screen.queryByText("No recent failures")).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Verify customer manually" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Create tracked link" })).not.toBeInTheDocument();
expect(screen.getByText("No operational activity is available until integrations are connected.")).toBeVisible();
```

Analytics must show “Analytics data is not connected” without chart applications or seeded totals. Settings must show OAuth as configured from safe runtime config, Database as not connected, Marketing API as awaiting access, and no enabled-notification claims.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- src/features/system-health/bot-automations-screen.test.tsx src/features/analytics/analytics-screen.test.tsx src/features/settings/settings-screen.test.tsx`

Expected: FAIL on fake healthy services, seeded activity, manual buttons, analytics facts, and notification settings.

- [ ] **Step 3: Render integration states directly from availability**

Map statuses to plain labels:

```ts
const statusLabels = {
  connected: "Connected",
  "not-connected": "Not connected",
  "awaiting-access": "Awaiting access",
  unknown: "Unknown",
  degraded: "Degraded",
} as const;
```

Bot & Automations renders all five integration cards from `availability.integrations`, removes manual buttons when their capabilities are false, and renders no command/job/failure/reminder claims when arrays are empty.

Wrap Analytics in `CapabilityBoundary capability="read-analytics"`. Settings renders safe runtime facts from the provider settings object and availability; remove notification enabled/disabled rows when `view-notifications` is unavailable.

- [ ] **Step 4: Run focused tests twice and typecheck**

Run twice: `npm test -- src/features/system-health/bot-automations-screen.test.tsx src/features/analytics/analytics-screen.test.tsx src/features/settings/settings-screen.test.tsx`

Then run: `npm run typecheck`

Expected: PASS and no type errors.

- [ ] **Step 5: Commit operational truth states**

```bash
git add src/app/'(admin)'/analytics/page.tsx src/features/analytics src/features/system-health src/features/settings
git commit -m "fix: report honest integration health"
```

---

### Task 8: Production-Like Journey, Documentation, and Deployment Gates

**Files:**
- Create: `e2e/truthful-production.spec.ts`
- Modify: `e2e/fixtures.ts`
- Modify: `e2e/operator-journey.spec.ts`
- Modify: `e2e/accessibility.spec.ts`
- Modify: `e2e/responsive.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `.env.example`
- Create: `docs/operations.md`
- Modify: `docs/superpowers/specs/2026-08-23-rayname-admin-truthful-production-design.md`

**Interfaces:**
- Consumes: all production behavior from Tasks 1–7.
- Produces: deployment-safe environment documentation and full browser proof that every visible production control is legitimate.

- [ ] **Step 1: Write the production-like E2E assertions**

Use the development auth bypass but `DATA_MODE=unavailable`. The new test visits every route:

```ts
const routes = [
  "/",
  "/community",
  "/members",
  "/leads",
  "/campaigns",
  "/offers",
  "/content",
  "/bot-automations",
  "/analytics",
  "/settings",
] as const;

for (const route of routes) {
  await page.goto(route);
  await expect(page.getByText(/Alex Chen|DomainNomad|Sarah K\.|Web3Builder/)).toHaveCount(0);
  await expect(page.getByText(/1,248|18,420|91\.4%/)).toHaveCount(0);
  await expect(page.getByText("All systems operational")).toHaveCount(0);
}
```

Add exact checks that:

- all navigation links return non-404 pages;
- the `/priorities` link does not exist;
- notification and account-settings controls do not exist;
- theme switching changes the document theme;
- search explains that a data source is required;
- the operator menu exposes only Sign out, and selecting it sends a request matching `/api/auth/signout`;
- every unavailable route has one visible explanation;
- console errors and page errors remain empty.

Run axe on each unavailable route in both themes. Keep the existing responsive viewport matrix.

- [ ] **Step 2: Run the new E2E test and confirm any remaining RED**

Run: `npm run test:e2e -- e2e/truthful-production.spec.ts`

Expected before final cleanup: FAIL on any remaining seeded string, enabled non-durable control, missing unavailable state, or stale E2E assumption.

- [ ] **Step 3: Make only evidence-driven final corrections and update operations copy**

Update `.env.example` to:

```dotenv
AUTH_SECRET=generate-a-long-random-value
AUTH_DISCORD_ID=discord-oauth-application-id
AUTH_DISCORD_SECRET=discord-oauth-client-secret
ADMIN_DISCORD_USER_IDS=123456789012345678
DEV_OPERATOR_ID=
DATA_MODE=unavailable
```

The operations document must state:

```md
Production uses `DATA_MODE=unavailable` until a live provider is implemented.
`DEV_OPERATOR_ID` is for local development only and must be blank in Vercel.
Discord OAuth protects access but does not connect the Discord bot, member sync, or RayName business data.
```

Update the approved spec status to `Implemented` only after the full gates in Step 4 pass.

- [ ] **Step 4: Run all final quality gates**

Run the focused truth suite twice:

```bash
npm test -- src/lib/admin-data/availability.test.ts src/lib/admin-data/unavailable-provider.test.ts src/lib/admin-data/runtime-boundary.test.ts src/components/admin-shell/admin-shell.test.tsx src/components/admin-shell/global-search.test.tsx src/components/data-state/data-unavailable.test.tsx src/features/overview/overview-screen.test.tsx src/features/system-health/bot-automations-screen.test.tsx src/features/analytics/analytics-screen.test.tsx src/features/settings/settings-screen.test.tsx
```

Then run:

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all unit tests, all Playwright tests, TypeScript, lint, production build, and diff checks exit 0. Inspect the production build output and confirm all ten admin routes compile.

- [ ] **Step 5: Commit, push, and verify Vercel**

```bash
git add e2e playwright.config.ts .env.example docs src
git commit -m "test: prove truthful production dashboard"
git push origin HEAD:main
```

After Vercel finishes deploying, verify these public behaviors with no secret output:

```bash
curl -I https://rayname-admin.vercel.app/
curl -sS https://rayname-admin.vercel.app/api/auth/providers
```

Expected: `/` redirects unauthenticated users to `/sign-in`; the providers response advertises the Discord callback at `https://rayname-admin.vercel.app/api/auth/callback/discord`. Sign in through the user-selected browser and confirm the authenticated dashboard contains no seeded facts or enabled fake operations.
