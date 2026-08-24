export const adminCapabilities = [
  "read-overview",
  "read-community",
  "read-members",
  "read-leads",
  "read-campaigns",
  "read-offers",
  "read-content",
  "read-analytics",
  "mutate-members",
  "mutate-leads",
  "create-tracked-links",
  "manage-campaigns",
  "manage-offers",
  "schedule-content",
  "view-notifications",
  "review-verifications",
] as const;

export type AdminCapability = (typeof adminCapabilities)[number];
export type IntegrationStatus =
  | "connected"
  | "not-connected"
  | "awaiting-access"
  | "unknown"
  | "degraded";

export type AdminAvailability = {
  dataMode: "unavailable" | "partial-live" | "live";
  capabilities: Record<AdminCapability, { available: boolean; reason: string | null }>;
  integrations: Record<
    | "discordOAuth"
    | "discordBot"
    | "discordMemberSync"
    | "database"
    | "rayNameMarketingApi"
    | "deploymentMonitoring",
    { status: IntegrationStatus; detail: string }
  >;
};

export type SafeAdminRuntimeConfig = {
  workspaceName: string;
  timezone: string;
  discordServerName: string;
  discordOAuthConfigured: boolean;
  rayNameApiConfigured: boolean;
  operatorAllowlist: string[];
};

export function createUnavailableAvailability(
  input: Pick<SafeAdminRuntimeConfig, "discordOAuthConfigured" | "rayNameApiConfigured">,
): AdminAvailability {
  const reason = "Available after the required live data integration is connected.";

  return {
    dataMode: "unavailable",
    capabilities: Object.fromEntries(
      adminCapabilities.map((capability) => [capability, { available: false, reason }]),
    ) as AdminAvailability["capabilities"],
    integrations: {
      discordOAuth: {
        status: input.discordOAuthConfigured ? "connected" : "not-connected",
        detail: input.discordOAuthConfigured
          ? "Admin sign-in configured"
          : "Admin sign-in not configured",
      },
      discordBot: {
        status: "not-connected",
        detail: "Discord bot is not connected",
      },
      discordMemberSync: {
        status: "not-connected",
        detail: "No successful member snapshot yet",
      },
      database: {
        status: "not-connected",
        detail: "Persistent database is not connected",
      },
      rayNameMarketingApi: {
        status: input.rayNameApiConfigured ? "connected" : "awaiting-access",
        detail: input.rayNameApiConfigured
          ? "API credentials configured"
          : "Marketing API access pending",
      },
      deploymentMonitoring: {
        status: "unknown",
        detail: "No deployment health provider connected",
      },
    },
  };
}

export function createVerificationAvailability(input: Pick<
  SafeAdminRuntimeConfig,
  "discordOAuthConfigured" | "rayNameApiConfigured"
> & {
  discordBotConfigured: boolean;
  databaseStatus: "connected" | "degraded" | "not-connected";
  discordMemberSync?: {
    status: "connected" | "degraded" | "not-connected";
    detail: string;
    hasSuccessfulSnapshot: boolean;
  };
}): AdminAvailability {
  const availability = createUnavailableAvailability(input);
  availability.integrations.discordBot = {
    status: input.discordBotConfigured ? "connected" : "not-connected",
    detail: input.discordBotConfigured
      ? "Discord bot configured"
      : "Discord bot is not connected",
  };
  availability.integrations.database = {
    status: input.databaseStatus,
    detail:
      input.databaseStatus === "connected"
        ? "Persistent database connected"
        : input.databaseStatus === "degraded"
          ? "Database connection failed"
          : "Persistent database is not connected",
  };
  if (input.discordMemberSync) {
    availability.integrations.discordMemberSync = {
      status: input.discordMemberSync.status,
      detail: input.discordMemberSync.detail,
    };
  }

  if (input.discordBotConfigured && input.databaseStatus === "connected") {
    availability.dataMode = "partial-live";
    availability.capabilities["review-verifications"] = {
      available: true,
      reason: null,
    };

    if (input.discordMemberSync?.hasSuccessfulSnapshot) {
      for (const capability of [
        "read-overview",
        "read-community",
        "read-members",
      ] as const) {
        availability.capabilities[capability] = {
          available: true,
          reason: null,
        };
      }
    }
  }

  return availability;
}

export function resolveRuntimeDataMode(requestedMode: string | undefined): "unavailable" {
  void requestedMode;
  return "unavailable";
}
