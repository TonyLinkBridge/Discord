import { adminCapabilities, createUnavailableAvailability } from "@/lib/admin-data/availability";
import type { AdminAvailability } from "@/lib/admin-data/availability";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { createUnavailableAdminDataStore } from "@/lib/admin-data/unavailable-provider";
import type { AdminState } from "@/lib/admin-data/types";
import { localAdminSeed } from "@/test/fixtures/admin-state";

export const testRuntimeConfig = {
  workspaceName: "RayName Discord Community",
  timezone: "UTC",
  discordServerName: "RayName Domain Club",
  discordOAuthConfigured: true,
  rayNameApiConfigured: false,
  operatorAllowlist: ["local-ray"],
} as const;

export const connectedTestAvailability: AdminAvailability = {
  ...createUnavailableAvailability(testRuntimeConfig),
  dataMode: "live",
  capabilities: Object.fromEntries(
    adminCapabilities.map((capability) => [capability, { available: true, reason: null }]),
  ) as AdminAvailability["capabilities"],
  integrations: {
    discordOAuth: { status: "connected", detail: "Test provider" },
    discordBot: { status: "connected", detail: "Test provider" },
    discordMemberSync: { status: "connected", detail: "Test provider" },
    database: { status: "connected", detail: "Test provider" },
    rayNameMarketingApi: { status: "connected", detail: "Test provider" },
    deploymentMonitoring: { status: "connected", detail: "Test provider" },
  },
};

export function createTestAvailability(
  overrides: Partial<AdminAvailability["capabilities"]> = {},
): AdminAvailability {
  return {
    ...connectedTestAvailability,
    capabilities: { ...connectedTestAvailability.capabilities, ...overrides },
  };
}

export function createTestAdminDataStore(
  seed: AdminState = localAdminSeed,
  availability: AdminAvailability = connectedTestAvailability,
) {
  return createLocalAdminDataProvider(seed, availability);
}

export function createUnavailableTestAdminDataStore() {
  return createUnavailableAdminDataStore(
    createUnavailableAvailability(testRuntimeConfig),
    { ...testRuntimeConfig, operatorAllowlist: [...testRuntimeConfig.operatorAllowlist] },
  );
}
