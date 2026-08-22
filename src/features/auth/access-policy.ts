export type AdminAccessDecision = "allow" | "sign-in" | "deny" | "misconfigured";

export interface AdminAccessInput {
  environment: string;
  authenticatedUserId: string | null;
  allowlist: readonly string[];
  credentialsReady: boolean;
}

export interface AdminAuthEnvironmentInput {
  NODE_ENV?: string;
  AUTH_SECRET?: string;
  AUTH_DISCORD_ID?: string;
  AUTH_DISCORD_SECRET?: string;
  ADMIN_DISCORD_USER_IDS?: string;
  DEV_OPERATOR_ID?: string;
}

export interface ResolvedAdminAuthEnvironment {
  environment: string;
  credentialsReady: boolean;
  allowlist: string[];
  developmentOperatorId: string | null;
}

export function evaluateAdminAccess(input: AdminAccessInput): AdminAccessDecision {
  const authenticatedUserId = input.authenticatedUserId?.trim() || null;

  if (input.environment === "development" && authenticatedUserId) {
    return "allow";
  }

  if (!input.credentialsReady) {
    return "misconfigured";
  }

  if (!authenticatedUserId) {
    return "sign-in";
  }

  return input.allowlist.includes(authenticatedUserId) ? "allow" : "deny";
}

export function normalizeAdminDiscordUserIds(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean))];
}

export function resolveAdminAuthEnvironment(
  input: AdminAuthEnvironmentInput,
): ResolvedAdminAuthEnvironment {
  const environment = input.NODE_ENV ?? "production";
  const allowlist = normalizeAdminDiscordUserIds(input.ADMIN_DISCORD_USER_IDS);
  const requiredCredentials = [input.AUTH_SECRET, input.AUTH_DISCORD_ID, input.AUTH_DISCORD_SECRET];

  return {
    environment,
    credentialsReady:
      requiredCredentials.every((credential) => Boolean(credential?.trim())) && allowlist.length > 0,
    allowlist,
    developmentOperatorId:
      environment === "development" ? input.DEV_OPERATOR_ID?.trim() || null : null,
  };
}
