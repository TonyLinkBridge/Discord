import { normalizeDomain } from "@/lib/domain-intelligence/input";
import type {
  DomainComparisonOutcome,
  DomainIntelligenceService,
  DomainSearchOutcome,
} from "@/lib/domain-intelligence/service";
import type { VerificationSubmission } from "@/lib/verification/input";
import { verificationSubmissionSchema } from "@/lib/verification/input";
import type { SubmitVerificationResult } from "@/lib/verification/types";

import {
  renderDomainComparison,
  renderDomainOutcome,
  type DomainMessageLinks,
} from "./domain-message";
import type { DiscordInteractionClient } from "./interaction-client";

const interactionType = {
  ping: 1,
  applicationCommand: 2,
  messageComponent: 3,
  modalSubmit: 5,
} as const;

const responseType = {
  pong: 1,
  channelMessage: 4,
  deferredChannelMessage: 5,
  deferredUpdate: 6,
  modal: 9,
} as const;

const ephemeralFlag = 64;
const verifyModalId = "rayname_verify:v1";

type InteractionRecord = Record<string, unknown>;

type TextInput = {
  type: 4;
  custom_id: string;
  label: string;
  style: 1;
  required: boolean;
  max_length: number;
};

export type DiscordInteractionResponse =
  | { type: 1 }
  | { type: 4; data: { content: string; flags: 64 } }
  | { type: 5; data: { flags: 64 } }
  | { type: 6 }
  | {
      type: 9;
      data: {
        custom_id: string;
        title: string;
        components: Array<{ type: 1; components: TextInput[] }>;
      };
    };

export type DiscordInteractionDispatch = {
  response: DiscordInteractionResponse;
  background?: () => Promise<void>;
};

export type DiscordInteractionDependencies = {
  guildId: string;
  applicationId: string;
  claimInteraction(input: {
    interactionId: string;
    interactionType: number;
    discordUserId: string | null;
  }): Promise<"claimed" | "duplicate">;
  getMemberVerificationState(discordUserId: string): Promise<{
    status:
      | "none"
      | "pending"
      | "processing"
      | "role_failed"
      | "verified";
  }>;
  submit(input: VerificationSubmission): Promise<SubmitVerificationResult>;
  domainService: Pick<DomainIntelligenceService, "search" | "compare"> | null;
  interactionClient: DiscordInteractionClient;
  buildLinks(input: {
    outcome: DomainSearchOutcome;
    discordUserId: string;
  }): DomainMessageLinks;
};

function privateMessage(
  content: string,
): Extract<DiscordInteractionResponse, { type: 4 }> {
  return {
    type: responseType.channelMessage,
    data: { content, flags: ephemeralFlag },
  };
}

function immediate(
  response: DiscordInteractionResponse,
): DiscordInteractionDispatch {
  return { response };
}

function textInput(
  customId: string,
  label: string,
  required: boolean,
  maxLength: number,
): TextInput {
  return {
    type: 4,
    custom_id: customId,
    label,
    style: 1,
    required,
    max_length: maxLength,
  };
}

function actionRow(
  component: ReturnType<typeof textInput>,
): { type: 1; components: TextInput[] } {
  return { type: 1, components: [component] };
}

function verificationModal(): Extract<DiscordInteractionResponse, { type: 9 }> {
  return {
    type: responseType.modal,
    data: {
      custom_id: verifyModalId,
      title: "Verify your RayName account",
      components: [
        actionRow(
          textInput(
            "rayname_email",
            "RayName registered email",
            true,
            254,
          ),
        ),
        actionRow(
          textInput(
            "rayname_domain",
            "One RayName domain (optional)",
            false,
            253,
          ),
        ),
      ],
    },
  };
}

