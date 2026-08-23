import { describe, expect, test } from "vitest";
import { createUnavailableAvailability, type SafeAdminRuntimeConfig } from "./availability";
import { IntegrationUnavailableError } from "./provider";
import { createUnavailableAdminDataStore } from "./unavailable-provider";

const config = {
  workspaceName: "RayName Discord Community",
  timezone: "UTC",
  discordServerName: "RayName Domain Club",
  discordOAuthConfigured: true,
  rayNameApiConfigured: false,
  operatorAllowlist: ["42"],
} satisfies SafeAdminRuntimeConfig;

const availability = createUnavailableAvailability(config);

describe("createUnavailableAdminDataStore", () => {
  test("returns no business records or generated facts", async () => {
    const provider = createUnavailableAdminDataStore(availability, config);
    const state = await provider.getState();
    const overview = await provider.getOverview({ from: "2026-08-16", to: "2026-08-22" });
    const analytics = await provider.getAnalytics({ from: "2026-08-16", to: "2026-08-22" });

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
    expect(overview.funnelSemantics).toMatchObject({
      basis: "unavailable",
      label: "Data unavailable",
      comparisonLabel: null,
    });
    expect(analytics.semantics).not.toBeNull();
    expect(Object.values(analytics.semantics ?? {}).every(
      (semantics) => semantics.basis === "unavailable",
    )).toBe(true);
    expect(analytics.retentionRate).toBeNull();
  });

  test("preserves only safe runtime configuration", async () => {
    const provider = createUnavailableAdminDataStore(availability, config);
    const settings = await provider.getWorkspaceSettings();

    expect(settings).toMatchObject({
      workspace: { name: "RayName Discord Community", timezone: "UTC" },
      discord: { serverName: "RayName Domain Club", configured: true },
      operatorAllowlist: ["42"],
      rayNameApi: { status: "awaiting-access" },
    });
    expect(settings.notifications).toEqual({ dailySummary: false, failedJobs: false });
  });

  test("rejects mutations instead of reporting local success", async () => {
    const provider = createUnavailableAdminDataStore(availability, config);

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

  test("returns empty search and rejects entity reads without invented records", async () => {
    const provider = createUnavailableAdminDataStore(availability, config);

    await expect(provider.search("Alex")).resolves.toEqual([]);
    await expect(provider.getMember("member-1")).rejects.toMatchObject({
      capability: "read-members",
    });
  });
});
