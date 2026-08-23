import { CapabilityBoundary } from "@/components/data-state/data-unavailable";
import { MembersScreen } from "@/features/members/members-screen";
import { VerificationQueue } from "@/features/members/verification-queue";
import { getAdminAuthEnvironment, getAuthenticatedDiscordUserId } from "@/lib/auth";
import { requireAdminActor } from "@/lib/require-admin-actor";
import { createVerificationRuntime } from "@/lib/verification/runtime";

import {
  approveVerification,
  rejectVerification,
  retryVerificationRole,
} from "../verification-actions";

export default async function MembersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ member?: string | string[] }>;
}>) {
  const requestedMember = (await searchParams).member;
  const runtime = createVerificationRuntime();
  const verificationRows = runtime.ready
    ? await requireAdminActor({
        getAuthenticatedUserId: getAuthenticatedDiscordUserId,
        getEnvironment: getAdminAuthEnvironment,
      }).then(() => runtime.service.listForAdmin())
    : [];

  return (
    <>
      <CapabilityBoundary
        capability="review-verifications"
        description="Connect Neon and the Discord bot to review real verification requests."
        title="Verification queue is not connected"
      >
        <VerificationQueue
          actions={{
            approve: approveVerification,
            reject: rejectVerification,
            retry: retryVerificationRole,
          }}
          rows={verificationRows}
        />
      </CapabilityBoundary>
      <CapabilityBoundary
        capability="read-members"
        description="Connect Discord member sync to use the member directory and member tools."
        title="Member data is not connected"
      >
        <MembersScreen
          initialSelectedMemberId={
            typeof requestedMember === "string" ? requestedMember : null
          }
        />
      </CapabilityBoundary>
    </>
  );
}