function record(value: unknown): InteractionRecord | null {
  return value && typeof value === "object"
    ? (value as InteractionRecord)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function memberUser(interaction: InteractionRecord) {
  const member = record(interaction.member);
  const user = record(member?.user);
  const id = string(user?.id);
  const username = string(user?.username);
  if (!id || !username) return null;
  return {
    id,
    username,
    displayName: string(user?.global_name) || username,
    roleIds: Array.isArray(member?.roles)
      ? member.roles.filter((role): role is string => typeof role === "string")
      : [],
  };
}

function domainOption(data: InteractionRecord) {
  if (!Array.isArray(data.options)) return null;
  const option = data.options
    .map(record)
    .find((candidate) =>
      candidate?.name === "domain" &&
      candidate.type === 3 &&
      typeof candidate.value === "string",
    );
  return option && typeof option.value === "string" ? option.value : null;
}

type DomainComponent =
  | {
      kind: "compare";
      requestId: string;
      ownerId: string;
      sort: "registration" | "renewal" | "transfer";
      page: number;
    }
  | { kind: "verify"; requestId: string; ownerId: string };

function domainComponent(customId: string): DomainComponent | null {
  const parts = customId.split(":");
  if (parts[0] !== "rayfox_domain") return null;
  if (
    parts[1] === "compare" &&
    parts.length === 6 &&
    /^(registration|renewal|transfer)$/.test(parts[4] ?? "") &&
    /^\d{1,3}$/.test(parts[5] ?? "")
  ) {
    const page = Number(parts[5]);
    if (page < 1 || page > 100) return null;
    return {
      kind: "compare",
      requestId: parts[2],
      ownerId: parts[3],
      sort: parts[4] as "registration" | "renewal" | "transfer",
      page,
    };
  }
  if (parts[1] === "verify" && parts.length === 4) {
    return { kind: "verify", requestId: parts[2], ownerId: parts[3] };
  }
  return null;
}

function modalFields(data: InteractionRecord): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(data.components)) return result;
  for (const rowValue of data.components) {
    const row = record(rowValue);
    if (!Array.isArray(row?.components)) continue;
    for (const componentValue of row.components) {
      const component = record(componentValue);
      const customId = string(component?.custom_id);
      const value = string(component?.value);
      if (customId && value !== null) result[customId] = value;
    }
  }
  return result;
}

function statusMessage(status: string) {
  switch (status) {
    case "verified":
      return "You already have the Verified Customer role.";
    case "role_failed":
      return "Your verification was reviewed, but role assignment needs admin attention.";
    case "processing":
      return "Your verification is currently being processed.";
    default:
      return "Your verification request is pending admin review.";
  }
}

