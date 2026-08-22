import type {
  ActivityEvent,
  AdminState,
  AnalyticsSnapshot,
  Campaign,
  CampaignInput,
  CommunitySnapshot,
  ContentEntry,
  ContentPatch,
  DateRange,
  Lead,
  LeadAction,
  Member,
  MemberAction,
  MemberPatch,
  Offer,
  OfferPatch,
  OverviewSnapshot,
  SearchResult,
  SystemHealth,
  TrackedLink,
  TrackingInput,
  WorkspaceSettings,
} from "./types";

export interface AdminDataProvider {
  getState(): Promise<AdminState>;
  getOverview(range: DateRange): Promise<OverviewSnapshot>;
  getCommunity(): Promise<CommunitySnapshot>;
  getSystemHealth(): Promise<SystemHealth>;
  getAnalytics(range: DateRange): Promise<AnalyticsSnapshot>;
  getWorkspaceSettings(): Promise<WorkspaceSettings>;
  getActivity(): Promise<ActivityEvent[]>;
  getMember(memberId: string): Promise<Member>;
  getLead(leadId: string): Promise<Lead>;
  getCampaign(campaignId: string): Promise<Campaign>;
  getOffer(offerId: string): Promise<Offer>;
  getTrackedLink(trackedLinkId: string): Promise<TrackedLink>;
  getContentEntry(entryId: string): Promise<ContentEntry>;
  search(query: string): Promise<SearchResult[]>;
  completePriority(priorityId: string, actorId: string): Promise<void>;
  updateLeadAction(leadId: string, action: LeadAction, actorId: string): Promise<void>;
  completeLeadAction(leadId: string, action: LeadAction, actorId: string): Promise<Lead>;
  updateMember(memberId: string, patch: MemberPatch, actorId: string): Promise<Member>;
  recordMemberAction(memberId: string, action: MemberAction, actorId: string): Promise<void>;
  createTrackedLink(input: TrackingInput, actorId: string): Promise<TrackedLink>;
  createCampaign(input: CampaignInput, actorId: string): Promise<Campaign>;
  updateOffer(offerId: string, patch: OfferPatch, actorId: string): Promise<Offer>;
  updateContentEntry(entryId: string, patch: ContentPatch, actorId: string): Promise<ContentEntry>;
}
