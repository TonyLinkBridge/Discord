export type DomainIntelligenceE2eMember = "normal" | "verified";

export const domainIntelligenceE2eFixture: Readonly<{
  applicationId: string;
  guildId: string;
  normalUserId: string;
  verifiedUserId: string;
  normalBetaRoleId: string;
  verifiedBetaRoleId: string;
  verifiedRoleId: string;
  publicKey: string;
}>;
export const domainIntelligenceE2eDataKey: string;
export const domainIntelligenceE2eLinkKey: string;

export function assertDomainIntelligenceTestEnvironment(
  env: Record<string, string | undefined>,
  dependencies?: { getBranchId(databaseUrl: string): Promise<string | null> },
): Promise<{ databaseUrl: string; branchId: string }>;

export function createSignedDomainInteractionRequest(input: {
  interactionId: string;
  interactionToken: string;
  member: DomainIntelligenceE2eMember;
  domain: string;
}): Request;

export function createSignedVerifyInteractionRequest(input: {
  interactionId: string;
  interactionToken: string;
  member: DomainIntelligenceE2eMember;
}): Request;

export function resetDomainIntelligenceE2e(
  env: Record<string, string | undefined>,
): Promise<void>;

export function readDomainIntelligenceE2eState(
  env: Record<string, string | undefined>,
  discordUserId: string,
): Promise<{
  succeeded: number;
  failed: number;
  quotaRejected: number;
  conversions: number;
}>;
