import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderAdmin } from "@/test/render";
import { CampaignForm } from "./campaign-form";

test("creates Renewal Rescue with a Discord-attributed RayName URL", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<CampaignForm />);

  await user.type(screen.getByLabelText("Campaign name"), "Renewal Rescue");
  await user.selectOptions(screen.getByLabelText("Channel"), "discord");
  await user.type(screen.getByLabelText("Destination"), "https://www.rayname.com/domain/search");
  await user.type(screen.getByLabelText("Start date"), "2026-08-23");
  await user.type(screen.getByLabelText("End date"), "2026-09-06");
  await user.click(screen.getByRole("button", { name: "Create campaign" }));

  const trackedUrl = await screen.findByRole("textbox", { name: "Tracked URL" });
  expect((trackedUrl as HTMLInputElement).value).toMatch(/utm_campaign=renewal-rescue/);
  expect((trackedUrl as HTMLInputElement).value).toMatch(/utm_source=discord/);
  expect(await provider.getCampaign("campaign-5")).toMatchObject({
    channel: "discord",
    destination: "https://www.rayname.com/domain/search",
    endDate: "2026-09-06",
    name: "Renewal Rescue",
    startDate: "2026-08-23",
  });
  expect(screen.getByRole("status")).toHaveTextContent("Renewal Rescue campaign created");
});

test("rejects external destinations and focuses the destination error", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<CampaignForm />);

  await user.type(screen.getByLabelText("Campaign name"), "External rescue");
  await user.selectOptions(screen.getByLabelText("Channel"), "discord");
  await user.type(screen.getByLabelText("Destination"), "https://example.com/search");
  await user.type(screen.getByLabelText("Start date"), "2026-08-23");
  await user.type(screen.getByLabelText("End date"), "2026-09-06");
  await user.click(screen.getByRole("button", { name: "Create campaign" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Use an HTTPS RayName destination");
  expect(screen.getByLabelText("Destination")).toHaveFocus();
  expect((await provider.getState()).campaigns).toHaveLength(4);
});

test("rejects a credential-bearing RayName campaign destination", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<CampaignForm />);

  await user.type(screen.getByLabelText("Campaign name"), "Credential trap");
  await user.selectOptions(screen.getByLabelText("Channel"), "discord");
  await user.type(screen.getByLabelText("Destination"), "https://attacker:secret@www.rayname.com/domain/search");
  await user.type(screen.getByLabelText("Start date"), "2026-08-23");
  await user.type(screen.getByLabelText("End date"), "2026-09-06");
  await user.click(screen.getByRole("button", { name: "Create campaign" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Use an HTTPS RayName destination without credentials");
  expect(screen.getByLabelText("Destination")).toHaveFocus();
  expect((await provider.getState()).campaigns).toHaveLength(4);
});

test("rejects an end date before the start date and focuses the end date", async () => {
  const user = userEvent.setup();
  renderAdmin(<CampaignForm />);

  await user.type(screen.getByLabelText("Campaign name"), "Backwards campaign");
  await user.selectOptions(screen.getByLabelText("Channel"), "email");
  await user.type(screen.getByLabelText("Destination"), "https://rayname.com/account/renewals");
  await user.type(screen.getByLabelText("Start date"), "2026-09-06");
  await user.type(screen.getByLabelText("End date"), "2026-08-23");
  await user.click(screen.getByRole("button", { name: "Create campaign" }));

  expect(screen.getByRole("alert")).toHaveTextContent("End date cannot be earlier than start date");
  expect(screen.getByLabelText("End date")).toHaveFocus();
});

test("creates a stable nonempty attribution value for a Chinese campaign name", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<CampaignForm />);

  await user.type(screen.getByLabelText("Campaign name"), "续费救援");
  await user.selectOptions(screen.getByLabelText("Channel"), "discord");
  await user.type(screen.getByLabelText("Destination"), "https://www.rayname.com/domain/search");
  await user.type(screen.getByLabelText("Start date"), "2026-08-23");
  await user.type(screen.getByLabelText("End date"), "2026-09-06");
  await user.click(screen.getByRole("button", { name: "Create campaign" }));

  const trackedUrl = await screen.findByRole("textbox", { name: "Tracked URL" });
  const attribution = new URL((trackedUrl as HTMLInputElement).value).searchParams.get("utm_campaign");
  expect(attribution).toBe("续费救援");
  expect(attribution).not.toHaveLength(0);
  expect(await provider.getCampaign("campaign-5")).toMatchObject({ name: "续费救援" });
});

test("creates the same ASCII attribution ID under a Turkish operator locale", async () => {
  const originalToLocaleLowerCase = String.prototype.toLocaleLowerCase;
  const localeSpy = vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (this: string) {
    return originalToLocaleLowerCase.call(this, "tr");
  });

  try {
    const user = userEvent.setup();
    renderAdmin(<CampaignForm />);

    await user.type(screen.getByLabelText("Campaign name"), "INVESTOR I");
    await user.selectOptions(screen.getByLabelText("Channel"), "discord");
    await user.type(screen.getByLabelText("Destination"), "https://www.rayname.com/domain/search");
    await user.type(screen.getByLabelText("Start date"), "2026-08-23");
    await user.type(screen.getByLabelText("End date"), "2026-09-06");
    await user.click(screen.getByRole("button", { name: "Create campaign" }));

    const trackedUrl = await screen.findByRole("textbox", { name: "Tracked URL" });
    expect(new URL((trackedUrl as HTMLInputElement).value).searchParams.get("utm_campaign"))
      .toBe("investor-i");
  } finally {
    localeSpy.mockRestore();
  }
});
