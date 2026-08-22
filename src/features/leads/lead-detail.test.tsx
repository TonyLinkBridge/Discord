import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import type { LeadAction } from "@/lib/admin-data/types";
import { renderAdmin } from "@/test/render";
import { LeadsScreen } from "./leads-screen";

test("completes Alex Chen follow-up and creates an attributed registration link", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<LeadsScreen />);

  await user.click(await screen.findByRole("button", { name: "Open Alex Chen" }));
  await user.selectOptions(screen.getByLabelText("Next action"), "follow-up");
  await user.click(screen.getByRole("button", { name: "Mark follow-up complete" }));
  await user.click(screen.getByRole("button", { name: "Create tracked link" }));

  const trackedUrl = "https://www.rayname.com/domain/search?utm_campaign=investor-outreach&utm_content=lead-alex-chen&utm_medium=community&utm_source=discord";
  expect(
    (screen.getByRole("textbox", { name: "Tracked URL" }) as HTMLInputElement).value,
  ).toBe(trackedUrl);
  expect((await provider.getState()).trackedLinks).toEqual([
    expect.objectContaining({
      campaign: "investor-outreach",
      content: "lead-alex-chen",
      destination: "https://www.rayname.com/domain/search",
      medium: "community",
      source: "discord",
      url: trackedUrl,
    }),
  ]);
  expect((await provider.getActivity()).slice(0, 2).map((event) => event.action)).toEqual([
    "tracking.link.created",
    "lead.action.completed",
  ]);
});

test("shows a completed action after reopening without offering duplicate completion", async () => {
  const user = userEvent.setup();
  renderAdmin(<LeadsScreen />);

  await user.click(await screen.findByRole("button", { name: "Open Alex Chen" }));
  await user.selectOptions(screen.getByLabelText("Next action"), "follow-up");
  await user.click(screen.getByRole("button", { name: "Mark follow-up complete" }));
  expect(await screen.findByRole("status")).toHaveTextContent("follow-up completed for Alex Chen");
  await user.click(screen.getByRole("button", { name: "Close lead details" }));

  const alexRow = screen.getByRole("row", { name: /Alex Chen/ });
  expect(within(alexRow).getByText("Follow up complete")).toBeVisible();
  await user.click(within(alexRow).getByRole("button", { name: "Open Alex Chen" }));

  expect(within(screen.getByRole("dialog", { name: "Alex Chen" })).getByText("Follow up complete"))
    .toBeVisible();
  expect(screen.getByLabelText("Next action")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Select an action to complete" })).toBeDisabled();
});

test("serializes delayed lead mutations and blocks duplicate clicks while pending", async () => {
  const user = userEvent.setup();
  const provider = createLocalAdminDataProvider();
  let releaseCompletion = () => {};
  const completionGate = new Promise<void>((resolve) => {
    releaseCompletion = resolve;
  });
  const delayedProvider = {
    ...provider,
    async completeLeadAction(leadId: string, action: LeadAction, actorId: string) {
      await completionGate;
      return provider.completeLeadAction(leadId, action, actorId);
    },
  };
  renderAdmin(<LeadsScreen />, { provider: delayedProvider });

  await user.click(await screen.findByRole("button", { name: "Open Alex Chen" }));
  await user.selectOptions(screen.getByLabelText("Next action"), "follow-up");
  const completeButton = screen.getByRole("button", { name: "Mark follow-up complete" });
  const createLinkButton = screen.getByRole("button", { name: "Create tracked link" });
  await user.click(completeButton);

  expect(completeButton).toBeDisabled();
  expect(createLinkButton).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Completing follow-up for Alex Chen");
  await user.click(completeButton);
  releaseCompletion();

  expect(await screen.findByRole("status")).toHaveTextContent("follow-up completed for Alex Chen");
  await user.click(createLinkButton);
  expect(await screen.findByRole("textbox", { name: "Tracked URL" })).toBeVisible();
  expect((await provider.getActivity()).map((event) => event.action)).toEqual([
    "tracking.link.created",
    "lead.action.completed",
  ]);
});
