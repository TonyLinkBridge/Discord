import { describe, expect, test } from "vitest";

import { EntityNotFoundError, createLocalAdminDataProvider } from "./local-provider";
import { ContentUpdateConflictError } from "./provider";
import { localAdminSeed } from "./seed";

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
      "168",
      "39",
      "91.4%",
      "$18,420",
    ]);
    expect(overview.trend.map((point) => point.registrations)).toEqual([
      9, 11, 15, 17, 12, 20, 84,
    ]);
  });

  test("derives selected-period Overview flows from canonical dated facts", async () => {
    const provider = createLocalAdminDataProvider();

    const overview = await provider.getOverview({
      from: "2026-08-18",
      to: "2026-08-22",
    });

    expect(overview.range).toEqual({ from: "2026-08-18", to: "2026-08-22" });
    expect(overview.trend.map((point) => point.date)).toEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
    expect(overview.metrics.find((metric) => metric.id === "registrations")?.value).toBe("148");
    expect(overview.metrics.find((metric) => metric.id === "transfers")?.value).toBe("32");
    expect(overview.metrics.find((metric) => metric.id === "attributed-revenue")?.value)
      .toBe("$14,460");
    expect(overview.campaigns.find((campaign) => campaign.id === "com-transfer-week"))
      .toMatchObject({ visitors: 2504, conversions: 60, revenue: 7395 });
  });

  test("keeps Overview period KPI totals equal to their dated trend facts", async () => {
    const provider = createLocalAdminDataProvider();
    const ranges = [
      { from: "2026-08-16", to: "2026-08-22" },
      { from: "2026-08-18", to: "2026-08-22" },
      { from: "2026-08-01", to: "2026-08-22" },
    ];

    for (const range of ranges) {
      const overview = await provider.getOverview(range);
      const metricValue = (metricId: string) => overview.metrics
        .find((metric) => metric.id === metricId)?.value.replace(/[$,]/g, "");
      const trendTotal = (field: "registrations" | "transfers" | "revenue") =>
        overview.trend.reduce((total, point) => total + point[field], 0);

      expect(Number(metricValue("registrations")), JSON.stringify(range))
        .toBe(trendTotal("registrations"));
      expect(Number(metricValue("transfers")), JSON.stringify(range))
        .toBe(trendTotal("transfers"));
      expect(Number(metricValue("attributed-revenue")), JSON.stringify(range))
        .toBe(trendTotal("revenue"));
    }
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

  test("verifies a member atomically once while preserving concurrent role additions", async () => {
    const provider = createLocalAdminDataProvider(localAdminSeed);

    const firstVerification = provider.verifyMember("domainnomad", "local-ray");
    const roleUpdate = provider.updateMember(
      "domainnomad",
      { roles: ["Flipper", "VIP"] },
      "role-editor",
    );
    const duplicateVerification = provider.verifyMember("domainnomad", "local-ray");
    const [first, , duplicate] = await Promise.all([
      firstVerification,
      roleUpdate,
      duplicateVerification,
    ]);

    expect([first.status, duplicate.status]).toEqual(["verified", "already-verified"]);
    expect(await provider.getMember("domainnomad")).toMatchObject({
      customerStatus: "Verified customer",
      roles: ["Flipper", "Verified", "VIP"],
      verified: true,
    });
    expect(
      (await provider.getActivity())
        .filter((event) => event.entityId === "domainnomad")
        .map((event) => [event.actorId, event.action]),
    ).toEqual([
      ["role-editor", "member.updated"],
      ["local-ray", "member.updated"],
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
        href: "/members?member=alex-chen",
      },
      {
        id: "alex-chen",
        type: "Lead",
        primary: "Alex Chen",
        secondary: "Investor · Very High intent",
        href: "/leads?lead=alex-chen",
      },
    ]);
    expect(await provider.search("transfer")).toContainEqual({
      id: "com-transfer-week",
      type: "Campaign",
      primary: ".com Transfer Week",
      secondary: "Drive .com transfers",
      href: "/campaigns?campaign=com-transfer-week",
    });
    expect(await provider.search("rayname.com")).toEqual([
      {
        id: "domain-rayname-com",
        type: "Domain",
        primary: "rayname.com",
        secondary: "RayName primary domain",
        href: "https://www.rayname.com/domain/search",
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

    const preLaunch = await provider.getAnalytics({ from: "2026-08-01", to: "2026-08-15" });
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
    expect(preLaunch.campaignAttribution).toEqual([
      expect.objectContaining({
        endDate: "2026-08-15",
        id: "early-august-portfolio",
        revenue: 4560,
        startDate: "2026-08-01",
      }),
    ]);
    expect(preLaunch.campaignAttribution.some((campaign) => campaign.id === "com-transfer-week"))
      .toBe(false);
    expect(monthToDate.campaignAttribution.find((campaign) => campaign.id === "com-transfer-week"))
      .toMatchObject({ revenue: 9420, visitors: 2842 });
    expect(monthToDate.campaignAttribution.reduce((sum, campaign) => sum + campaign.revenue, 0))
      .toBe(22980);
    expect(approvedWeek.campaignAttribution.some((campaign) => campaign.id === "early-august-portfolio"))
      .toBe(false);
    expect(monthToDate.funnel[0].value).toBeGreaterThan(8742);
    expect(new Set([
      monthToDate.campaignAttribution.reduce((sum, campaign) => sum + campaign.revenue, 0),
      approvedWeek.campaignAttribution.reduce((sum, campaign) => sum + campaign.revenue, 0),
      recentFiveDays.campaignAttribution.reduce((sum, campaign) => sum + campaign.revenue, 0),
    ]).size).toBe(3);
  });

  test("returns genuine single-day campaign activity at historical and current boundaries", async () => {
    const provider = createLocalAdminDataProvider();
    const cases = [
      ["2026-08-01", "early-august-portfolio", 45, 1, 150],
      ["2026-08-08", "early-august-portfolio", 60, 1, 220],
      ["2026-08-15", "early-august-portfolio", 180, 3, 590],
      ["2026-08-16", "com-transfer-week", 150, 4, 900],
      ["2026-08-19", "com-transfer-week", 280, 7, 1600],
      ["2026-08-22", "com-transfer-week", 1444, 34, 1795],
    ] as const;

    for (const [date, campaignId, visitors, conversions, revenue] of cases) {
      const snapshot = await provider.getAnalytics({ from: date, to: date });
      const campaign = snapshot.campaignAttribution.find((item) => item.id === campaignId);
      expect(campaign, `${campaignId} on ${date}`).toMatchObject({
        conversions,
        revenue,
        visitors,
      });
      expect(campaign?.conversions).toBeLessThanOrEqual(snapshot.trend[0].registrations);
      expect(campaign?.revenue).toBeLessThanOrEqual(snapshot.trend[0].revenue);
    }

    expect((await provider.getAnalytics({ from: "2026-08-15", to: "2026-08-15" }))
      .campaignAttribution.some((campaign) => campaign.id === "com-transfer-week")).toBe(false);
    expect((await provider.getAnalytics({ from: "2026-08-16", to: "2026-08-16" }))
      .campaignAttribution.some((campaign) => campaign.id === "early-august-portfolio")).toBe(false);
    expect((await provider.getAnalytics({ from: "2026-08-25", to: "2026-08-25" }))
      .campaignAttribution.some((campaign) => campaign.id === "com-transfer-week")).toBe(false);

    for (let day = 16; day <= 22; day += 1) {
      const date = `2026-08-${day}`;
      const snapshot = await provider.getAnalytics({ from: date, to: date });
      const attributed = snapshot.campaignAttribution.reduce(
        (totals, campaign) => ({
          conversions: totals.conversions + campaign.conversions,
          revenue: totals.revenue + campaign.revenue,
          visitors: totals.visitors + campaign.visitors,
        }),
        { conversions: 0, revenue: 0, visitors: 0 },
      );
      expect(attributed.conversions).toBe(snapshot.trend[0].registrations);
      expect(attributed.revenue).toBe(snapshot.trend[0].revenue);
      expect(attributed.visitors).toBeLessThanOrEqual(snapshot.funnel[0].value);
    }
  });

  test("reconciles the sum of daily campaign activity with the month-to-date range", async () => {
    const provider = createLocalAdminDataProvider();
    const rangeSnapshot = await provider.getAnalytics({
      from: "2026-08-01",
      to: "2026-08-22",
    });
    const dailyTotals = { conversions: 0, revenue: 0, visitors: 0 };

    for (let day = 1; day <= 22; day += 1) {
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      const snapshot = await provider.getAnalytics({ from: date, to: date });
      for (const campaign of snapshot.campaignAttribution) {
        dailyTotals.conversions += campaign.conversions;
        dailyTotals.revenue += campaign.revenue;
        dailyTotals.visitors += campaign.visitors;
      }
    }

    const rangeTotals = rangeSnapshot.campaignAttribution.reduce(
      (totals, campaign) => ({
        conversions: totals.conversions + campaign.conversions,
        revenue: totals.revenue + campaign.revenue,
        visitors: totals.visitors + campaign.visitors,
      }),
      { conversions: 0, revenue: 0, visitors: 0 },
    );
    expect(dailyTotals).toEqual({ conversions: 193, revenue: 22980, visitors: 9462 });
    expect(rangeTotals).toEqual(dailyTotals);
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

  test("atomically creates a campaign, tracked link, and both audit events", async () => {
    const provider = createLocalAdminDataProvider();

    const creation = await provider.createCampaignWithTrackedLink(
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
      {
        campaign: "builder-referral-push",
        content: "campaign-form",
        destination: "https://www.rayname.com/domain/search",
        medium: "community",
        source: "discord",
      },
      "local-ray",
    );
    const { campaign, trackedLink } = creation;

    expect(campaign).toMatchObject({
      id: "campaign-5",
      trackedLinkId: "tracked-link-1",
      visitors: 0,
      verifiedCustomers: 0,
      conversions: 0,
      revenue: 0,
    });
    expect((await provider.getState()).campaigns[0]).toEqual(campaign);
    expect((await provider.getState()).trackedLinks[0]).toEqual(trackedLink);
    expect(trackedLink).toMatchObject({
      id: campaign.trackedLinkId,
      url: "https://www.rayname.com/domain/search?utm_campaign=builder-referral-push&utm_content=campaign-form&utm_medium=community&utm_source=discord",
    });
    expect((await provider.getActivity()).slice(0, 2)).toMatchObject([
      { actorId: "local-ray", entityId: "tracked-link-1", action: "tracking.link.created" },
      { actorId: "local-ray", entityId: "campaign-5", action: "campaign.created" },
    ]);
  });

  test("does not partially create a campaign when its tracked link is invalid", async () => {
    const provider = createLocalAdminDataProvider();

    await expect(provider.createCampaignWithTrackedLink(
      {
        name: "Unsafe campaign",
        objective: "Reject invalid tracking",
        audience: "Builders",
        channel: "Discord",
        destination: "https://www.rayname.com/domain/search",
        startDate: "2026-08-23",
        endDate: "2026-08-30",
        status: "scheduled",
      },
      {
        campaign: "unsafe-campaign",
        content: "campaign-form",
        destination: "https://example.com/search",
        medium: "community",
        source: "discord",
      },
      "local-ray",
    )).rejects.toThrow("Tracking destinations must use HTTPS on a RayName domain.");

    const state = await provider.getState();
    expect(state.campaigns).toHaveLength(4);
    expect(state.trackedLinks).toEqual([]);
    expect(state.activity).toEqual([]);
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
