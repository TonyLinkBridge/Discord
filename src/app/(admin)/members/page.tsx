import { CapabilityBoundary } from "@/components/data-state/data-unavailable";
import { MemberSyncStatus } from "@/features/members/member-sync-status";
import { MembersScreen } from "@/features/members/members-screen";
import { VerificationQueue } from "@/features/members/verification-queue";
import { getAdminAuthEnvironment, getAuthenticatedDiscordUserId } from "@/lib/auth";
import {
  toMemberDirectoryRows,
  type MemberDirectoryRow,
} from "@/lib/member-sync/read-model";
import { createMemberSyncRuntime } from "@/lib/member-sync/runtime";
import type { DiscordFacts, MemberSyncViewStatus } from "@/lib/member-sync/types";
import { requireAdminActor } from "@/lib/require-admin-actor";
import { createVerificationRuntime } from "@/lib/verification/runtime";
import type { VerificationReviewRow } from "@/lib/verification/types";

import { syncDiscordMembersNow } from "../member-sync-actions";
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
  const verificationRuntime = createVerificationRuntime();
  const memberRuntime = createMemberSyncRuntime();
  let verificationRows: VerificationReviewRow[] = [];
  let memberStatus: MemberSyncViewStatus | null = null;
  let memberFacts: DiscordFacts | null = null;
  let memberRows: MemberDirectoryRow[] = [];

  if (verificationRuntime.ready || memberRuntime.ready) {
    await requireAdminActor({
      getAuthenticatedUserId: getAuthenticatedDiscordUserId,
      getEnvironment: getAdminAuthEnvironment,
    });
  }

  if (verificationRuntime.ready) {
    try {
      verificationRows = await verificationRuntime.service.listForAdmin();
    } catch {
      verificationRows = [];
    }
  }

  if (memberRuntime.ready) {
    try {
      const [status, facts, members] = await Promise.all([
        memberRuntime.repository.getLatestStatus(memberRuntime.config.guildId),
        memberRuntime.repository.getDiscordFacts(
          memberRuntime.config.guildId,
          memberRuntime.config.verifiedRoleId,
        ),
        memberRuntime.repository.listMembers(memberRuntime.config.guildId),
      ]);
      memberStatus = status;
      memberFacts = facts;
      memberRows = toMemberDirectoryRows(
        members,
        memberRuntime.config.guildId,
        memberRuntime.config.verifiedRoleId,
      );
    } catch {
      memberStatus = null;
      memberFacts = null;
      memberRows = [];
    }
  }

  return (
    <>
      {memberStatus && memberFacts ? (
        <MemberSyncStatus
          activeMemberCount={memberFacts.activeMembers}
          botCount={memberFacts.botMembers}
          status={memberStatus}
          syncAction={syncDiscordMembersNow}
        />
      ) : null}
      <CapabilityBoundary
        as="section"
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
          members={memberRows}
        />
      </CapabilityBoundary>
    </>
  );
}
