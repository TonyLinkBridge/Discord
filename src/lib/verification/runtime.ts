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
};

async function pingDatabase(databaseUrl: string) {
  const database = createDatabase(databaseUrl);
  await database.execute(sql`select 1`);
}

export async function resolveVerificationRuntimeAvailability(
  env: Record<string, string | undefined>,
  base: RuntimeAvailabilityBase,
  dependencies: AvailabilityDependencies = { ping: pingDatabase },
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

  return createVerificationAvailability({
    ...base,
    databaseStatus: "connected",
    discordBotConfigured: discord.configured,
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
