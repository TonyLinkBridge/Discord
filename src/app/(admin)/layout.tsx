import { AdminShell } from "@/components/admin-shell/admin-shell";
import { RuntimeAdminDataProvider } from "@/components/admin-shell/runtime-admin-data-provider";
import { evaluateAdminAccess } from "@/features/auth/access-policy";
import { getAdminAuthEnvironment, getAuthenticatedDiscordUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { authorizeAdminMutation } from "./admin-mutation-actions";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnvironment = getAdminAuthEnvironment();
  const hasDevelopmentBypass = authEnvironment.developmentOperatorId !== null;
  const authenticatedUserId = hasDevelopmentBypass
    ? authEnvironment.developmentOperatorId
    : authEnvironment.credentialsReady
      ? await getAuthenticatedDiscordUserId()
      : null;
  const decision = evaluateAdminAccess({
    environment: hasDevelopmentBypass ? "development" : "production",
    authenticatedUserId,
    allowlist: authEnvironment.allowlist,
    credentialsReady: authEnvironment.credentialsReady,
  });

  if (decision === "sign-in") {
    redirect("/sign-in");
  }

  if (decision === "deny") {
    redirect("/access-denied");
  }

  if (decision === "misconfigured") {
    redirect("/access-denied?reason=misconfigured");
  }

  const runtimeConfig = {
    workspaceName: "RayName Discord Community",
    timezone: "UTC",
    discordServerName: "RayName Domain Club",
    discordOAuthConfigured: authEnvironment.credentialsReady,
    rayNameApiConfigured: false,
    operatorAllowlist: [...authEnvironment.allowlist],
  };

  return (
    <RuntimeAdminDataProvider config={runtimeConfig} mutationGate={authorizeAdminMutation}>
      <AdminShell>{children}</AdminShell>
    </RuntimeAdminDataProvider>
  );
}
