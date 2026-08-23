import type { EncryptedEmail, VerificationCrypto } from "./crypto";
import type { VerificationSubmission } from "./input";

export type VerificationStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "role_failed";

export type ReviewVerificationCommand =
  | { kind: "approve-verification"; requestId: string }
  | { kind: "reject-verification"; requestId: string; reason: string }
  | { kind: "retry-verification-role"; requestId: string };

export type VerificationReviewRow = {
  id: string;
  discordUserId: string;
  displayName: string;
  discordHandle: string;
  email: string | null;
  domain: string | null;
  status: VerificationStatus;
  createdAt: string;
  reviewedAt: string | null;
  roleAssignedAt: string | null;
  safeFailure: string | null;
};

export type StoredVerificationRequest = {
  id: string;
  discordUserId: string;
  guildId: string;
  displayName: string;
  discordHandle: string;
  encryptedEmail: EncryptedEmail | null;
  emailLookupHash: string | null;
  domain: string | null;
  status: VerificationStatus;
  reviewReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  roleAssignedAt: Date | null;
  sensitiveExpiresAt: Date | null;
  safeFailure: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RoleOperationRecord = {
  id: string;
  verificationRequestId: string;
  discordUserId: string;
  roleId: string;
  operation: "assign" | "remove";
  status: "pending" | "succeeded" | "failed";
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastAttemptAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type VerificationAuditEvent = {
  id: string;
  actorId: string;
  entityId: string;
  action: string;
  outcome: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

export type SubmitVerificationInput = Omit<VerificationSubmission, "email"> & {
  encryptedEmail: EncryptedEmail;
  emailLookupHash: string;
  now: Date;
};

export type SubmitVerificationResult =
  | { status: "created"; requestId: string; requestStatus: "pending" }
  | {
      status: "active";
      requestId: string;
      requestStatus: "pending" | "processing" | "role_failed";
    }
  | { status: "already-verified" };

export type ClaimRoleAssignmentResult =
  | {
      status: "claimed";
      request: StoredVerificationRequest;
      operation: RoleOperationRecord;
    }
  | {
      status:
        | "already-processing"
        | "already-approved"
        | "not-reviewable"
        | "not-found";
    };

export interface VerificationRepository {
  claimInteraction(input: {
    interactionId: string;
    interactionType: number;
    discordUserId: string | null;
  }): Promise<"claimed" | "duplicate">;
  getMemberVerificationState(discordUserId: string): Promise<{
    status:
      | "none"
      | "pending"
      | "processing"
      | "role_failed"
      | "verified";
  }>;
  submit(input: SubmitVerificationInput): Promise<SubmitVerificationResult>;
  listForAdmin(): Promise<StoredVerificationRequest[]>;
  claimRoleAssignment(input: {
    requestId: string;
    actorId: string;
    roleId: string;
    allowedStatus: "pending" | "role_failed";
    now: Date;
  }): Promise<ClaimRoleAssignmentResult>;
  completeRoleAssignment(input: {
    requestId: string;
    operationId: string;
    actorId: string;
    now: Date;
  }): Promise<void>;
  failRoleAssignment(input: {
    requestId: string;
    operationId: string;
    actorId: string;
    code: string;
    safeMessage: string;
    now: Date;
  }): Promise<void>;
  reject(input: {
    requestId: string;
    actorId: string;
    reason: string;
    now: Date;
  }): Promise<"rejected" | "not-reviewable" | "not-found">;
  recordNotificationFailure(input: {
    requestId: string;
    actorId: string;
    code: string;
    safeMessage: string;
    now: Date;
  }): Promise<void>;
  purgeExpiredSensitiveData(now: Date): Promise<number>;
}

export interface DiscordRoleClient {
  ensureRole(input: {
    discordUserId: string;
    guildId: string;
    roleId: string;
  }): Promise<
    | { status: "assigned" | "already-present" }
    | {
        status: "failed";
        code: string;
        safeMessage: string;
        retryable: boolean;
      }
  >;
  notifyReviewOutcome(input: {
    discordUserId: string;
    outcome: "approved" | "rejected";
    safeReason?: string;
  }): Promise<
    | { status: "sent" }
    | { status: "failed"; code: string; safeMessage: string }
  >;
}

export type VerificationServiceDependencies = {
  repository: VerificationRepository;
  crypto: VerificationCrypto;
  roleClient: DiscordRoleClient;
  roleId: string;
  now: () => Date;
};
