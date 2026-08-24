import { describe, expect, test, vi } from "vitest";

import { createMemberSyncRuntime } from "./runtime";

const configuredEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://rayname:secret@example.neon.tech/neondb",
  DISCORD_APPLICATION_ID: "1541013436098682942",
  DISCORD_PUBLIC_KEY: "ab".repeat(32),
  DISCORD_GUILD_ID: "1540610722281824336",
  DISCORD_VERIFIED_ROLE_ID: "1540611679023276114",
  DISCORD_BOT_TOKEN: "discord-bot-token-value-for-tests",
  VERIFICATION_DATA_KEY: Buffer.alloc(32, 4).toString("base64"),
  DISCORD_API_BASE_URL: "http://127.0.0.1:47891",
};

describe("Discord member sync runtime", () => {
  test("fails closed without the existing Discord and Neon configuration", () => {
    expect(createMemberSyncRuntime({})).toEqual({
      ready: false,
      reason: "DATABASE_URL is not configured",
    });
  });

  test("composes the service with only safe enumerable runtime details", () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const runtime = createMemberSyncRuntime(configuredEnv, fetchImpl);

    expect(runtime.ready).toBe(true);
    if (!runtime.ready) throw new Error("Expected ready runtime");
    expect(runtime.config).toEqual({
      guildId: configuredEnv.DISCORD_GUILD_ID,
      verifiedRoleId: configuredEnv.DISCORD_VERIFIED_ROLE_ID,
    });
    expect(runtime.service.sync).toBeTypeOf("function");
    expect(runtime.repository.listMembers).toBeTypeOf("function");
    const serialized = JSON.stringify(runtime);
    expect(serialized).not.toContain(configuredEnv.DISCORD_BOT_TOKEN);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain(configuredEnv.VERIFICATION_DATA_KEY);
  });

  test("rejects a non-loopback Discord API override outside production", () => {
    const runtime = createMemberSyncRuntime({
      ...configuredEnv,
      DISCORD_API_BASE_URL: "https://attacker.example/api",
    });

    expect(runtime).toEqual({
      ready: false,
      reason: "DISCORD_API_BASE_URL is invalid",
    });
  });
});
