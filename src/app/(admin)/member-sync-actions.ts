"use server";

import { revalidatePath } from "next/cache";

import {
  getAdminAuthEnvironment,
  getAuthenticatedDiscordUserId,
} from "@/lib/auth";
import { createMemberSyncRuntime } from "@/lib/member-sync/runtime";
import { requireAdminActor } from "@/lib/require-admin-actor";

import {
  executeDiscordMemberSyncNow,
  type MemberSyncActionResult,
} from "./member-sync-action-core";

export type { MemberSyncActionResult } from "./member-sync-action-core";

export async function syncDiscordMembersNow(): Promise<MemberSyncActionResult> {
  return executeDiscordMemberSyncNow({
    requireActor: () =>
      requireAdminActor({
        getAuthenticatedUserId: getAuthenticatedDiscordUserId,
        getEnvironment: getAdminAuthEnvironment,
      }),
    async sync(requestedBy) {
      const runtime = createMemberSyncRuntime();
      if (!runtime.ready) {
        throw new Error("Member synchronization runtime is not connected");
      }
      return runtime.service.sync({ trigger: "manual", requestedBy });
    },
    revalidate: revalidatePath,
  });
}
