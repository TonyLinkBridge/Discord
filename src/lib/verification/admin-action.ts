import "server-only";

import { verificationReviewCommandSchema } from "@/lib/admin-data/mutation-command";

import type { VerificationService } from "./service";

type VerificationActionDependencies = {
  service: VerificationService;
  requireActor(): Promise<string>;
  revalidate(path: string): void;
};

export async function executeVerificationReview(
  input: unknown,
  dependencies: VerificationActionDependencies,
) {
  const command = verificationReviewCommandSchema.parse(input);
  const actorId = await dependencies.requireActor();
  const result =
    command.kind === "approve-verification"
      ? await dependencies.service.approve(command.requestId, actorId)
      : command.kind === "reject-verification"
        ? await dependencies.service.reject(
            command.requestId,
            actorId,
            command.reason,
          )
        : await dependencies.service.retryRole(command.requestId, actorId);

  if (result.status === "approved" || result.status === "rejected") {
    dependencies.revalidate("/members");
    return {
      ok: true as const,
      status: result.status,
      message:
        result.status === "approved"
          ? "Verified Customer role assigned."
          : "Verification request rejected.",
    };
  }

  if (result.status === "role-failed") {
    dependencies.revalidate("/members");
    return {
      ok: false as const,
      status: result.status,
      message: result.message,
    };
  }

  return {
    ok: false as const,
    status: result.status,
    message: "This verification request is no longer reviewable.",
  };
}
