import { AdminShell } from "@/components/admin-shell/admin-shell";
import { RuntimeAdminDataProvider } from "@/components/admin-shell/runtime-admin-data-provider";
import { evaluateAdminAccess } from "@/features/auth/access-policy";
import { getAdminAuthEnvironment, getAuthenticatedAdminActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { authorizeAdminMutation } from "./admin-mutation-actions";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnvironment = getAdminAuthEnvironment();
  const hasDevelopmentBypass = authEnvironment.developmentOperatorId !== null;
  const actor = hasDevelopmentBypass
    ? {
        id: authEnvironment.developmentOperatorId!,
        image: null,
        name: "Development operator",
      }
    : authEnvironment.credentialsReady
      ? await getAuthenticatedAdminActor()
      : null;
  const decision = evaluateAdminAccess({
    environment: hasDevelopmentBypass ? "development" : "production",
    authenticatedUserId: actor?.id ?? null,
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
      <AdminShell actor={actor!}>{children}</AdminShell>
    </RuntimeAdminDataProvider>
  );
}
