export type ThemeMode = "light" | "dark" | "system";
export type LeadStage =
  | "new"
  | "engaged"
  | "high-intent"
  | "offer-sent"
  | "converted"
  | "closed";
export type LeadAction =
  | "message"
  | "follow-up"
  | "send-offer"
  | "review-vip"
  | "mark-converted";
export type DateRange = { from: string; to: string };

export interface Metric {
  id: string;
  label: string;
  value: string;
  delta: number;
  deltaLabel: string;
}

export interface TrendPoint {
  date: string;
  registrations: number;
  transfers: number;
  renewals: number;
  revenue: number;
}

export interface Priority {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  kind: string;
  completed: boolean;
}

export interface Lead {
  id: string;
  name: string;
  segment: string;
  intent: string;
  stage: LeadStage;
  lastActivity: string;
  nextAction: LeadAction;
  attributedValue: number;
  source: string;
  campaignId: string;
  portfolioSizeBand: string;
  followUpAt: string;
}

export interface Member {
  id: string;
  displayName: string;
  discordHandle: string;
  verified: boolean;
  segment: string;
  roles: string[];
  registrationSource: string;
  customerStatus: string;
  vipSignal: "none" | "candidate" | "vip";
  lastActivity: string;
  notes: string[];
}

export type MemberPatch = Partial<
  Pick<
    Member,
    "verified" | "segment" | "roles" | "customerStatus" | "vipSignal" | "notes"
  >
>;
export type MemberAction = "open-ticket" | "review-vip";

export interface TrackingInput {
  destination: string;
  campaign: string;
  source: string;
  medium: string;
  content: string;
}

export interface TrackedLink extends TrackingInput {
  id: string;
  url: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  audience: string;
  channel: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  visitors: number;
  verifiedCustomers: number;
  conversions: number;
  revenue: number;
}

export type CampaignInput = Omit<
  Campaign,
  "id" | "visitors" | "verifiedCustomers" | "conversions" | "revenue"
>;

export interface Offer {
  id: string;
  title: string;
  description: string;
  audience: string;
  destination: string;
  startsAt: string;
  endsAt: string;
  cta: string;
  campaignId: string;
  status: "draft" | "scheduled" | "active" | "expired";
}

export type OfferPatch = Partial<Omit<Offer, "id">>;

export interface ContentEntry {
  id: string;
  title: string;
  format:
    | "market-pulse"
    | "domain-101"
    | "name-battle"
    | "domain-breakdown"
    | "risk-check"
    | "brand-launch";
  conversionLevel: "education" | "soft" | "direct";
  publishAt: string;
  ctas: string[];
  status: "draft" | "scheduled" | "published";
}

export type ContentPatch = Partial<Omit<ContentEntry, "id">>;

export interface ActivityEvent {
  id: string;
  actorId: string;
  entityId: string;
  action: string;
  occurredAt: string;
}

export interface SearchResult {
  id: string;
  type: "Member" | "Lead" | "Domain" | "Campaign";
  primary: string;
  secondary: string;
  href: string;
}

export interface OverviewSnapshot {
  metrics: Metric[];
  trend: TrendPoint[];
  priorities: Priority[];
  leads: Lead[];
  campaigns: Campaign[];
}

export interface CommunityTrendPoint {
  date: string;
  totalMembers: number;
  activeMembers: number;
}

export interface DistributionItem {
  label: string;
  value: number;
}

export interface ChannelActivity {
  channel: string;
  messages: number;
  activeMembers: number;
}

export interface CommunitySnapshot {
  memberGrowth: CommunityTrendPoint[];
  roleDistribution: DistributionItem[];
  channelActivity: ChannelActivity[];
  onboarding: { started: number; completed: number; completionRate: number };
  conversion: { visitors: number; verifiedCustomers: number; paidCustomers: number };
  discordServerUrl: string;
}

export type ServiceStatus = "operational" | "degraded" | "awaiting-access";

export interface SystemService {
  id: string;
  label: string;
  status: ServiceStatus;
  detail: string;
}

export interface SystemHealth {
  services: SystemService[];
  recentCommands: string[];
  scheduledJobs: string[];
  failures: string[];
  renewalReminderRuns: string[];
}

export interface FunnelStep {
  label: string;
  value: number;
  conversionRate: number | null;
  delta: number;
}

export interface AnalyticsSnapshot {
  range: DateRange;
  funnel: FunnelStep[];
  revenueBySource: DistributionItem[];
  campaignAttribution: Campaign[];
  conversionBySegment: DistributionItem[];
  trend: TrendPoint[];
  leadVelocity: DistributionItem[];
  offerPerformance: DistributionItem[];
  retentionRate: number;
}

export interface WorkspaceSettings {
  workspace: { name: string; timezone: string };
  discord: { serverName: string; configured: boolean };
  operatorAllowlist: string[];
  rayNameApi: { status: "awaiting-access" | "configured" };
  trackingDefaults: Pick<TrackingInput, "source" | "medium">;
  notifications: { dailySummary: boolean; failedJobs: boolean };
  dataRetentionDays: number;
  theme: ThemeMode;
}

export interface AdminState {
  overview: OverviewSnapshot;
  members: Member[];
  leads: Lead[];
  campaigns: Campaign[];
  offers: Offer[];
  content: ContentEntry[];
  trackedLinks: TrackedLink[];
  activity: ActivityEvent[];
  community: CommunitySnapshot;
  systemHealth: SystemHealth;
  analytics: Omit<AnalyticsSnapshot, "range">;
  workspaceSettings: WorkspaceSettings;
}

export type EntityType =
  | "priority"
  | "member"
  | "lead"
  | "campaign"
  | "offer"
  | "tracked-link"
  | "content";
