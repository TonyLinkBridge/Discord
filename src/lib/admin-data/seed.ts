import type { AdminState } from "./types";

const aug16To22Trend = [
  ["2026-08-16", 9, 3, 22, 1800],
  ["2026-08-17", 11, 4, 24, 2160],
  ["2026-08-18", 15, 5, 25, 2670],
  ["2026-08-19", 17, 6, 26, 3120],
  ["2026-08-20", 12, 5, 23, 1890],
  ["2026-08-21", 20, 7, 25, 3300],
  ["2026-08-22", 84, 9, 23, 3480],
] as const;

const aug1To15AnalyticsTrend = [
  ["2026-08-01", 4, 1, 18, 720],
  ["2026-08-02", 5, 2, 19, 840],
  ["2026-08-03", 6, 1, 17, 960],
  ["2026-08-04", 7, 2, 20, 1120],
  ["2026-08-05", 5, 2, 18, 890],
  ["2026-08-06", 8, 3, 21, 1340],
  ["2026-08-07", 9, 2, 22, 1460],
  ["2026-08-08", 6, 2, 19, 1080],
  ["2026-08-09", 7, 3, 20, 1190],
  ["2026-08-10", 8, 2, 21, 1420],
  ["2026-08-11", 9, 3, 22, 1530],
  ["2026-08-12", 10, 3, 23, 1670],
  ["2026-08-13", 7, 2, 20, 1210],
  ["2026-08-14", 11, 4, 24, 1820],
  ["2026-08-15", 12, 4, 22, 1960],
] as const;

const overviewFunnel = [
  { label: "Discord Visitors", value: 8742, conversionRate: null, delta: -5.1 },
  { label: "Verified Customers", value: 326, conversionRate: 3.7, delta: 6.6 },
  { label: "Paid Customers", value: 168, conversionRate: 51.5, delta: 11.3 },
];

const historicalAnalyticsCampaign = {
  id: "early-august-portfolio",
  name: "Early August Portfolio Push",
  objective: "Convert early August portfolio demand",
  audience: "Domain investors",
  channel: "Discord",
  destination: "https://www.rayname.com/domain/search",
  startDate: "2026-08-01",
  endDate: "2026-08-15",
  status: "completed",
  trackedLinkId: null,
  visitors: 1250,
  verifiedCustomers: 30,
  conversions: 25,
  revenue: 4560,
};

const campaignEvents = (
  campaignId: string,
  daily: readonly (readonly [string, number, number, number, number])[],
) => daily.map(([date, visitors, verifiedCustomers, conversions, revenue]) => ({
  campaignId,
  conversions,
  date,
  revenue,
  verifiedCustomers,
  visitors,
}));

const campaignAttributionEvents = [
  ...campaignEvents("early-august-portfolio", [
    ["2026-08-01", 45, 1, 1, 150],
    ["2026-08-02", 50, 1, 1, 180],
    ["2026-08-03", 55, 2, 1, 210],
    ["2026-08-04", 70, 2, 2, 260],
    ["2026-08-05", 55, 1, 1, 180],
    ["2026-08-06", 80, 2, 2, 300],
    ["2026-08-07", 90, 2, 2, 340],
    ["2026-08-08", 60, 1, 1, 220],
    ["2026-08-09", 75, 2, 2, 280],
    ["2026-08-10", 85, 2, 2, 320],
    ["2026-08-11", 90, 2, 2, 350],
    ["2026-08-12", 105, 3, 2, 400],
    ["2026-08-13", 80, 2, 1, 280],
    ["2026-08-14", 130, 3, 2, 500],
    ["2026-08-15", 180, 4, 3, 590],
  ]),
  ...campaignEvents("com-transfer-week", [
    ["2026-08-16", 150, 4, 4, 900],
    ["2026-08-17", 188, 4, 4, 1125],
    ["2026-08-18", 250, 6, 6, 1350],
    ["2026-08-19", 280, 7, 7, 1600],
    ["2026-08-20", 200, 5, 5, 950],
    ["2026-08-21", 330, 8, 8, 1700],
    ["2026-08-22", 1444, 34, 34, 1795],
  ]),
  ...campaignEvents("new-member-welcome", [
    ["2026-08-16", 100, 2, 2, 300],
    ["2026-08-17", 130, 2, 2, 371],
    ["2026-08-18", 170, 3, 3, 450],
    ["2026-08-19", 190, 3, 3, 520],
    ["2026-08-20", 135, 2, 2, 320],
    ["2026-08-21", 225, 4, 4, 550],
    ["2026-08-22", 986, 18, 18, 609],
  ]),
  ...campaignEvents("investor-outreach", [
    ["2026-08-16", 60, 1, 1, 300],
    ["2026-08-17", 74, 2, 2, 356],
    ["2026-08-18", 100, 2, 2, 450],
    ["2026-08-19", 110, 2, 2, 520],
    ["2026-08-20", 80, 1, 1, 320],
    ["2026-08-21", 130, 3, 3, 550],
    ["2026-08-22", 570, 10, 10, 554],
  ]),
  ...campaignEvents("renewal-reminder", [
    ["2026-08-16", 140, 2, 2, 300],
    ["2026-08-17", 135, 3, 3, 308],
    ["2026-08-18", 180, 4, 4, 420],
    ["2026-08-19", 220, 5, 5, 480],
    ["2026-08-20", 155, 4, 4, 300],
    ["2026-08-21", 265, 5, 5, 500],
    ["2026-08-22", 1215, 22, 22, 522],
  ]),
];

