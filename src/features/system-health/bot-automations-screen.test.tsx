import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
