import { describe, expect, test } from "vitest";

import { EntityNotFoundError, createLocalAdminDataProvider } from "./local-provider";

describe("local admin data provider", () => {
  test("returns the approved overview totals for Aug 16–22", async () => {
    const provider = createLocalAdminDataProvider();

    const overview = await provider.getOverview({
      from: "2026-08-16",
      to: "2026-08-22",
    });

    expect(overview.metrics.map((metric) => metric.value)).toEqual([
      "1,248",
      "326",
      "84",
      "39",
      "91.4%",
      "$18,420",
    ]);
    expect(overview.trend.map((point) => point.registrations)).toEqual([
      9, 11, 15, 17, 12, 20, 84,
    ]);
  });

  test("completing a priority removes it from the active queue and records activity", async () => {
    const provider = createLocalAdminDataProvider();

    await provider.completePriority("verify-new-members", "local-ray");

    const overview = await provider.getOverview({
      from: "2026-08-16",
      to: "2026-08-22",
    });
    expect(overview.priorities.map((item) => item.id)).not.toContain(
      "verify-new-members",
    );
    expect((await provider.getActivity())[0]).toMatchObject({
      actorId: "local-ray",
      entityId: "verify-new-members",
      action: "priority.completed",
    });
  });

  test("returns clones so callers cannot mutate provider state", async () => {
    const provider = createLocalAdminDataProvider();
    const firstState = await provider.getState();
    firstState.members[0].roles.push("mutated-role");
    firstState.overview.metrics[0].value = "0";

    const secondState = await provider.getState();

    expect(secondState.members[0].roles).not.toContain("mutated-role");
    expect(secondState.overview.metrics[0].value).toBe("1,248");
  });

  test("updates a lead and member while recording operator activity", async () => {
    const provider = createLocalAdminDataProvider();

    await provider.updateLeadAction("alex-chen", "mark-converted", "local-ray");
    const member = await provider.updateMember(
      "alex-chen",
      { verified: true, notes: ["Verified after registration"] },
      "local-ray",
    );

    expect(member).toMatchObject({ verified: true, notes: ["Verified after registration"] });
    expect((await provider.getState()).leads.find((lead) => lead.id === "alex-chen")).toMatchObject({
      stage: "converted",
      nextAction: "mark-converted",
    });
    expect((await provider.getActivity()).slice(0, 2).map((event) => event.action)).toEqual([
      "member.updated",
      "lead.action.updated",
    ]);
  });

  test("searches the supported entities and returns no result for an empty query", async () => {
    const provider = createLocalAdminDataProvider();

    expect(await provider.search("  ")).toEqual([]);
    expect(await provider.search("alex")).toEqual([
      {
        id: "alex-chen",
        type: "Member",
        primary: "@alexchen",
        secondary: "Investor · Verified customer",
        href: "/members/alex-chen",
      },
      {
        id: "alex-chen",
        type: "Lead",
        primary: "Alex Chen",
        secondary: "Investor · Very High intent",
        href: "/leads/alex-chen",
      },
    ]);
  });

  test("exposes deterministic supporting-route snapshots", async () => {
    const provider = createLocalAdminDataProvider();

    expect((await provider.getCommunity()).onboarding.completed).toBe(76);
    expect((await provider.getSystemHealth()).services.find((service) => service.id === "rayname-api")).toMatchObject({
      status: "awaiting-access",
      label: "RayName Marketing API",
    });
    expect((await provider.getAnalytics({ from: "2026-08-16", to: "2026-08-22" })).funnel[2]).toMatchObject({
      label: "Paid Customers",
      value: 168,
    });
    expect((await provider.getWorkspaceSettings()).workspace.name).toBe("RayName Discord Community");
  });

  test("throws a typed error when a requested entity does not exist", async () => {
    const provider = createLocalAdminDataProvider();

    await expect(provider.getOffer("missing-offer")).rejects.toEqual(
      new EntityNotFoundError("offer", "missing-offer"),
    );
    await expect(provider.completePriority("missing-priority", "local-ray")).rejects.toMatchObject({
      name: "EntityNotFoundError",
      entityType: "priority",
      entityId: "missing-priority",
    });
  });
});
