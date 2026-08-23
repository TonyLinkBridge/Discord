import { randomUUID } from "node:crypto";

import type {
  ClaimRoleAssignmentResult,
  RoleOperationRecord,
  StoredVerificationRequest,
  SubmitVerificationInput,
  SubmitVerificationResult,
  VerificationAuditEvent,
  VerificationRepository,
} from "@/lib/verification/types";

type Member = {
  discordUserId: string;
  guildId: string;
  displayName: string;
  discordHandle: string;
  verifiedAt: Date | null;
};

const activeStatuses = new Set(["pending", "processing", "role_failed"]);
const ninetyDaysInMilliseconds = 90 * 24 * 60 * 60 * 1000;

function sensitiveExpiryFrom(reviewedAt: Date): Date {
  return new Date(reviewedAt.getTime() + ninetyDaysInMilliseconds);
}

export function createTestVerificationRepository(): VerificationRepository & {
  seedVerifiedMember(input: Member): void;
  snapshot(): {
    requests: StoredVerificationRequest[];
    roleOperations: RoleOperationRecord[];
    auditEvents: VerificationAuditEvent[];
  };
} {
  const members = new Map<string, Member>();
  const interactions = new Set<string>();
  const requests: StoredVerificationRequest[] = [];
  const roleOperations: RoleOperationRecord[] = [];
  const auditEvents: VerificationAuditEvent[] = [];

  const appendAudit = (
    input: Omit<VerificationAuditEvent, "id">,
  ): void => {
    auditEvents.push({ id: randomUUID(), ...input });
  };

  const repository = {
    seedVerifiedMember(input: Member) {
      members.set(input.discordUserId, structuredClone(input));
    },

    async claimInteraction(input: { interactionId: string }) {
      if (interactions.has(input.interactionId)) return "duplicate" as const;
      interactions.add(input.interactionId);
      return "claimed" as const;
    },

    async getMemberVerificationState(discordUserId: string) {
      const member = members.get(discordUserId);
      if (member?.verifiedAt) return { status: "verified" as const };
      const active = requests.find(
        (request) =>
          request.discordUserId === discordUserId &&
          activeStatuses.has(request.status),
      );
      if (!active) return { status: "none" as const };
      return {
        status: active.status as "pending" | "processing" | "role_failed",
      };
    },

    async submit(input: SubmitVerificationInput): Promise<SubmitVerificationResult> {
      const member = members.get(input.discordUserId);
      if (member?.verifiedAt) return { status: "already-verified" };
      members.set(input.discordUserId, {
        discordUserId: input.discordUserId,
        guildId: input.guildId,
        displayName: input.displayName,
        discordHandle: input.discordHandle,
        verifiedAt: member?.verifiedAt ?? null,
      });
      const active = requests.find(
        (request) =>
          request.discordUserId === input.discordUserId &&
          activeStatuses.has(request.status),
      );
      if (active) {
        return {
          status: "active",
          requestId: active.id,
          requestStatus: active.status as "pending" | "processing" | "role_failed",
        };
      }
      const request: StoredVerificationRequest = {
        id: randomUUID(),
        discordUserId: input.discordUserId,
        guildId: input.guildId,
        displayName: input.displayName,
        discordHandle: input.discordHandle,
        encryptedEmail: structuredClone(input.encryptedEmail),
        emailLookupHash: input.emailLookupHash,
        domain: input.domain,
        status: "pending",
        reviewReason: null,
        reviewedBy: null,
        reviewedAt: null,
        roleAssignedAt: null,
        sensitiveExpiresAt: null,
        safeFailure: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      requests.push(request);
      return {
        status: "created",
        requestId: request.id,
        requestStatus: "pending",
      };
    },

    async listForAdmin() {
      return structuredClone(requests);
    },

    async claimRoleAssignment(input: {
      requestId: string;
      actorId: string;
      roleId: string;
      allowedStatus: "pending" | "role_failed";
      now: Date;
    }): Promise<ClaimRoleAssignmentResult> {
      const request = requests.find(({ id }) => id === input.requestId);
      if (!request) return { status: "not-found" };
      if (request.status === "processing") return { status: "already-processing" };
      if (request.status === "approved") return { status: "already-approved" };
      if (request.status !== input.allowedStatus) return { status: "not-reviewable" };

      request.status = "processing";
      request.reviewedBy = input.actorId;
      request.reviewedAt = input.now;
      request.updatedAt = input.now;
      request.safeFailure = null;
      let operation = roleOperations.find(
        (candidate) =>
          candidate.verificationRequestId === request.id &&
          candidate.roleId === input.roleId &&
          candidate.operation === "assign",
      );
      if (!operation) {
        operation = {
          id: randomUUID(),
          verificationRequestId: request.id,
          discordUserId: request.discordUserId,
          roleId: input.roleId,
          operation: "assign",
          status: "pending",
          attemptCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastAttemptAt: null,
          completedAt: null,
          createdAt: input.now,
        };
        roleOperations.push(operation);
      }
      operation.status = "pending";
      operation.attemptCount += 1;
      operation.lastAttemptAt = input.now;
      operation.lastErrorCode = null;
      operation.lastErrorMessage = null;
      return {
        status: "claimed",
        request: structuredClone(request),
        operation: structuredClone(operation),
      };
    },

    async completeRoleAssignment(input: {
      requestId: string;
      operationId: string;
      actorId: string;
      now: Date;
    }) {
      const request = requests.find(({ id }) => id === input.requestId);
      const operation = roleOperations.find(({ id }) => id === input.operationId);
      if (!request || !operation || request.status !== "processing") return;
      request.status = "approved";
      request.roleAssignedAt = input.now;
      request.sensitiveExpiresAt = sensitiveExpiryFrom(input.now);
      request.updatedAt = input.now;
      operation.status = "succeeded";
      operation.completedAt = input.now;
      const member = members.get(request.discordUserId);
      if (member) member.verifiedAt = input.now;
      if (
        !auditEvents.some(
          ({ entityId, action, outcome }) =>
            entityId === request.id &&
            action === "verification.approved" &&
            outcome === "succeeded",
        )
      ) {
        appendAudit({
          actorId: input.actorId,
          entityId: request.id,
          action: "verification.approved",
          outcome: "succeeded",
          metadata: {},
          occurredAt: input.now,
        });
      }
    },

    async failRoleAssignment(input: {
      requestId: string;
      operationId: string;
      actorId: string;
      code: string;
      safeMessage: string;
      now: Date;
    }) {
      const request = requests.find(({ id }) => id === input.requestId);
      const operation = roleOperations.find(({ id }) => id === input.operationId);
      if (!request || !operation || request.status !== "processing") return;
      request.status = "role_failed";
      request.safeFailure = input.safeMessage;
      request.updatedAt = input.now;
      operation.status = "failed";
      operation.lastErrorCode = input.code;
      operation.lastErrorMessage = input.safeMessage;
      appendAudit({
        actorId: input.actorId,
        entityId: request.id,
        action: "verification.role_assignment",
        outcome: "failed",
        metadata: { code: input.code },
        occurredAt: input.now,
      });
    },

    async reject(input: {
      requestId: string;
      actorId: string;
      reason: string;
      now: Date;
    }) {
      const request = requests.find(({ id }) => id === input.requestId);
      if (!request) return "not-found" as const;
      if (!new Set(["pending", "role_failed"]).has(request.status)) {
        return "not-reviewable" as const;
      }
      request.status = "rejected";
      request.reviewReason = input.reason;
      request.reviewedBy = input.actorId;
      request.reviewedAt = input.now;
      request.sensitiveExpiresAt = sensitiveExpiryFrom(input.now);
      request.updatedAt = input.now;
      appendAudit({
        actorId: input.actorId,
        entityId: request.id,
        action: "verification.rejected",
        outcome: "succeeded",
        metadata: { reason: input.reason },
        occurredAt: input.now,
      });
      return "rejected" as const;
    },

    async recordNotificationFailure(input: {
      requestId: string;
      actorId: string;
      code: string;
      safeMessage: string;
      now: Date;
    }) {
      appendAudit({
        actorId: input.actorId,
        entityId: input.requestId,
        action: "verification.notification",
        outcome: "failed",
        metadata: { code: input.code, message: input.safeMessage },
        occurredAt: input.now,
      });
    },

    async purgeExpiredSensitiveData(now: Date) {
      let purged = 0;
      for (const request of requests) {
        if (
          request.sensitiveExpiresAt &&
          request.sensitiveExpiresAt <= now &&
          (request.encryptedEmail || request.emailLookupHash || request.domain)
        ) {
          request.encryptedEmail = null;
          request.emailLookupHash = null;
          request.domain = null;
          request.updatedAt = now;
          purged += 1;
        }
      }
      return purged;
    },

    snapshot() {
      return structuredClone({ requests, roleOperations, auditEvents });
    },
  } satisfies VerificationRepository & {
    seedVerifiedMember(input: Member): void;
    snapshot(): {
      requests: StoredVerificationRequest[];
      roleOperations: RoleOperationRecord[];
      auditEvents: VerificationAuditEvent[];
    };
  };

  return repository;
}
