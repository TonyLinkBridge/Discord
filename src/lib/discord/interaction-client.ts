import "server-only";

import type { DiscordWebhookMessage } from "./domain-message";

export type DiscordInteractionEditResult =
  | { status: "edited" }
  | {
      status: "failed";
      code:
        | "invalid_interaction"
        | "rate_limited"
        | "timeout"
        | "discord_unavailable";
      safeMessage: string;
      retryable: boolean;
    };

export type DiscordInteractionFailure = Extract<
  DiscordInteractionEditResult,
  { status: "failed" }
>;

export type DiscordInteractionFollowupResult =
  | { status: "sent" }
  | DiscordInteractionFailure;

export interface DiscordInteractionClient {
  editOriginal(input: {
    applicationId: string;
    interactionToken: string;
    message: DiscordWebhookMessage;
  }): Promise<DiscordInteractionEditResult>;
  sendPrivateFollowup(input: {
    applicationId: string;
    interactionToken: string;
    content: string;
  }): Promise<DiscordInteractionFollowupResult>;
}

function httpFailure(status: number): DiscordInteractionFailure {
  if (status === 401 || status === 404) {
    return {
      status: "failed",
      code: "invalid_interaction",
      safeMessage: "This private Discord response is no longer available",
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      status: "failed",
      code: "rate_limited",
      safeMessage: "Discord is rate limiting response updates",
      retryable: true,
    };
  }
  return {
    status: "failed",
    code: "discord_unavailable",
    safeMessage: "Discord is temporarily unavailable",
    retryable: true,
  };
}

export function createDiscordInteractionClient(
  config: { apiBaseUrl: string },
  fetchImpl: typeof fetch = fetch,
): DiscordInteractionClient {
  return {
    async editOriginal(input) {
      try {
        const response = await fetchImpl(
          `${config.apiBaseUrl}/webhooks/${encodeURIComponent(input.applicationId)}/${encodeURIComponent(input.interactionToken)}/messages/@original`,
          {
            method: "PATCH",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input.message),
            signal: AbortSignal.timeout(10_000),
          },
        );
        return response.ok ? { status: "edited" } : httpFailure(response.status);
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          return {
            status: "failed",
            code: "timeout",
            safeMessage: "Discord response update timed out",
            retryable: true,
          };
        }
        return httpFailure(503);
      }
    },

    async sendPrivateFollowup(input) {
      try {
        const response = await fetchImpl(
          `${config.apiBaseUrl}/webhooks/${encodeURIComponent(input.applicationId)}/${encodeURIComponent(input.interactionToken)}`,
          {
            method: "POST",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: input.content, flags: 64 }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        return response.ok ? { status: "sent" } : httpFailure(response.status);
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          return {
            status: "failed",
            code: "timeout",
            safeMessage: "Discord private follow-up timed out",
            retryable: true,
          };
        }
        return httpFailure(503);
      }
    },
  };
}
