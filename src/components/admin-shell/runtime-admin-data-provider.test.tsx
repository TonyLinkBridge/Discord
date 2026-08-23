import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useAdminData } from "@/lib/admin-data/context";
import type { AdminMutationGate } from "@/lib/admin-data/mutation-command";
import type { SafeAdminRuntimeConfig } from "@/lib/admin-data/availability";
import { RuntimeAdminDataProvider } from "./runtime-admin-data-provider";

const config = {
  workspaceName: "RayName Discord Community",
  timezone: "UTC",
  discordServerName: "RayName Domain Club",
  discordOAuthConfigured: true,
  rayNameApiConfigured: false,
  operatorAllowlist: ["42"],
} satisfies SafeAdminRuntimeConfig;

const mutationGate: AdminMutationGate = async (command) => ({ actorId: "42", command });

function ProviderProbe() {
  const provider = useAdminData();
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    void provider.getState().then((state) => setMemberCount(state.members.length));
  }, [provider]);

  return (
    <>
      <span data-testid="data-mode">{provider.availability.dataMode}</span>
      <span data-testid="member-count">{memberCount ?? "loading"}</span>
    </>
  );
}

describe("RuntimeAdminDataProvider", () => {
  test("uses unavailable mode with no seeded members", async () => {
    render(
      <RuntimeAdminDataProvider config={config} mutationGate={mutationGate}>
        <ProviderProbe />
      </RuntimeAdminDataProvider>,
    );

    expect(screen.getByTestId("data-mode")).toHaveTextContent("unavailable");
    expect(await screen.findByTestId("member-count")).toHaveTextContent("0");
    expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();
  });
});