export async function handleDiscordInteraction(
  value: unknown,
  dependencies: DiscordInteractionDependencies,
): Promise<DiscordInteractionDispatch> {
  const interaction = record(value);
  if (!interaction) return immediate(privateMessage("This interaction is not supported."));
  const type = interaction.type;
  if (type === interactionType.ping) {
    return immediate({ type: responseType.pong });
  }

  const id = string(interaction.id);
  const user = memberUser(interaction);
  if (!id) return immediate(privateMessage("This interaction is not supported."));
  const claimed = await dependencies.claimInteraction({
    interactionId: id,
    interactionType: typeof type === "number" ? type : 0,
    discordUserId: user?.id ?? null,
  });
  if (claimed === "duplicate") {
    return immediate(privateMessage("This interaction was already handled."));
  }

  if (interaction.guild_id !== dependencies.guildId || !user) {
    return immediate(
      privateMessage("Verification is available only in RayName Domain Club."),
    );
  }
  const data = record(interaction.data);
  if (!data) return immediate(privateMessage("This interaction is not supported."));

  if (type === interactionType.applicationCommand) {
    if (data.name === "domain") {
      const rawDomain = domainOption(data);
      const normalized = rawDomain ? normalizeDomain(rawDomain) : null;
      const token = string(interaction.token);
      if (!normalized?.valid || !token) {
        return immediate(privateMessage(
          "Try a domain like `lucidgrid.ai` — no protocol, path, or spaces.",
        ));
      }
      if (!dependencies.domainService) {
        return immediate(privateMessage(
          "RayFox Domain Intelligence isn’t available here yet.",
        ));
      }

      const searchInput = {
        interactionId: id,
        guildId: dependencies.guildId,
        discordUserId: user.id,
        roleIds: user.roleIds,
        rawDomain: normalized.domain.ascii,
      };
      return {
        response: {
          type: responseType.deferredChannelMessage,
          data: { flags: ephemeralFlag },
        },
        async background() {
          try {
            const outcome = await dependencies.domainService!.search(searchInput);
            const links = dependencies.buildLinks({
              outcome,
              discordUserId: user.id,
            });
            await dependencies.interactionClient.editOriginal({
              applicationId: dependencies.applicationId,
              interactionToken: token,
              message: renderDomainOutcome(outcome, {
                ...links,
                componentOwnerId: user.id,
              }),
            });
          } catch {
            const unavailable: DomainSearchOutcome = {
              status: "unavailable",
              safeMessage: "RayName pricing is temporarily unavailable",
              retryable: true,
            };
            await dependencies.interactionClient.editOriginal({
              applicationId: dependencies.applicationId,
              interactionToken: token,
              message: renderDomainOutcome(unavailable, {
                primary: null,
                fullIntelligence: null,
              }),
            }).catch(() => undefined);
          }
        },
      };
    }

    if (data.name !== "verify") {
      return immediate(privateMessage("This command is not supported."));
    }
    const state = await dependencies.getMemberVerificationState(user.id);
    return immediate(
      state.status === "none"
        ? verificationModal()
        : privateMessage(statusMessage(state.status)),
    );
  }

  if (type === interactionType.messageComponent) {
    const component = domainComponent(string(data.custom_id) ?? "");
    if (!component) {
      return immediate(privateMessage("This control is no longer available."));
    }
    if (component.ownerId !== user.id) {
      return immediate(privateMessage("That control belongs to another member."));
    }
    if (component.kind === "verify") {
      const state = await dependencies.getMemberVerificationState(user.id);
      return immediate(
        state.status === "none"
          ? verificationModal()
          : privateMessage(statusMessage(state.status)),
      );
    }

    const token = string(interaction.token);
    if (!token || !dependencies.domainService) {
      return immediate(privateMessage("This control is no longer available."));
    }
    return {
      response: { type: responseType.deferredUpdate },
      async background() {
        let outcome: DomainComparisonOutcome;
        try {
          outcome = await dependencies.domainService!.compare({
            requestId: component.requestId,
            discordUserId: user.id,
            roleIds: user.roleIds,
            sort: component.sort,
            page: component.page,
          });
        } catch {
          outcome = {
            status: "unavailable",
            safeMessage: "RayName pricing is temporarily unavailable",
          };
        }
        await dependencies.interactionClient.editOriginal({
          applicationId: dependencies.applicationId,
          interactionToken: token,
          message: renderDomainComparison(outcome, component.ownerId),
        }).catch(() => undefined);
      },
    };
  }

  if (type === interactionType.modalSubmit && data.custom_id === verifyModalId) {
    const fields = modalFields(data);
    const parsed = verificationSubmissionSchema.safeParse({
      discordUserId: user.id,
      guildId: dependencies.guildId,
      displayName: user.displayName,
      discordHandle: user.username,
      email: fields.rayname_email,
      domain: fields.rayname_domain ?? "",
    });
    if (!parsed.success) {
      return immediate(privateMessage(
        "Please enter a valid RayName email and optional domain, then try again.",
      ));
    }
    const submitted = await dependencies.submit(parsed.data);
    if (submitted.status === "already-verified") {
      return immediate(privateMessage(statusMessage("verified")));
    }
    return immediate(privateMessage(statusMessage(submitted.requestStatus)));
  }

  return immediate(privateMessage("This interaction is not supported."));
}
