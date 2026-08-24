import "server-only";

import type { MemberSyncRunResult } from "@/lib/member-sync/types";

export type MemberSyncActionResult =
  | { state: "idle" }
  | { state: "succeeded"; memberCount: number; completedAt: string }
  | { state: "already-running"; startedAt: string }
  | { state: "failed"; message: string; retryable: boolean };

type MemberSyncActionDependencies = {
  requireActor(): Promise<string>;
  sync(requestedBy: string): Promise<MemberSyncRunResult>;
  revalidate(path: string): void;
};

export async function executeDiscordMemberSyncNow(
  dependencies: MemberSyncActionDependencies,
): Promise<MemberSyncActionResult> {
  try {
    const actorId = await dependencies.requireActor();
    const result = await dependencies.sync(actorId);
    if (result.status === "succeeded") {
      dependencies.revalidate("/members");
      return {
        state: "succeeded",
        memberCount: result.memberCount,
        completedAt: result.completedAt,
      };
    }
    if (result.status === "already-running") {
      return { state: "already-running", startedAt: result.startedAt };
    }
    return {
      state: "failed",
      message: result.failure.safeMessage,
      retryable: result.failure.retryable,
    };
  } catch {
    return {
      state: "failed",
      message: "Unable to start member synchronization.",
      retryable: false,
    };
  }
}
