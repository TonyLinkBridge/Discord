import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import type { ServiceStatus } from "@/lib/admin-data/types";
import { renderAdmin } from "@/test/render";
import { BotAutomationsScreen } from "./bot-automations-screen";

test("keeps provider-backed manual operations available while RayName API access is pending", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<BotAutomationsScreen />);

  expect(await screen.findAllByText("Healthy")).toHaveLength(3);
  expect(screen.getByText("Awaiting access")).toBeVisible();
  for (const name of [
    "Enable /price",
    "Enable /search",
    "Enable /verify",
    "Enable renewal events",
  ]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }

  const createTrackedLink = screen.getByRole("button", { name: "Create tracked link" });
  const verifyCustomer = screen.getByRole("button", { name: "Verify customer manually" });
  expect(screen.getByText("Next verification: DomainNomad")).toBeVisible();
  expect(createTrackedLink).toBeEnabled();
  expect(verifyCustomer).toBeEnabled();

  await user.click(createTrackedLink);
  expect(await screen.findByRole("status")).toHaveTextContent("Tracked link created");
  await user.click(verifyCustomer);
  expect(await screen.findByRole("status")).toHaveTextContent("DomainNomad verified manually");

  expect((await provider.getState()).trackedLinks[0]).toMatchObject({
    campaign: "bot-operations",
    medium: "community",
    source: "discord",
  });
  expect(await provider.getMember("domainnomad")).toMatchObject({
    customerStatus: "Verified customer",
    roles: ["Flipper", "Verified"],
    verified: true,
  });
  expect((await provider.getActivity()).slice(0, 2).map((event) => event.action)).toEqual([
    "member.updated",
    "tracking.link.created",
  ]);
});

test.each(["operational", "degraded"] satisfies ServiceStatus[])(
  "keeps API controls disabled without provider mutations when the API is %s",
  async (apiStatus) => {
    const provider = createLocalAdminDataProvider();
    const statusProvider = {
      ...provider,
      async getSystemHealth() {
        const health = await provider.getSystemHealth();
        return {
          ...health,
          services: health.services.map((service) =>
            service.id === "rayname-api"
              ? { ...service, detail: `API is ${apiStatus}`, status: apiStatus }
              : service,
          ),
        };
      },
    };

    renderAdmin(<BotAutomationsScreen />, { provider: statusProvider });

    expect(await screen.findByText("Bot commands & events")).toBeVisible();
    expect(screen.getByText(/Controls remain unavailable until provider mutations are implemented/))
      .toBeVisible();
    for (const name of [
      "Enable /price",
      "Enable /search",
      "Enable /verify",
      "Enable renewal events",
    ]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  },
);

test("shows an accessible health error and recovers through an explicit retry", async () => {
  const user = userEvent.setup();
  const provider = createLocalAdminDataProvider();
  let requests = 0;
  const recoveringProvider = {
    ...provider,
    async getSystemHealth() {
      requests += 1;
      if (requests === 1) throw new Error("temporary health failure");
      return provider.getSystemHealth();
    },
  };

  renderAdmin(<BotAutomationsScreen />, { provider: recoveringProvider });

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load system health");
  await user.click(screen.getByRole("button", { name: "Retry system health" }));

  expect(await screen.findByText("Connection health")).toBeVisible();
  expect(screen.getByRole("button", { name: "Create tracked link" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Verify customer manually" })).toBeEnabled();
  expect(requests).toBe(2);
});

test("advances the verification queue and prevents duplicate member updates", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<BotAutomationsScreen />);

  const verifyButton = await screen.findByRole("button", { name: "Verify customer manually" });
  expect(screen.getByText("Next verification: DomainNomad")).toBeVisible();
  await user.click(verifyButton);

  expect(await screen.findByRole("status")).toHaveTextContent("DomainNomad verified manually");
  expect(await screen.findByText("Next verification: Sarah K.")).toBeVisible();
  await user.click(verifyButton);

  expect(await screen.findByRole("status")).toHaveTextContent("Sarah K. verified manually");
  expect(screen.getByText("Manual verification queue complete")).toBeVisible();
  expect(verifyButton).toBeDisabled();
  await user.click(verifyButton);

  expect((await provider.getActivity()).map((event) => [event.entityId, event.action])).toEqual([
    ["sarah-k", "member.updated"],
    ["domainnomad", "member.updated"],
  ]);
});
