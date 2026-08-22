import { buildTrackedRayNameUrl } from "../tracking";
import { ContentUpdateConflictError, type AdminDataProvider } from "./provider";
import { localAdminSeed } from "./seed";
import type {
  ActivityEvent,
  AdminState,
  AnalyticsSnapshot,
  Campaign,
  ContentEntry,
  EntityType,
  Lead,
  LeadAction,
  Member,
  Offer,
  Priority,
  TrackedLink,
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

  return {
    async getState() {
      return clone(state);
    },

    async getOverview() {
      return clone({
        ...state.overview,
        priorities: state.overview.priorities.filter((priority) => !priority.completed),
      });
    },

    async getCommunity() {
      return clone(state.community);
    },

    async getSystemHealth() {
      return clone(state.systemHealth);
    },

    async getAnalytics(range) {
      const analytics: AnalyticsSnapshot = { range: clone(range), ...state.analytics };
      return clone(analytics);
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
          href: `/members/${member.id}`,
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
          href: `/leads/${lead.id}`,
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
          href: `/campaigns/${campaign.id}`,
        }));
      const domains = [
        { id: "domain-rayname-com", type: "Domain" as const, primary: "rayname.com", secondary: "RayName primary domain", href: "/domains/rayname-com" },
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
      Object.assign(member, clone(patch));
      recordActivity(actorId, memberId, "member.updated");
      return clone(member);
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

    async createCampaign(input, actorId) {
      const campaign: Campaign = {
        ...clone(input),
        id: `campaign-${state.campaigns.length + 1}`,
        visitors: 0,
        verifiedCustomers: 0,
        conversions: 0,
        revenue: 0,
      };
      state.campaigns.unshift(campaign);
      state.overview.campaigns.unshift(clone(campaign));
      state.analytics.campaignAttribution.unshift(clone(campaign));
      recordActivity(actorId, campaign.id, "campaign.created");
      return clone(campaign);
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
