import { describe, expect, test } from "vitest";

import { EntityNotFoundError, createLocalAdminDataProvider } from "./local-provider";
import { ContentUpdateConflictError } from "./provider";

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

  test("persists one completed lead action across canonical and overview state", async () => {
    const provider = createLocalAdminDataProvider();

    const completed = await provider.completeLeadAction("alex-chen", "message", "local-ray");

    expect(completed).toMatchObject({
      completedAction: "message",
      nextAction: null,
    });
    expect(await provider.getLead("alex-chen")).toEqual(completed);
    expect((await provider.getState()).overview.leads.find((lead) => lead.id === "alex-chen"))
      .toMatchObject({ completedAction: "message", nextAction: null });
    await expect(
      provider.completeLeadAction("alex-chen", "message", "local-ray"),
    ).rejects.toThrow("No pending message action exists for Alex Chen.");
    expect((await provider.getActivity()).map((event) => event.action)).toEqual([
      "lead.action.completed",
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

    expect((await provider.getCommunity()).onboarding.completed).toBe(78);
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

  test("computes distinct analytics aggregates for every approved date range", async () => {
    const provider = createLocalAdminDataProvider();

    const monthToDate = await provider.getAnalytics({ from: "2026-08-01", to: "2026-08-22" });
    const approvedWeek = await provider.getAnalytics({ from: "2026-08-16", to: "2026-08-22" });
    const recentFiveDays = await provider.getAnalytics({ from: "2026-08-18", to: "2026-08-22" });

    expect(approvedWeek.campaignAttribution[0]).toMatchObject({
      revenue: 9420,
      visitors: 2842,
    });
    expect(approvedWeek.funnel.map((step) => step.value)).toEqual([8742, 326, 168]);
    expect(recentFiveDays.campaignAttribution[0]).toMatchObject({
      revenue: 7395,
      visitors: 2504,
    });
    expect(recentFiveDays.funnel.map((step) => step.value)).toEqual([7701, 287, 148]);
    expect(recentFiveDays.trend).toHaveLength(5);
    expect(monthToDate.campaignAttribution[0].revenue).toBeGreaterThan(9420);
    expect(monthToDate.funnel[0].value).toBeGreaterThan(8742);
    expect(new Set([
      monthToDate.campaignAttribution[0].revenue,
      approvedWeek.campaignAttribution[0].revenue,
      recentFiveDays.campaignAttribution[0].revenue,
    ]).size).toBe(3);
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

  test("throws typed errors for every supported missing entity category", async () => {
    const provider = createLocalAdminDataProvider();
    const missingRequests = [
      ["member", "missing-member", provider.getMember("missing-member")],
      ["lead", "missing-lead", provider.getLead("missing-lead")],
      ["campaign", "missing-campaign", provider.getCampaign("missing-campaign")],
      ["tracked-link", "missing-tracked-link", provider.getTrackedLink("missing-tracked-link")],
      ["content", "missing-content", provider.getContentEntry("missing-content")],
    ] as const;

    for (const [entityType, entityId, request] of missingRequests) {
      await expect(request).rejects.toMatchObject({
        name: "EntityNotFoundError",
        entityType,
        entityId,
      });
    }
  });

  test("records a member action against the selected member", async () => {
    const provider = createLocalAdminDataProvider();

    await provider.recordMemberAction("alex-chen", "open-ticket", "local-ray");

    expect((await provider.getActivity())[0]).toMatchObject({
      actorId: "local-ray",
      entityId: "alex-chen",
      action: "member.open-ticket",
    });
  });

  test("creates a tracked link in state and records its activity", async () => {
    const provider = createLocalAdminDataProvider();

    const link = await provider.createTrackedLink(
      {
        destination: "https://www.rayname.com/domain/search",
        campaign: "com-transfer-week",
        source: "discord",
        medium: "community",
        content: "lead-detail",
      },
      "local-ray",
    );

    expect(link).toMatchObject({
      id: "tracked-link-1",
      url: "https://www.rayname.com/domain/search?utm_campaign=com-transfer-week&utm_content=lead-detail&utm_medium=community&utm_source=discord",
    });
    expect((await provider.getState()).trackedLinks).toEqual([link]);
    expect((await provider.getActivity())[0]).toMatchObject({
      actorId: "local-ray",
      entityId: "tracked-link-1",
      action: "tracking.link.created",
    });
  });

  test("creates a campaign with zero performance and records its activity", async () => {
    const provider = createLocalAdminDataProvider();

    const campaign = await provider.createCampaign(
      {
        name: "Builder referral push",
        objective: "Convert builder referrals",
        audience: "Builders",
        channel: "Discord",
        destination: "https://www.rayname.com/domain/search",
        startDate: "2026-08-23",
        endDate: "2026-08-30",
        status: "scheduled",
      },
      "local-ray",
    );

    expect(campaign).toMatchObject({
      id: "campaign-5",
      visitors: 0,
      verifiedCustomers: 0,
      conversions: 0,
      revenue: 0,
    });
    expect((await provider.getState()).campaigns[0]).toEqual(campaign);
    expect((await provider.getActivity())[0]).toMatchObject({
      actorId: "local-ray",
      entityId: "campaign-5",
      action: "campaign.created",
    });
  });

  test("updates an offer and records its activity", async () => {
    const provider = createLocalAdminDataProvider();

    const offer = await provider.updateOffer(
      "com-transfer-offer",
      { status: "expired", cta: "View transfer guide" },
      "local-ray",
    );

    expect(offer).toMatchObject({ status: "expired", cta: "View transfer guide" });
    expect(await provider.getOffer("com-transfer-offer")).toEqual(offer);
    expect((await provider.getActivity())[0]).toMatchObject({
      actorId: "local-ray",
      entityId: "com-transfer-offer",
      action: "offer.updated",
    });
  });

  test("updates a content entry and records its activity", async () => {
    const provider = createLocalAdminDataProvider();

    const entry = await provider.updateContentEntry(
      "market-pulse-aug-22",
      { status: "published", ctas: ["Open the transfer guide"] },
      "local-ray",
      { expectedStatus: "scheduled" },
    );

    expect(entry).toMatchObject({
      status: "published",
      ctas: ["Open the transfer guide"],
    });
    expect(await provider.getContentEntry("market-pulse-aug-22")).toEqual(entry);
    expect((await provider.getActivity())[0]).toMatchObject({
      actorId: "local-ray",
      entityId: "market-pulse-aug-22",
      action: "content.updated",
    });
  });

  test.each(["published", "draft"] as const)(
    "rejects a scheduled-content update after the entry becomes %s",
    async (status) => {
      const provider = createLocalAdminDataProvider();
      await provider.getContentEntry("market-pulse-aug-22");
      await provider.updateContentEntry(
        "market-pulse-aug-22",
        { status, title: `${status} historical post` },
        "publisher",
      );

      const conflictingUpdate = provider.updateContentEntry(
        "market-pulse-aug-22",
        { status: "scheduled", title: "Attempted stale replacement" },
        "local-ray",
        { expectedStatus: "scheduled" },
      );
      await expect(conflictingUpdate).rejects.toBeInstanceOf(ContentUpdateConflictError);
      await expect(conflictingUpdate).rejects.toMatchObject({
        name: "ContentUpdateConflictError",
        entryId: "market-pulse-aug-22",
        expectedStatus: "scheduled",
        actualStatus: status,
      });

      expect(await provider.getContentEntry("market-pulse-aug-22")).toMatchObject({
        status,
        title: `${status} historical post`,
      });
      expect((await provider.getActivity()).map((event) => event.actorId)).toEqual(["publisher"]);
    },
  );
});
