import { after } from "next/server";

import { getDomainIntelligenceConfig } from "@/lib/domain-intelligence/config";
import { createDomainOutcomeLinks } from "@/lib/domain-intelligence/outbound-links";
import { createDomainIntelligenceRuntime } from "@/lib/domain-intelligence/runtime";
import { getDiscordRuntimeConfig } from "@/lib/discord/config";
import type { DiscordRuntimeConfig } from "@/lib/discord/config";
import {
  handleDiscordInteraction,
  type DiscordInteractionDispatch,
} from "@/lib/discord/interactions";
import { createDiscordInteractionClient } from "@/lib/discord/interaction-client";
import { verifyDiscordSignature } from "@/lib/discord/signature";
import { createVerificationRuntime } from "@/lib/verification/runtime";

type ConfiguredRoute = Extract<DiscordRuntimeConfig, { configured: true }>;
type SignatureConfig = { configured: true; publicKey: string };

export const maxDuration = 30;

export function createDiscordInteractionsPost(dependencies: {
  getConfig(): DiscordRuntimeConfig | SignatureConfig;
  handle(
    interaction: unknown,
    config: ConfiguredRoute | SignatureConfig,
  ): Promise<DiscordInteractionDispatch>;
  schedule(task: () => Promise<void>): void;
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

    const dispatch = await dependencies.handle(interaction, config);
    if (dispatch.background) dependencies.schedule(dispatch.background);
    return Response.json(dispatch.response);
  };
}

export const POST = createDiscordInteractionsPost({
  getConfig: () => getDiscordRuntimeConfig(process.env),
  schedule: (task) => after(task),
  async handle(interaction) {
    const verification = createVerificationRuntime();
    if (!verification.ready) {
      return {
        response: {
          type: 4,
          data: {
            flags: 64,
            content: "RayName verification is temporarily unavailable.",
          },
        },
      };
    }
    const domainIntelligence = createDomainIntelligenceRuntime();
    const domainConfig = getDomainIntelligenceConfig(process.env);
    return handleDiscordInteraction(interaction, {
      guildId: verification.config.guildId,
      applicationId: verification.config.applicationId,
      claimInteraction: verification.service.claimInteraction,
      getMemberVerificationState:
        verification.service.getMemberVerificationState,
      submit: verification.service.submit,
      domainService: domainIntelligence.ready
        ? domainIntelligence.service
        : null,
      interactionClient: createDiscordInteractionClient({
        apiBaseUrl: verification.config.apiBaseUrl,
      }),
      buildLinks: ({ outcome }) => domainConfig.configured
        ? createDomainOutcomeLinks({
            outcome,
            publicBaseUrl: domainConfig.publicBaseUrl,
            signingKey: domainConfig.linkSigningKey,
            now: new Date(),
          })
        : { primary: null, fullIntelligence: null },
    });
  },
});
