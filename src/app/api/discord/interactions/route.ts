import { getDiscordRuntimeConfig } from "@/lib/discord/config";
import type { DiscordRuntimeConfig } from "@/lib/discord/config";
import { verifyDiscordSignature } from "@/lib/discord/signature";

type ConfiguredRoute = Extract<DiscordRuntimeConfig, { configured: true }>;

export function createDiscordInteractionsPost(dependencies: {
  getConfig(): DiscordRuntimeConfig | { configured: true; publicKey: string };
  handle(interaction: unknown, config: ConfiguredRoute | { configured: true; publicKey: string }): Promise<unknown>;
}) {
  return async function POST(request: Request): Promise<Response> {
    const config = dependencies.getConfig();
    if (!config.configured) {
      return Response.json(
        { error: "Discord verification is unavailable" },
        { status: 503 },
      );
    }

    const body = await request.text();
    const valid = verifyDiscordSignature({
      body,
      publicKeyHex: config.publicKey,
      signatureHex: request.headers.get("x-signature-ed25519"),
      timestamp: request.headers.get("x-signature-timestamp"),
    });
    if (!valid) {
      return Response.json({ error: "Invalid request signature" }, { status: 401 });
    }

    let interaction: unknown;
    try {
      interaction = JSON.parse(body);
    } catch {
      return Response.json({ error: "Malformed interaction" }, { status: 400 });
    }

    return Response.json(await dependencies.handle(interaction, config));
  };
}

export const POST = createDiscordInteractionsPost({
  getConfig: () => getDiscordRuntimeConfig(process.env),
  async handle(interaction) {
    if (
      interaction &&
      typeof interaction === "object" &&
      "type" in interaction &&
      interaction.type === 1
    ) {
      return { type: 1 };
    }
    return {
      type: 4,
      data: {
        flags: 64,
        content: "RayName verification is temporarily unavailable.",
      },
    };
  },
});
