import type { VerificationSubmission } from "@/lib/verification/input";
import { verificationSubmissionSchema } from "@/lib/verification/input";
import type { SubmitVerificationResult } from "@/lib/verification/types";

const interactionType = {
  ping: 1,
  applicationCommand: 2,
  modalSubmit: 5,
} as const;

const responseType = {
  pong: 1,
  channelMessage: 4,
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
  | {
      type: 9;
      data: {
        custom_id: string;
        title: string;
        components: Array<{ type: 1; components: TextInput[] }>;
      };
    };

export type DiscordInteractionDependencies = {
  guildId: string;
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
};

function privateMessage(
  content: string,
): Extract<DiscordInteractionResponse, { type: 4 }> {
  return {
    type: responseType.channelMessage,
    data: { content, flags: ephemeralFlag },
  };
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
  };
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
): Promise<DiscordInteractionResponse> {
  const interaction = record(value);
  if (!interaction) return privateMessage("This interaction is not supported.");
  const type = interaction.type;
  if (type === interactionType.ping) return { type: responseType.pong };

  const id = string(interaction.id);
  const user = memberUser(interaction);
  if (!id) return privateMessage("This interaction is not supported.");
  const claimed = await dependencies.claimInteraction({
    interactionId: id,
    interactionType: typeof type === "number" ? type : 0,
    discordUserId: user?.id ?? null,
  });
  if (claimed === "duplicate") {
    return privateMessage("This interaction was already handled.");
  }

  if (interaction.guild_id !== dependencies.guildId || !user) {
    return privateMessage("Verification is available only in RayName Domain Club.");
  }
  const data = record(interaction.data);
  if (!data) return privateMessage("This interaction is not supported.");

  if (type === interactionType.applicationCommand) {
    if (data.name !== "verify") {
      return privateMessage("This command is not supported.");
    }
    const state = await dependencies.getMemberVerificationState(user.id);
    return state.status === "none"
      ? verificationModal()
      : privateMessage(statusMessage(state.status));
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
      return privateMessage(
        "Please enter a valid RayName email and optional domain, then try again.",
      );
    }
    const submitted = await dependencies.submit(parsed.data);
    if (submitted.status === "already-verified") {
      return privateMessage(statusMessage("verified"));
    }
    return privateMessage(statusMessage(submitted.requestStatus));
  }

  return privateMessage("This interaction is not supported.");
}
