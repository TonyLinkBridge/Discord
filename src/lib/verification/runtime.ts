import "server-only";

import { sql } from "drizzle-orm";

import {
  createVerificationAvailability,
  type AdminAvailability,
  type SafeAdminRuntimeConfig,
} from "@/lib/admin-data/availability";
import { createDatabase } from "@/lib/database/client";
import { getDatabaseConfig } from "@/lib/database/config";
import { getDiscordRuntimeConfig } from "@/lib/discord/config";
import { createDiscordRoleClient } from "@/lib/discord/rest-client";
import { createMemberSyncRuntime } from "@/lib/member-sync/runtime";
import type { MemberSyncViewStatus } from "@/lib/member-sync/types";

import { createVerificationCrypto } from "./crypto";
import {
  createNeonVerificationRepository,
  type VerificationDatabase,
} from "./repository";
import { createVerificationService } from "./service";

type RuntimeAvailabilityBase = Pick<
  SafeAdminRuntimeConfig,
  "discordOAuthConfigured" | "rayNameApiConfigured"
>;

type AvailabilityDependencies = {
  ping(databaseUrl: string): Promise<void>;
  getMemberSyncStatus(
    env: Record<string, string | undefined>,
  ): Promise<MemberSyncViewStatus>;
};

async function pingDatabase(databaseUrl: string) {
  const database = createDatabase(databaseUrl);
  await database.execute(sql`select 1`);
}

async function getMemberSyncStatus(
  env: Record<string, string | undefined>,
): Promise<MemberSyncViewStatus> {
  const runtime = createMemberSyncRuntime(env);
  if (!runtime.ready) {
    return {
      state: "never",
      lastRunId: null,
      lastRunStatus: null,
      lastRunTrigger: null,
      lastRunStartedAt: null,
      lastRunCompletedAt: null,
      lastSuccessfulSyncAt: null,
      safeErrorCode: null,
      safeErrorMessage: null,
    };
  }

  return runtime.repository.getLatestStatus(runtime.config.guildId);
}

function describeMemberSync(status: MemberSyncViewStatus) {
  const hasSuccessfulSnapshot = status.lastSuccessfulSyncAt !== null;

  if (status.state === "degraded") {
    return {
      status: "degraded" as const,
      detail: hasSuccessfulSnapshot
        ? "Latest sync failed; last successful snapshot remains available"
        : "Latest member sync failed; no successful snapshot is available",
      hasSuccessfulSnapshot,
    };
  }

  if (hasSuccessfulSnapshot) {
    return {
      status: "connected" as const,
      detail: `Last member snapshot completed at ${status.lastSuccessfulSyncAt}`,
      hasSuccessfulSnapshot: true,
    };
  }

  return {
    status: "not-connected" as const,
    detail: "No successful member snapshot yet",
    hasSuccessfulSnapshot: false,
  };
}

export async function resolveVerificationRuntimeAvailability(
  env: Record<string, string | undefined>,
  base: RuntimeAvailabilityBase,
  dependencies: AvailabilityDependencies = {
    ping: pingDatabase,
    getMemberSyncStatus,
  },
): Promise<AdminAvailability> {
  const database = getDatabaseConfig(env);
  const discord = getDiscordRuntimeConfig(env);
  if (!database.configured) {
    return createVerificationAvailability({
      ...base,
      databaseStatus: "not-connected",
      discordBotConfigured: false,
    });
  }

  try {
    await dependencies.ping(database.url);
  } catch {
    return createVerificationAvailability({
      ...base,
      databaseStatus: "degraded",
      discordBotConfigured: discord.configured,
    });
  }

  let discordMemberSync: ReturnType<typeof describeMemberSync>;
  try {
    discordMemberSync = describeMemberSync(
      await dependencies.getMemberSyncStatus(env),
    );
  } catch {
    discordMemberSync = {
      status: "degraded",
      detail: "Member sync status could not be read",
      hasSuccessfulSnapshot: false,
    };
  }

  return createVerificationAvailability({
    ...base,
    databaseStatus: "connected",
    discordBotConfigured: discord.configured,
    discordMemberSync,
  });
}

export type VerificationRuntime =
  | { ready: false; reason: string }
  | {
      ready: true;
      config: Extract<ReturnType<typeof getDiscordRuntimeConfig>, { configured: true }>;
      service: ReturnType<typeof createVerificationService>;
    };

export function createVerificationRuntime(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): VerificationRuntime {
  const config = getDiscordRuntimeConfig(env);
  if (!config.configured) return { ready: false, reason: config.reason };

  const database = createDatabase(config.databaseUrl);
  const repository = createNeonVerificationRepository(
    database as unknown as VerificationDatabase,
  );
  const service = createVerificationService({
    repository,
    crypto: createVerificationCrypto(config.verificationDataKey),
    roleClient: createDiscordRoleClient(
      { apiBaseUrl: config.apiBaseUrl, botToken: config.botToken },
      fetchImpl,
    ),
    roleId: config.roleId,
    now: () => new Date(),
  });

  return { ready: true, config, service };
}
