import { buildTrackedRayNameUrl } from "../tracking";
import { ContentUpdateConflictError, type AdminDataProvider } from "./provider";
import { localAdminSeed } from "./seed";
import type {
  ActivityEvent,
  AdminState,
  AnalyticsSnapshot,
  Campaign,
  CampaignCreationResult,
  ContentEntry,
  EntityType,
  Lead,
  LeadAction,
  Member,
  Offer,
  Priority,
  TrackedLink,
  TrendPoint,
} from "./types";

export class EntityNotFoundError extends Error {
  readonly name = "EntityNotFoundError";

  constructor(
    readonly entityType: EntityType,
    readonly entityId: string,
  ) {
    super(`No ${entityType} exists with id \"${entityId}\".`);
  }
}

const clone = <Value>(value: Value): Value => structuredClone(value);

const requiredEntity = <Value>(
  entity: Value | undefined,
  entityType: EntityType,
  entityId: string,
): Value => {
  if (!entity) {
    throw new EntityNotFoundError(entityType, entityId);
  }

  return entity;
};

const activityTimestamp = (sequence: number) =>
  `2026-08-22T12:${String(Math.floor(sequence / 60)).padStart(2, "0")}:${String(sequence % 60).padStart(2, "0")}.000Z`;

const approvedAnalyticsBaseline = { from: "2026-08-16", to: "2026-08-22" } as const;

const inRange = (date: string, range: { from: string; to: string }) =>
  date >= range.from && date <= range.to;

const sumBy = <Value>(values: readonly Value[], read: (value: Value) => number) =>
  values.reduce((sum, value) => sum + read(value), 0);

const scaledCount = (value: number, ratio: number) => Math.round(value * ratio);

const formatCount = (value: number) => value.toLocaleString("en-US");

const formatCurrency = (value: number) => new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
}).format(value);

