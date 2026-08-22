import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { renderAdmin } from "@/test/render";
import { CampaignForm } from "./campaign-form";
import { CampaignsScreen } from "./campaigns-screen";

test("focuses a requested campaign in the canonical campaign workflow", async () => {
  renderAdmin(<CampaignsScreen initialSelectedCampaignId="com-transfer-week" />);

  const campaignRow = await screen.findByRole("row", { name: /.com Transfer Week/i });
  expect(campaignRow).toHaveFocus();
});

test("moves campaign focus when the query-selected id changes after mount", async () => {
  const user = userEvent.setup();
  function Harness() {
    const [campaignId, setCampaignId] = useState<string | null>(null);
    return <>
      <button onClick={() => setCampaignId("com-transfer-week")} type="button">Select Transfer Week campaign</button>
      <button onClick={() => setCampaignId("investor-outreach")} type="button">Select Investor Outreach campaign</button>
      <CampaignsScreen initialSelectedCampaignId={campaignId} />
    </>;
  }
  renderAdmin(<Harness />);
  await screen.findByRole("heading", { name: "Campaigns" });

  await user.click(screen.getByRole("button", { name: "Select Transfer Week campaign" }));
  expect(await screen.findByRole("row", { name: /.com Transfer Week/i })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Select Investor Outreach campaign" }));
  expect(await screen.findByRole("row", { name: /Investor Outreach/i })).toHaveFocus();
});

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
    trackedLinkId: "tracked-link-1",
  });
  expect((await provider.getState()).trackedLinks[0]).toMatchObject({
    campaign: "renewal-rescue",
    id: "tracked-link-1",
    url: (trackedUrl as HTMLInputElement).value,
  });
  expect((await provider.getActivity()).slice(0, 2).map((event) => event.action)).toEqual([
    "tracking.link.created",
    "campaign.created",
  ]);
  expect(screen.getByRole("status")).toHaveTextContent("Renewal Rescue campaign created");
});

test("shows a campaign tracked URL after the campaign screen remounts", async () => {
  const user = userEvent.setup();
  const firstRender = renderAdmin(<CampaignsScreen />);

  await screen.findByRole("heading", { name: "Campaigns" });
  await user.type(screen.getByLabelText("Campaign name"), "Renewal Rescue");
  await user.selectOptions(screen.getByLabelText("Channel"), "discord");
  await user.type(screen.getByLabelText("Destination"), "https://www.rayname.com/domain/search");
  await user.type(screen.getByLabelText("Start date"), "2026-08-23");
  await user.type(screen.getByLabelText("End date"), "2026-09-06");
  await user.click(screen.getByRole("button", { name: "Create campaign" }));
  const trackedUrl = (await screen.findByRole("textbox", { name: "Tracked URL" }) as HTMLInputElement).value;

  firstRender.unmount();
  renderAdmin(<CampaignsScreen />, { provider: firstRender.provider });

  expect(await screen.findByRole("link", { name: "Tracked URL for Renewal Rescue" }))
    .toHaveAttribute("href", trackedUrl);
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
