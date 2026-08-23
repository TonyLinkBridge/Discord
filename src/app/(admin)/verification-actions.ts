"use server";

import { revalidatePath } from "next/cache";

import { getAdminAuthEnvironment, getAuthenticatedDiscordUserId } from "@/lib/auth";
import { requireAdminActor } from "@/lib/require-admin-actor";
import { executeVerificationReview } from "@/lib/verification/admin-action";
import { createVerificationRuntime } from "@/lib/verification/runtime";
import type { ReviewVerificationCommand } from "@/lib/verification/types";

const unavailableResult = {
  ok: false as const,
  status: "unavailable",
  message: "Verification service is unavailable. Check the integration status.",
};

async function review(command: ReviewVerificationCommand) {
  const runtime = createVerificationRuntime();
  if (!runtime.ready) return unavailableResult;

  try {
    return await executeVerificationReview(command, {
      service: runtime.service,
      requireActor: () =>
        requireAdminActor({
          getAuthenticatedUserId: getAuthenticatedDiscordUserId,
          getEnvironment: getAdminAuthEnvironment,
        }),
      revalidate: revalidatePath,
    });
  } catch {
    return {
      ok: false as const,
      status: "failed",
      message: "Unable to update this verification request.",
    };
  }
}

export async function approveVerification(requestId: string) {
  return review({ kind: "approve-verification", requestId });
}

export async function rejectVerification(requestId: string, reason: string) {
  return review({ kind: "reject-verification", requestId, reason });
}

export async function retryVerificationRole(requestId: string) {
  return review({ kind: "retry-verification-role", requestId });
}
