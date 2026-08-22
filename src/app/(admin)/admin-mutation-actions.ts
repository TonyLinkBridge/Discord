"use server";

import { authorizeAdminMutationRequest } from "@/lib/admin-data/authorize-admin-mutation";
import { getAdminAuthEnvironment, getAuthenticatedDiscordUserId } from "@/lib/auth";
import { requireAdminActor } from "@/lib/require-admin-actor";

export async function authorizeAdminMutation(input: unknown) {
  return authorizeAdminMutationRequest(input, () => requireAdminActor({
    getAuthenticatedUserId: getAuthenticatedDiscordUserId,
    getEnvironment: getAdminAuthEnvironment,
  }));
}
