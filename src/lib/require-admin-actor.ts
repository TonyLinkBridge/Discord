import "server-only";

import { evaluateAdminAccess, type ResolvedAdminAuthEnvironment } from "@/features/auth/access-policy";

export type AdminAuthenticationErrorCode =
  | "forbidden"
  | "misconfigured"
  | "unauthenticated";

export class AdminAuthenticationError extends Error {
  readonly name = "AdminAuthenticationError";

  constructor(readonly code: AdminAuthenticationErrorCode) {
    super(`Admin mutation authorization failed: ${code}.`);
  }
}

export interface AdminActorDependencies {
  getAuthenticatedUserId(): Promise<string | null>;
  getEnvironment(): ResolvedAdminAuthEnvironment;
}

export async function requireAdminActor(dependencies: AdminActorDependencies): Promise<string> {
  const environment = dependencies.getEnvironment();

  if (environment.environment === "development" && environment.developmentOperatorId) {
    return environment.developmentOperatorId;
  }

  if (!environment.credentialsReady) {
    throw new AdminAuthenticationError("misconfigured");
  }

  const authenticatedUserId = (await dependencies.getAuthenticatedUserId())?.trim() || null;
  const decision = evaluateAdminAccess({
    allowlist: environment.allowlist,
    authenticatedUserId,
    credentialsReady: environment.credentialsReady,
    environment: "production",
  });

  if (decision === "allow" && authenticatedUserId) {
    return authenticatedUserId;
  }

  if (decision === "sign-in") {
    throw new AdminAuthenticationError("unauthenticated");
  }

  if (decision === "deny") {
    throw new AdminAuthenticationError("forbidden");
  }

  throw new AdminAuthenticationError("misconfigured");
}