const rangeLengthInDays = (range: { from: string; to: string }) => {
  const from = new Date(`${range.from}T00:00:00Z`).getTime();
  const to = new Date(`${range.to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
};

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const previousRange = (range: { from: string; to: string }) => {
  const days = rangeLengthInDays(range);
  return { from: shiftDate(range.from, -days), to: shiftDate(range.from, -1) };
};

const percentageChange = (current: number, previous: number) =>
  previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : null;

export function createLocalAdminDataProvider(seed: AdminState = localAdminSeed): AdminDataProvider {
  const state = clone(seed);

  const recordActivity = (actorId: string, entityId: string, action: string): void => {
    const sequence = state.activity.length + 1;
    const event: ActivityEvent = {
      id: `activity-${sequence}`,
      actorId,
      entityId,
      action,
      occurredAt: activityTimestamp(sequence),
    };

    state.activity.unshift(event);
  };

  const priorityById = (priorityId: string): Priority =>
    requiredEntity(
      state.overview.priorities.find((priority) => priority.id === priorityId),
      "priority",
      priorityId,
    );
  const memberById = (memberId: string): Member =>
    requiredEntity(state.members.find((member) => member.id === memberId), "member", memberId);
  const leadById = (leadId: string): Lead =>
    requiredEntity(state.leads.find((lead) => lead.id === leadId), "lead", leadId);
  const syncOverviewLead = (lead: Lead): void => {
    const overviewLead = state.overview.leads.find((item) => item.id === lead.id);
    if (overviewLead) {
      overviewLead.nextAction = lead.nextAction;
      overviewLead.completedAction = lead.completedAction;
      overviewLead.stage = lead.stage;
    }
  };
  const applyLeadAction = (leadId: string, action: LeadAction): Lead => {
    const lead = leadById(leadId);
    lead.nextAction = action;
    lead.completedAction = null;
    if (action === "mark-converted") {
      lead.stage = "converted";
    }

    syncOverviewLead(lead);
    return lead;
  };
  const campaignById = (campaignId: string): Campaign =>
    requiredEntity(
      state.campaigns.find((campaign) => campaign.id === campaignId),
      "campaign",
      campaignId,
    );
  const offerById = (offerId: string): Offer =>
    requiredEntity(state.offers.find((offer) => offer.id === offerId), "offer", offerId);
  const trackedLinkById = (trackedLinkId: string): TrackedLink =>
    requiredEntity(
      state.trackedLinks.find((link) => link.id === trackedLinkId),
      "tracked-link",
      trackedLinkId,
    );
  const contentById = (entryId: string): ContentEntry =>
    requiredEntity(state.content.find((entry) => entry.id === entryId), "content", entryId);

  const analyticsForRange = (range: { from: string; to: string }): AnalyticsSnapshot => {
    const trend = state.analytics.trend.filter((point) => inRange(point.date, range));
    const baselineTrend = state.analytics.trend.filter((point) =>
      inRange(point.date, approvedAnalyticsBaseline),
    );
    const baselineRegistrations = sumBy(baselineTrend, (point) => point.registrations);
    const baselineRevenue = sumBy(baselineTrend, (point) => point.revenue);
    const activityRatio = baselineRegistrations
      ? sumBy(trend, (point) => point.registrations) / baselineRegistrations
      : 0;
    const revenueRatio = baselineRevenue
      ? sumBy(trend, (point) => point.revenue) / baselineRevenue
      : 0;
    const funnel = state.analytics.funnel.map((step) => ({
      ...step,
      value: scaledCount(step.value, activityRatio),
    }));
    funnel.forEach((step, index) => {
      if (index === 0) {
        step.conversionRate = null;
        return;
      }
      const previousValue = funnel[index - 1].value;
      step.conversionRate = previousValue
        ? Number(((step.value / previousValue) * 100).toFixed(1))
        : 0;
    });
    const campaignAttribution = state.analytics.campaignAttribution.flatMap((campaign) => {
      const events = state.analyticsEvents.filter((event) =>
        event.campaignId === campaign.id
        && inRange(event.date, range)
        && event.date >= campaign.startDate
        && event.date <= campaign.endDate,
      );
      if (!events.length) return [];
      return [{
        ...campaign,
        visitors: sumBy(events, (event) => event.visitors),
        verifiedCustomers: sumBy(events, (event) => event.verifiedCustomers),
        conversions: sumBy(events, (event) => event.conversions),
        revenue: sumBy(events, (event) => event.revenue),
      }];
    });

    return {
      range: clone(range),
      funnel,
      revenueBySource: state.analytics.revenueBySource.map((item) => ({
        ...item,
        value: scaledCount(item.value, revenueRatio),
      })),
      campaignAttribution,
      conversionBySegment: state.analytics.conversionBySegment.map((item) => ({
        ...item,
        value: scaledCount(item.value, activityRatio),
      })),
      trend,
      leadVelocity: state.analytics.leadVelocity.map((item) => ({
        ...item,
        value: scaledCount(item.value, activityRatio),
      })),
      offerPerformance: state.analytics.offerPerformance.map((item) => ({
        ...item,
        value: scaledCount(item.value, activityRatio),
      })),
      retentionRate: state.analytics.retentionRate,
    };
  };

  const flowMetric = (
    metric: AdminState["overview"]["metrics"][number],
    current: number,
    previous: number,
    value: string,
  ) => {
    const delta = percentageChange(current, previous);
    return {
      ...metric,
      value,
      delta,
      deltaLabel: delta === null ? "No prior-period data" : "vs previous equal period",
    };
  };

  const overviewMetrics = (range: { from: string; to: string }, trend: TrendPoint[]) => {
    const priorTrend = state.analytics.trend.filter((point) => inRange(point.date, previousRange(range)));
    const currentRegistrations = sumBy(trend, (point) => point.registrations);
    const currentTransfers = sumBy(trend, (point) => point.transfers);
    const currentRevenue = sumBy(trend, (point) => point.revenue);
    const previousRegistrations = sumBy(priorTrend, (point) => point.registrations);
    const previousTransfers = sumBy(priorTrend, (point) => point.transfers);
    const previousRevenue = sumBy(priorTrend, (point) => point.revenue);
    const memberSnapshot = state.community.memberGrowth
      .filter((point) => point.date <= range.to)
      .at(-1);

    return state.overview.metrics.map((metric) => {
      if (metric.id === "registrations") {
        return flowMetric(
          metric,
          currentRegistrations,
          previousRegistrations,
          formatCount(currentRegistrations),
        );
      }
      if (metric.id === "transfers") {
        return flowMetric(metric, currentTransfers, previousTransfers, formatCount(currentTransfers));
      }
      if (metric.id === "attributed-revenue") {
        return flowMetric(metric, currentRevenue, previousRevenue, formatCurrency(currentRevenue));
      }
      if (metric.id === "discord-members") {
        return {
          ...metric,
          value: memberSnapshot ? formatCount(memberSnapshot.totalMembers) : "Unavailable",
          delta: null,
          deltaLabel: memberSnapshot
            ? `Snapshot as of ${memberSnapshot.date}`
            : "No snapshot available",
        };
      }
      return {
        ...metric,
        delta: null,
        deltaLabel: "Latest available snapshot",
      };
    });
  };

  return {
    async getState() {
      return clone(state);
    },

    async getOverview(range) {
      const analytics = analyticsForRange(range);
      return clone({
        range,
        metrics: overviewMetrics(range, analytics.trend),
        trend: analytics.trend,
        funnel: analytics.funnel,
        priorities: state.overview.priorities.filter((priority) => !priority.completed),
        leads: state.overview.leads,
        campaigns: analytics.campaignAttribution,
      });
    },

    async getCommunity() {
      return clone(state.community);
    },

    async getSystemHealth() {
      return clone(state.systemHealth);
    },

    async getAnalytics(range) {
      return clone(analyticsForRange(range));
    },

    async getWorkspaceSettings() {
      return clone(state.workspaceSettings);
    },

    async getActivity() {
      return clone(state.activity);
    },

    async getMember(memberId) {
      return clone(memberById(memberId));
    },

    async getLead(leadId) {
      return clone(leadById(leadId));
    },

    async getCampaign(campaignId) {
      return clone(campaignById(campaignId));
    },

    async getOffer(offerId) {
      return clone(offerById(offerId));
    },

    async getTrackedLink(trackedLinkId) {
      return clone(trackedLinkById(trackedLinkId));
    },

    async getContentEntry(entryId) {
      return clone(contentById(entryId));
    },

    async search(query) {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      if (!normalizedQuery) {
        return [];
      }

      const members = state.members
        .filter((member) =>
          [member.displayName, member.discordHandle, member.segment].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
        .map((member) => ({
          id: member.id,
          type: "Member" as const,
          primary: member.discordHandle,
          secondary: `${member.segment} · ${member.customerStatus}`,
          href: `/members?member=${encodeURIComponent(member.id)}`,
        }));
      const leads = state.leads
        .filter((lead) =>
          [lead.name, lead.segment, lead.intent].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
        .map((lead) => ({
          id: lead.id,
          type: "Lead" as const,
          primary: lead.name,
          secondary: `${lead.segment} · ${lead.intent} intent`,
          href: `/leads?lead=${encodeURIComponent(lead.id)}`,
        }));
      const campaigns = state.campaigns
        .filter((campaign) =>
          [campaign.name, campaign.objective, campaign.audience].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
        .map((campaign) => ({
          id: campaign.id,
          type: "Campaign" as const,
          primary: campaign.name,
          secondary: campaign.objective,
          href: `/campaigns?campaign=${encodeURIComponent(campaign.id)}`,
        }));
      const domains = [
        { id: "domain-rayname-com", type: "Domain" as const, primary: "rayname.com", secondary: "RayName primary domain", href: "https://www.rayname.com/domain/search" },
      ].filter((domain) =>
        [domain.primary, domain.secondary].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      );

      return clone([...members, ...leads, ...domains, ...campaigns]);
    },

    async completePriority(priorityId, actorId) {
      priorityById(priorityId).completed = true;
      recordActivity(actorId, priorityId, "priority.completed");
    },

    async updateLeadAction(leadId, action, actorId) {
      applyLeadAction(leadId, action);
      recordActivity(actorId, leadId, "lead.action.updated");
    },

    async completeLeadAction(leadId, action, actorId) {
      const lead = leadById(leadId);
      if (lead.nextAction === null && lead.completedAction === action) {
        throw new Error(`No pending ${action} action exists for ${lead.name}.`);
      }

      lead.nextAction = null;
      lead.completedAction = action;
      if (action === "mark-converted") {
        lead.stage = "converted";
      }
      syncOverviewLead(lead);
      recordActivity(actorId, leadId, "lead.action.completed");
      return clone(lead);
    },

    async updateMember(memberId, patch, actorId) {
      const member = memberById(memberId);
      const nextPatch = clone(patch);
      if (nextPatch.roles) {
        nextPatch.roles = [...new Set([...member.roles, ...nextPatch.roles])];
      }
      Object.assign(member, nextPatch);
      recordActivity(actorId, memberId, "member.updated");
      return clone(member);
    },

    async verifyMember(memberId, actorId) {
      const member = memberById(memberId);
      if (member.verified) {
        return { member: clone(member), status: "already-verified" };
      }

      member.verified = true;
      member.customerStatus = "Verified customer";
      member.roles = [...new Set([...member.roles, "Verified"])];
      recordActivity(actorId, memberId, "member.updated");
      return { member: clone(member), status: "verified" };
    },

    async recordMemberAction(memberId, action, actorId) {
      memberById(memberId);
      recordActivity(actorId, memberId, `member.${action}`);
    },

    async createTrackedLink(input, actorId) {
      const link: TrackedLink = {
        ...clone(input),
        id: `tracked-link-${state.trackedLinks.length + 1}`,
        url: buildTrackedRayNameUrl(input),
        createdAt: activityTimestamp(state.activity.length + 1),
      };
      state.trackedLinks.unshift(link);
      recordActivity(actorId, link.id, "tracking.link.created");
      return clone(link);
    },

    async createCampaignWithTrackedLink(input, tracking, actorId) {
      const trackedLinkId = `tracked-link-${state.trackedLinks.length + 1}`;
      const trackedLink: TrackedLink = {
        ...clone(tracking),
        id: trackedLinkId,
        url: buildTrackedRayNameUrl(tracking),
        createdAt: activityTimestamp(state.activity.length + 2),
      };
      const campaign: Campaign = {
        ...clone(input),
        id: `campaign-${state.campaigns.length + 1}`,
        trackedLinkId,
        visitors: 0,
        verifiedCustomers: 0,
        conversions: 0,
        revenue: 0,
      };
      state.campaigns.unshift(campaign);
      state.overview.campaigns.unshift(clone(campaign));
      state.analytics.campaignAttribution.unshift(clone(campaign));
      state.trackedLinks.unshift(trackedLink);
      recordActivity(actorId, campaign.id, "campaign.created");
      recordActivity(actorId, trackedLink.id, "tracking.link.created");
      const result: CampaignCreationResult = { campaign, trackedLink };
      return clone(result);
    },

    async updateOffer(offerId, patch, actorId) {
      const offer = offerById(offerId);
      Object.assign(offer, clone(patch));
      recordActivity(actorId, offerId, "offer.updated");
      return clone(offer);
    },

    async updateContentEntry(entryId, patch, actorId, precondition) {
      const entry = contentById(entryId);
      if (precondition && entry.status !== precondition.expectedStatus) {
        throw new ContentUpdateConflictError(
          entryId,
          precondition.expectedStatus,
          entry.status,
        );
      }
      Object.assign(entry, clone(patch));
      recordActivity(actorId, entryId, "content.updated");
      return clone(entry);
    },
  };
}
