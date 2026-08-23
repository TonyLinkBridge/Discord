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
] as const;

export type AdminCapability = (typeof adminCapabilities)[number];
export type IntegrationStatus =
  | "connected"
  | "not-connected"
  | "awaiting-access"
  | "unknown"
  | "degraded";

export type AdminAvailability = {
  dataMode: "unavailable" | "live";
  capabilities: Record<AdminCapability, { available: boolean; reason: string | null }>;
  integrations: Record<
    | "discordOAuth"
    | "discordBot"
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

export function resolveRuntimeDataMode(_requestedMode: string | undefined): "unavailable" {
  return "unavailable";
}
