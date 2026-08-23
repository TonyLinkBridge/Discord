import type { AdminAvailability, AdminCapability, SafeAdminRuntimeConfig } from "./availability";
import { IntegrationUnavailableError, type ActorAwareAdminDataStore } from "./provider";
import type { AdminState, AnalyticsSemantics, DateRange, FunnelSemantics } from "./types";

const clone = <Value>(value: Value): Value => structuredClone(value);

export function createUnavailableAdminDataStore(
  availability: AdminAvailability,
  config: SafeAdminRuntimeConfig,
): ActorAwareAdminDataStore {
  const unavailableSemantics = {
    basis: "unavailable",
    label: "Data unavailable",
    description: "Available after the required live data integration is connected.",
  } as const;
  const funnelSemantics: FunnelSemantics = {
    ...unavailableSemantics,
    comparisonLabel: null,
  };
  const analyticsSemantics: AnalyticsSemantics = {
    trend: unavailableSemantics,
    campaignAttribution: unavailableSemantics,
    funnel: funnelSemantics,
    revenueBySource: unavailableSemantics,
    conversionBySegment: unavailableSemantics,
    leadVelocity: unavailableSemantics,
    offerPerformance: unavailableSemantics,
    retentionRate: unavailableSemantics,
  };
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
      services: [],
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

  const unavailable = (capability: AdminCapability): never => {
    const reason = availability.capabilities[capability].reason
      ?? "This integration is not connected.";
    throw new IntegrationUnavailableError(capability, reason);
  };

  const withRange = (range: DateRange) => ({
    ...clone(emptyState.overview),
    range: clone(range),
    funnelSemantics: clone(funnelSemantics),
  });

  return {
    availability,

    async getState() {
      return clone(emptyState);
    },
    async getOverview(range) {
      return withRange(range);
    },
    async getCommunity() {
      return clone(emptyState.community);
    },
    async getSystemHealth() {
      return clone(emptyState.systemHealth);
    },
    async getAnalytics(range) {
      return {
        ...clone(emptyState.analytics),
        range: clone(range),
        semantics: clone(analyticsSemantics),
      };
    },
    async getWorkspaceSettings() {
      return clone(emptyState.workspaceSettings);
    },
    async getActivity() {
      return [];
    },
    async getMember() {
      return unavailable("read-members");
    },
    async getLead() {
      return unavailable("read-leads");
    },
    async getCampaign() {
      return unavailable("read-campaigns");
    },
    async getOffer() {
      return unavailable("read-offers");
    },
    async getTrackedLink() {
      return unavailable("create-tracked-links");
    },
    async getContentEntry() {
      return unavailable("read-content");
    },
    async search() {
      return [];
    },
    async completePriority() {
      return unavailable("read-overview");
    },
    async updateLeadAction() {
      return unavailable("mutate-leads");
    },
    async completeLeadAction() {
      return unavailable("mutate-leads");
    },
    async updateMember() {
      return unavailable("mutate-members");
    },
    async verifyMember() {
      return unavailable("mutate-members");
    },
    async recordMemberAction() {
      return unavailable("mutate-members");
    },
    async createTrackedLink() {
      return unavailable("create-tracked-links");
    },
    async createCampaignWithTrackedLink() {
      return unavailable("manage-campaigns");
    },
    async updateOffer() {
      return unavailable("manage-offers");
    },
    async updateContentEntry() {
      return unavailable("schedule-content");
    },
  };
}
