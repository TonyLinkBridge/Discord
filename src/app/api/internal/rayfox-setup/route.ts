import { timingSafeEqual } from "node:crypto";
import path from "node:path";

import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

import { getDiscordRuntimeConfig } from "@/lib/discord/config";
import { runTransactionalMigrations } from "../../../../../scripts/neon-transactional-migrations.mjs";
import { registerGuildCommands } from "../../../../../scripts/register-discord-commands.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const runtime = "nodejs";

type SetupConfig =
  | { configured: false; reason: string }
  | { configured: true; setupSecret: string; previewHost: string };

type SetupResult = {
  migrations: "applied";
  commands: string[];
  interactionEndpointHost: string;
};

type SetupWorkflow = {
  migrate(): Promise<void>;
  registerCommands(): Promise<{ registered: string[] }>;
  updateInteractionEndpoint(url: string): Promise<void>;
};

const bypassPattern = /^[A-Za-z0-9_-]{24,128}$/;

function authorized(actual: string | null, secret: string): boolean {
  const expectedBytes = Buffer.from(`Bearer ${secret}`);
  const actualBytes = Buffer.from(actual ?? "");
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export function getRayfoxSetupConfig(
  env: Record<string, string | undefined>,
): SetupConfig {
  const setupSecret = env.RAYFOX_SETUP_KEY ?? "";
  const previewHost =
    env.VERCEL_BRANCH_URL?.trim() || env.VERCEL_URL?.trim() || "";
  if (
    env.VERCEL_ENV !== "preview" ||
    env.RAYFOX_DOMAIN_INTELLIGENCE_MODE !== "internal" ||
    env.RAYFOX_DOMAIN_TEST_DATA !== "enabled" ||
    setupSecret.length < 32 ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(previewHost)
  ) {
    return { configured: false, reason: "Preview setup is not configured" };
  }
  return { configured: true, setupSecret, previewHost };
}

export function createRayfoxSetupPost(dependencies: {
  getConfig(): SetupConfig;
  run(input: { interactionEndpointUrl: string }): Promise<SetupResult>;
}) {
  return async function POST(request: Request): Promise<Response> {
    const config = dependencies.getConfig();
    if (!config.configured) {
      return Response.json(
        { error: "RayFox setup is unavailable" },
        { status: 503 },
      );
    }
    if (!authorized(request.headers.get("authorization"), config.setupSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bypassSecret = new URL(request.url).searchParams.get(
      "x-vercel-protection-bypass",
    );
    if (!bypassSecret || !bypassPattern.test(bypassSecret)) {
      return Response.json(
        { error: "Invalid setup request" },
        { status: 400 },
      );
    }

    const interactionEndpoint = new URL(
      "/api/discord/interactions",
      `https://${config.previewHost}`,
    );
    interactionEndpoint.searchParams.set(
      "x-vercel-protection-bypass",
      bypassSecret,
    );

    try {
      return Response.json(
        await dependencies.run({
          interactionEndpointUrl: interactionEndpoint.toString(),
        }),
      );
    } catch {
      return Response.json(
        { error: "RayFox setup failed" },
        { status: 503 },
      );
    }
  };
}

export async function updateDiscordInteractionEndpoint(
  input: {
    apiBaseUrl: string;
    botToken: string;
    interactionEndpointUrl: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `${input.apiBaseUrl.replace(/\/$/, "")}/applications/@me`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${input.botToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        interactions_endpoint_url: input.interactionEndpointUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Discord application update failed: ${response.status}`);
  }
}

export async function runRayfoxSetup(
  input: { interactionEndpointUrl: string },
  workflow: SetupWorkflow,
): Promise<SetupResult> {
  await workflow.migrate();
  const { registered } = await workflow.registerCommands();
  await workflow.updateInteractionEndpoint(input.interactionEndpointUrl);
  return {
    migrations: "applied",
    commands: registered,
    interactionEndpointHost: new URL(input.interactionEndpointUrl).hostname,
  };
}

async function runConfiguredSetup(input: {
  interactionEndpointUrl: string;
}): Promise<SetupResult> {
  const discord = getDiscordRuntimeConfig(process.env);
  if (!discord.configured) {
    throw new Error("Discord runtime is not configured");
  }

  return runRayfoxSetup(input, {
    async migrate() {
      const migrations = readMigrationFiles({
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
      await runTransactionalMigrations(neon(discord.databaseUrl), migrations);
    },
    registerCommands: () => registerGuildCommands(process.env),
    updateInteractionEndpoint: (interactionEndpointUrl) =>
      updateDiscordInteractionEndpoint({
        apiBaseUrl: discord.apiBaseUrl,
        botToken: discord.botToken,
        interactionEndpointUrl,
      }),
  });
}

export const POST = createRayfoxSetupPost({
  getConfig: () => getRayfoxSetupConfig(process.env),
  run: runConfiguredSetup,
});
