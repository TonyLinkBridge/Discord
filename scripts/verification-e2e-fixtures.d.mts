export type VerificationE2eRequest = {
  id: string;
  discordUserId: string;
  displayName: string;
  discordHandle: string;
  email: string;
  domain: string;
};

export const verificationE2eRequests: Readonly<{
  success: VerificationE2eRequest;
  forbidden: VerificationE2eRequest;
  retry: VerificationE2eRequest;
}>;
export const verificationE2eDataKey: string;

export function assertVerificationTestEnvironment(
  env: Record<string, string | undefined>,
  dependencies?: { getBranchId(databaseUrl: string): Promise<string | null> },
): Promise<{ databaseUrl: string; branchId: string }>;

export function seedVerificationE2e(
  env: Record<string, string | undefined>,
  options?: { include?: Array<"success" | "forbidden" | "retry"> },
): Promise<void>;

export function readVerificationE2eState(
  env: Record<string, string | undefined>,
  requestId: string,
): Promise<{
  status: string;
  roleAssignedAt: string | null;
  roleOperationCount: number;
  successAuditCount: number;
} | null>;

export function resetMemberSyncE2e(
  env: Record<string, string | undefined>,
): Promise<void>;
