import "server-only";

import type { VerificationSubmission } from "./input";
import type {
  VerificationReviewRow,
  VerificationServiceDependencies,
} from "./types";

export function createVerificationService({
  repository,
  crypto,
  roleClient,
  roleId,
  now,
}: VerificationServiceDependencies) {
  async function submit(input: VerificationSubmission) {
    const encryptedEmail = crypto.encryptEmail(input.email);
    return repository.submit({
      ...input,
      encryptedEmail,
      emailLookupHash: crypto.lookupHash(input.email),
      now: now(),
    });
  }

  async function listForAdmin(): Promise<VerificationReviewRow[]> {
    return (await repository.listForAdmin()).map((request) => ({
      id: request.id,
      discordUserId: request.discordUserId,
      displayName: request.displayName,
      discordHandle: request.discordHandle,
      email: request.encryptedEmail
        ? crypto.decryptEmail(request.encryptedEmail)
        : null,
      domain: request.domain,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      roleAssignedAt: request.roleAssignedAt?.toISOString() ?? null,
      safeFailure: request.safeFailure,
    }));
  }

  async function runRoleAssignment(
    requestId: string,
    actorId: string,
    allowedStatus: "pending" | "role_failed",
  ) {
    const claimed = await repository.claimRoleAssignment({
      requestId,
      actorId,
      roleId,
      allowedStatus,
      now: now(),
    });
    if (claimed.status !== "claimed") return claimed;

    const result = await roleClient.ensureRole({
      discordUserId: claimed.request.discordUserId,
      guildId: claimed.request.guildId,
      roleId,
    });
    if (result.status === "failed") {
      await repository.failRoleAssignment({
        requestId,
        operationId: claimed.operation.id,
        actorId,
        code: result.code,
        safeMessage: result.safeMessage,
        now: now(),
      });
      return {
        status: "role-failed" as const,
        message: result.safeMessage,
        retryable: result.retryable,
      };
    }

    await repository.completeRoleAssignment({
      requestId,
      operationId: claimed.operation.id,
      actorId,
      now: now(),
    });
    const notification = await roleClient.notifyReviewOutcome({
      discordUserId: claimed.request.discordUserId,
      outcome: "approved",
    });
    if (notification.status === "failed") {
      await repository.recordNotificationFailure({
        requestId,
        actorId,
        code: notification.code,
        safeMessage: notification.safeMessage,
        now: now(),
      });
    }
    return { status: "approved" as const };
  }

  async function reject(requestId: string, actorId: string, reason: string) {
    const normalizedReason = reason.trim();
    if (!normalizedReason || normalizedReason.length > 500) {
      throw new Error("Rejection reason must be between 1 and 500 characters");
    }
    const result = await repository.reject({
      requestId,
      actorId,
      reason: normalizedReason,
      now: now(),
    });
    if (result !== "rejected") return { status: result };

    const request = (await repository.listForAdmin()).find(
      ({ id }) => id === requestId,
    );
    if (request) {
      const notification = await roleClient.notifyReviewOutcome({
        discordUserId: request.discordUserId,
        outcome: "rejected",
        safeReason: normalizedReason,
      });
      if (notification.status === "failed") {
        await repository.recordNotificationFailure({
          requestId,
          actorId,
          code: notification.code,
          safeMessage: notification.safeMessage,
          now: now(),
        });
      }
    }
    return { status: "rejected" as const };
  }

  return {
    claimInteraction: repository.claimInteraction.bind(repository),
    getMemberVerificationState:
      repository.getMemberVerificationState.bind(repository),
    submit,
    listForAdmin,
    approve: (requestId: string, actorId: string) =>
      runRoleAssignment(requestId, actorId, "pending"),
    retryRole: (requestId: string, actorId: string) =>
      runRoleAssignment(requestId, actorId, "role_failed"),
    reject,
    purgeExpiredSensitiveData: (date = now()) =>
      repository.purgeExpiredSensitiveData(date),
  };
}

export type VerificationService = ReturnType<typeof createVerificationService>;
