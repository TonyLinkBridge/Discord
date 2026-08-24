import "server-only";

import { createDatabase } from "@/lib/database/client";
import { getDiscordRuntimeConfig } from "@/lib/discord/config";

import { createDiscordGuildSnapshotClient } from "./discord-client";
import {
  createNeonMemberSyncRepository,
  type MemberSyncDatabase,
} from "./repository";
import { createDiscordMemberSyncService } from "./service";
import type { MemberSyncRepository } from "./types";

export type MemberSyncRuntime =
  | { ready: false; reason: string }
  | {
      ready: true;
      config: { guildId: string; verifiedRoleId: string };
      service: ReturnType<typeof createDiscordMemberSyncService>;
      repository: MemberSyncRepository;
    };

export function createMemberSyncRuntime(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): MemberSyncRuntime {
  const discord = getDiscordRuntimeConfig(env);
  if (!discord.configured) return { ready: false, reason: discord.reason };

  const database = createDatabase(discord.databaseUrl);
  const repository = createNeonMemberSyncRepository(
    database as unknown as MemberSyncDatabase,
  );
  const service = createDiscordMemberSyncService({
    guildId: discord.guildId,
    verifiedRoleId: discord.roleId,
    client: createDiscordGuildSnapshotClient(
      { apiBaseUrl: discord.apiBaseUrl, botToken: discord.botToken },
      fetchImpl,
    ),
    repository,
    now: () => new Date(),
  });

  return {
    ready: true,
    config: { guildId: discord.guildId, verifiedRoleId: discord.roleId },
    service,
    repository,
  };
}