export const localAdminSeed: AdminState = {
  overview: {
    metrics: [
      { id: "discord-members", label: "Discord Members", value: "1,248", delta: 3.2, deltaLabel: "vs Aug 9–15" },
      { id: "verified-customers", label: "Verified Customers", value: "326", delta: 6.6, deltaLabel: "vs Aug 9–15" },
      { id: "registrations", label: "Registrations", value: "168", delta: 16.7, deltaLabel: "vs Aug 9–15" },
      { id: "transfers", label: "Transfers", value: "39", delta: 8.3, deltaLabel: "vs Aug 9–15" },
      { id: "renewal-rate", label: "Renewal Rate", value: "91.4%", delta: 2.1, deltaLabel: "pp vs Aug 9–15" },
      { id: "attributed-revenue", label: "Attributed Revenue", value: "$18,420", delta: 12.8, deltaLabel: "vs Aug 9–15" },
    ],
    trend: aug16To22Trend.map(([date, registrations, transfers, renewals, revenue]) => ({
      date,
      registrations,
      transfers,
      renewals,
      revenue,
    })),
    funnel: overviewFunnel.map((step) => ({ ...step })),
    priorities: [
      { id: "verify-new-members", title: "Verify 12 new members", detail: "12 joined in the last 24h", actionLabel: "Review", kind: "verification", completed: false },
      { id: "follow-up-high-intent", title: "Follow up with 7 high-intent leads", detail: "Active in #buying-domains", actionLabel: "Open leads", kind: "lead-follow-up", completed: false },
      { id: "promote-transfer-offer", title: "Promote .com transfer offer", detail: "Offer ends Aug 24, 2026", actionLabel: "View offer", kind: "offer", completed: false },
      { id: "at-risk-renewals", title: "At-risk renewals", detail: "23 domains expiring in 7 days", actionLabel: "View list", kind: "renewal", completed: false },
      { id: "review-vip-candidates", title: "Review potential VIP candidates", detail: "4 members match the current signal", actionLabel: "Review VIP", kind: "vip", completed: false },
    ],
    leads: [
      { id: "alex-chen", name: "Alex Chen", segment: "Investor", intent: "Very High", stage: "high-intent", lastActivity: "Aug 22, 9:41 AM", nextAction: "message", completedAction: null, attributedValue: 2500, source: "Discord", campaignId: "investor-outreach", portfolioSizeBand: "100–500 domains", followUpAt: "2026-08-22T14:00:00Z" },
      { id: "domainnomad", name: "DomainNomad", segment: "Flipper", intent: "Very High", stage: "high-intent", lastActivity: "Aug 22, 8:03 AM", nextAction: "follow-up", completedAction: null, attributedValue: 1800, source: "Discord", campaignId: "com-transfer-week", portfolioSizeBand: "50–99 domains", followUpAt: "2026-08-22T15:00:00Z" },
      { id: "sarah-k", name: "Sarah K.", segment: "Startup", intent: "High", stage: "engaged", lastActivity: "Aug 21, 11:28 PM", nextAction: "send-offer", completedAction: null, attributedValue: 1200, source: "Community referral", campaignId: "new-member-welcome", portfolioSizeBand: "1–10 domains", followUpAt: "2026-08-23T09:00:00Z" },
      { id: "web3builder", name: "Web3Builder", segment: "Builder", intent: "High", stage: "engaged", lastActivity: "Aug 21, 7:15 PM", nextAction: "message", completedAction: null, attributedValue: 900, source: "Discord", campaignId: "investor-outreach", portfolioSizeBand: "11–49 domains", followUpAt: "2026-08-23T11:00:00Z" },
    ],
    campaigns: [
      { id: "com-transfer-week", name: ".com Transfer Week", objective: "Drive .com transfers", audience: "Domain investors", channel: "Discord", destination: "https://www.rayname.com/domain/transfer", startDate: "2026-08-16", endDate: "2026-08-24", status: "active", trackedLinkId: null, visitors: 2842, verifiedCustomers: 68, conversions: 68, revenue: 9420 },
      { id: "new-member-welcome", name: "New Member Welcome", objective: "Convert new members", audience: "New Discord members", channel: "Discord", destination: "https://www.rayname.com/domain/search", startDate: "2026-08-16", endDate: "2026-08-31", status: "active", trackedLinkId: null, visitors: 1936, verifiedCustomers: 34, conversions: 34, revenue: 3120 },
      { id: "investor-outreach", name: "Investor Outreach", objective: "Qualify investors", audience: "Domain investors", channel: "Discord", destination: "https://www.rayname.com/domain/search", startDate: "2026-08-16", endDate: "2026-08-30", status: "active", trackedLinkId: null, visitors: 1124, verifiedCustomers: 21, conversions: 21, revenue: 3050 },
      { id: "renewal-reminder", name: "Renewal Reminder", objective: "Retain expiring domains", audience: "Existing customers", channel: "Email", destination: "https://www.rayname.com/account/renewals", startDate: "2026-08-16", endDate: "2026-08-23", status: "active", trackedLinkId: null, visitors: 2310, verifiedCustomers: 45, conversions: 45, revenue: 2830 },
    ],
  },
  members: [
    { id: "alex-chen", displayName: "Alex Chen", discordHandle: "@alexchen", verified: true, segment: "Investor", roles: ["Investor", "Verified"], registrationSource: "Discord", customerStatus: "Verified customer", vipSignal: "candidate", lastActivity: "Aug 22, 9:41 AM", notes: ["Interested in .com portfolio transfers"] },
    { id: "domainnomad", displayName: "DomainNomad", discordHandle: "@domainnomad", verified: false, segment: "Flipper", roles: ["Flipper"], registrationSource: "Discord", customerStatus: "Prospect", vipSignal: "candidate", lastActivity: "Aug 22, 8:03 AM", notes: [] },
    { id: "sarah-k", displayName: "Sarah K.", discordHandle: "@sarahk", verified: false, segment: "Startup", roles: ["Startup"], registrationSource: "Community referral", customerStatus: "Prospect", vipSignal: "none", lastActivity: "Aug 21, 11:28 PM", notes: ["Needs verification follow-up"] },
    { id: "web3builder", displayName: "Web3Builder", discordHandle: "@web3builder", verified: true, segment: "Builder", roles: ["Builder", "Verified"], registrationSource: "Discord", customerStatus: "Verified customer", vipSignal: "vip", lastActivity: "Aug 21, 7:15 PM", notes: [] },
  ],
  leads: [],
  campaigns: [],
  offers: [
    { id: "com-transfer-offer", title: ".com transfer offer", description: "Transfer eligible .com domains to RayName before Aug 24.", audience: "Domain investors", destination: "https://www.rayname.com/domain/transfer", startsAt: "2026-08-17T00:00:00Z", endsAt: "2026-08-24T23:59:59Z", cta: "Start a transfer", campaignId: "com-transfer-week", status: "active" },
  ],
  content: [
    { id: "market-pulse-aug-22", title: "Market Pulse: .com transfer signals", format: "market-pulse", conversionLevel: "education", publishAt: "2026-08-22T13:00:00Z", ctas: ["Read the transfer guide"], status: "scheduled" },
    { id: "domain-101-aug-23", title: "Domain 101: preparing a transfer", format: "domain-101", conversionLevel: "soft", publishAt: "2026-08-23T13:00:00Z", ctas: ["Check transfer eligibility"], status: "scheduled" },
    { id: "name-battle-aug-24", title: "Name Battle: exact match or brandable", format: "name-battle", conversionLevel: "education", publishAt: "2026-08-24T13:00:00Z", ctas: ["Compare the naming approaches"], status: "scheduled" },
    { id: "domain-breakdown-aug-25", title: "Domain Breakdown: two-word .coms", format: "domain-breakdown", conversionLevel: "education", publishAt: "2026-08-25T13:00:00Z", ctas: ["Read the breakdown"], status: "scheduled" },
    { id: "risk-check-aug-26", title: "Risk Check: transfer readiness", format: "risk-check", conversionLevel: "education", publishAt: "2026-08-26T13:00:00Z", ctas: ["Review the checklist"], status: "scheduled" },
    { id: "brand-launch-aug-27", title: "Brand Launch: choosing a memorable name", format: "brand-launch", conversionLevel: "soft", publishAt: "2026-08-27T13:00:00Z", ctas: ["Explore similar names"], status: "scheduled" },
    { id: "market-pulse-aug-28", title: "Friday .com transfer offer", format: "market-pulse", conversionLevel: "direct", publishAt: "2026-08-28T13:00:00Z", ctas: ["Start a transfer"], status: "scheduled" },
  ],
  trackedLinks: [],
  activity: [],
  community: {
    memberGrowth: [
      { date: "2026-08-16", totalMembers: 1209, activeMembers: 482 },
      { date: "2026-08-17", totalMembers: 1217, activeMembers: 496 },
      { date: "2026-08-18", totalMembers: 1224, activeMembers: 503 },
      { date: "2026-08-19", totalMembers: 1231, activeMembers: 517 },
      { date: "2026-08-20", totalMembers: 1236, activeMembers: 505 },
      { date: "2026-08-21", totalMembers: 1241, activeMembers: 532 },
      { date: "2026-08-22", totalMembers: 1248, activeMembers: 548 },
    ],
    roleDistribution: [
      { label: "Investor", value: 418 },
      { label: "Flipper", value: 287 },
      { label: "Startup", value: 183 },
      { label: "Builder", value: 202 },
      { label: "Beginner", value: 158 },
    ],
    channelActivity: [
      { channel: "#buying-domains", messages: 412, activeMembers: 164 },
      { channel: "#domain-discussion", messages: 336, activeMembers: 142 },
      { channel: "#introductions", messages: 186, activeMembers: 104 },
    ],
    onboarding: { started: 100, completed: 78, completionRate: 78 },
    conversion: { visitors: 8742, verifiedCustomers: 326, paidCustomers: 168 },
    discordServerUrl: "https://discord.gg/rayname",
  },
  systemHealth: {
    services: [
      { id: "discord", label: "Discord interactions", status: "operational", detail: "Commands responding normally" },
      { id: "vercel", label: "Vercel deployment", status: "operational", detail: "Latest deployment healthy" },
      { id: "database", label: "Database", status: "operational", detail: "Local provider active" },
      { id: "rayname-api", label: "RayName Marketing API", status: "awaiting-access", detail: "Awaiting access" },
    ],
    recentCommands: ["/transfer", "/verify", "/renewal"],
    scheduledJobs: ["Daily attribution rollup", "Renewal reminder"],
    failures: [],
    renewalReminderRuns: ["2026-08-22T08:00:00Z: completed"],
  },
  analytics: {
    funnel: overviewFunnel.map((step) => ({ ...step })),
    revenueBySource: [
      { label: "Discord", value: 12470 },
      { label: "Email", value: 2830 },
      { label: "Community referral", value: 3120 },
    ],
    campaignAttribution: [],
    conversionBySegment: [
      { label: "Investor", value: 68 },
      { label: "Flipper", value: 41 },
      { label: "Startup", value: 24 },
      { label: "Builder", value: 21 },
      { label: "Beginner", value: 14 },
    ],
    trend: [...aug1To15AnalyticsTrend, ...aug16To22Trend].map(
      ([date, registrations, transfers, renewals, revenue]) => ({
        date,
        registrations,
        transfers,
        renewals,
        revenue,
      }),
    ),
    leadVelocity: [
      { label: "New", value: 29 },
      { label: "Qualified", value: 18 },
      { label: "Converted", value: 12 },
    ],
    offerPerformance: [{ label: ".com transfer offer", value: 68 }],
    retentionRate: 91.4,
  },
  analyticsEvents: campaignAttributionEvents.map((event) => ({ ...event })),
  workspaceSettings: {
    workspace: { name: "RayName Discord Community", timezone: "UTC" },
    discord: { serverName: "RayName", configured: true },
    operatorAllowlist: ["local-ray"],
    rayNameApi: { status: "awaiting-access" },
    trackingDefaults: { source: "discord", medium: "community" },
    notifications: { dailySummary: true, failedJobs: true },
    dataRetentionDays: 365,
    theme: "system",
  },
};

localAdminSeed.leads = structuredClone(localAdminSeed.overview.leads);
localAdminSeed.campaigns = structuredClone(localAdminSeed.overview.campaigns);
localAdminSeed.analytics.campaignAttribution = [
  structuredClone(historicalAnalyticsCampaign),
  ...structuredClone(localAdminSeed.overview.campaigns),
];
