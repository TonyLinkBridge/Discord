import type {
  ActivityEvent,
  AdminState,
  AnalyticsSnapshot,
  Campaign,
  CampaignCreationResult,
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

export type ContentUpdatePrecondition = {
  expectedStatus: ContentEntry["status"];
};

export interface MemberVerificationResult {
  member: Member;
  status: "verified" | "already-verified";
}

export class ContentUpdateConflictError extends Error {
  readonly name = "ContentUpdateConflictError";

  constructor(
    readonly entryId: string,
    readonly expectedStatus: ContentEntry["status"],
    readonly actualStatus: ContentEntry["status"],
  ) {
    super(
      `Content entry "${entryId}" has status "${actualStatus}"; expected "${expectedStatus}".`,
    );
  }
}

export interface AdminDataReader {
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
}

export interface AdminDataProvider extends AdminDataReader {
  completePriority(priorityId: string): Promise<void>;
  updateLeadAction(leadId: string, action: LeadAction): Promise<void>;
  completeLeadAction(leadId: string, action: LeadAction): Promise<Lead>;
  updateMember(memberId: string, patch: MemberPatch): Promise<Member>;
  verifyMember(memberId: string): Promise<MemberVerificationResult>;
  recordMemberAction(memberId: string, action: MemberAction): Promise<void>;
  createTrackedLink(input: TrackingInput): Promise<TrackedLink>;
  createCampaignWithTrackedLink(
    input: CampaignInput,
    tracking: TrackingInput,
  ): Promise<CampaignCreationResult>;
  updateOffer(offerId: string, patch: OfferPatch): Promise<Offer>;
  updateContentEntry(
    entryId: string,
    patch: ContentPatch,
    precondition?: ContentUpdatePrecondition,
  ): Promise<ContentEntry>;
}

export interface ActorAwareAdminDataStore extends AdminDataReader {
  completePriority(priorityId: string, actorId: string): Promise<void>;
  updateLeadAction(leadId: string, action: LeadAction, actorId: string): Promise<void>;
  completeLeadAction(leadId: string, action: LeadAction, actorId: string): Promise<Lead>;
  updateMember(memberId: string, patch: MemberPatch, actorId: string): Promise<Member>;
  verifyMember(memberId: string, actorId: string): Promise<MemberVerificationResult>;
  recordMemberAction(memberId: string, action: MemberAction, actorId: string): Promise<void>;
  createTrackedLink(input: TrackingInput, actorId: string): Promise<TrackedLink>;
  createCampaignWithTrackedLink(
    input: CampaignInput,
    tracking: TrackingInput,
    actorId: string,
  ): Promise<CampaignCreationResult>;
  updateOffer(offerId: string, patch: OfferPatch, actorId: string): Promise<Offer>;
  updateContentEntry(
    entryId: string,
    patch: ContentPatch,
    actorId: string,
    precondition?: ContentUpdatePrecondition,
  ): Promise<ContentEntry>;
}
