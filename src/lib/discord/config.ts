import "server-only";

import { getDatabaseConfig } from "@/lib/database/config";

const discordIdPattern = /^\d{17,20}$/;
const publicKeyPattern = /^[0-9a-f]{64}$/i;

export type DiscordRuntimeConfig =
  | { configured: false; reason: string }
  | {
      configured: true;
      readonly applicationId: string;
      readonly publicKey: string;
      readonly guildId: string;
      readonly roleId: string;
      readonly botToken: string;
      readonly databaseUrl: string;
      readonly verificationDataKey: string;
      readonly apiBaseUrl: string;
      safe: {
        applicationId: string;
        guildId: string;
        roleId: string;
        databaseHost: string;
      };
    };

function unavailable(reason: string): DiscordRuntimeConfig {
  return { configured: false, reason };
}

export function getDiscordRuntimeConfig(
  env: Record<string, string | undefined>,
): DiscordRuntimeConfig {
  const database = getDatabaseConfig(env);
  if (!database.configured) return unavailable(database.reason);

  const applicationId = env.DISCORD_APPLICATION_ID?.trim() ?? "";
  const publicKey = env.DISCORD_PUBLIC_KEY?.trim() ?? "";
  const guildId = env.DISCORD_GUILD_ID?.trim() ?? "";
  const roleId = env.DISCORD_VERIFIED_ROLE_ID?.trim() ?? "";
  const botToken = env.DISCORD_BOT_TOKEN?.trim() ?? "";
  const verificationDataKey = env.VERIFICATION_DATA_KEY?.trim() ?? "";

  if (!discordIdPattern.test(applicationId)) {
    return unavailable("DISCORD_APPLICATION_ID is invalid");
  }
  if (!publicKeyPattern.test(publicKey)) {
    return unavailable("DISCORD_PUBLIC_KEY is invalid");
  }
  if (!discordIdPattern.test(guildId)) {
    return unavailable("DISCORD_GUILD_ID is invalid");
  }
  if (!discordIdPattern.test(roleId)) {
    return unavailable("DISCORD_VERIFIED_ROLE_ID is invalid");
  }
  if (botToken.length < 20) {
    return unavailable("DISCORD_BOT_TOKEN is invalid");
  }
  if (Buffer.from(verificationDataKey, "base64").length !== 32) {
    return unavailable("VERIFICATION_DATA_KEY is invalid");
  }

  const configured = {
    configured: true as const,
    safe: {
      applicationId,
      guildId,
      roleId,
      databaseHost: database.safe.host,
    },
  } as Extract<DiscordRuntimeConfig, { configured: true }>;

  const privateValues = {
    applicationId,
    publicKey,
    guildId,
    roleId,
    botToken,
    databaseUrl: database.url,
    verificationDataKey,
    apiBaseUrl: "https://discord.com/api/v10",
  };
  for (const [key, value] of Object.entries(privateValues)) {
    Object.defineProperty(configured, key, {
      configurable: false,
      enumerable: false,
      value,
      writable: false,
    });
  }

  return configured;
}
