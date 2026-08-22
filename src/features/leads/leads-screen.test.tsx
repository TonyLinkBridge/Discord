import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { renderAdmin } from "@/test/render";
import { LeadsScreen } from "./leads-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

test("shows only high-intent investors after filtering", async () => {
  const user = userEvent.setup();
  renderAdmin(<LeadsScreen />);

  await user.selectOptions(await screen.findByLabelText("Segment"), "investor");
  await user.selectOptions(screen.getByLabelText("Intent"), "very-high");

  expect(await screen.findByText("Alex Chen")).toBeVisible();
  expect(screen.queryByText("Web3Builder")).not.toBeInTheDocument();
});

test("opens the requested lead in the canonical leads workflow", async () => {
  renderAdmin(<LeadsScreen initialSelectedLeadId="alex-chen" />);

  expect(await screen.findByRole("dialog", { name: "Alex Chen" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Lead pipeline" })).toBeVisible();
});

test("resets lead-local detail state when the query-selected id changes", async () => {
  const user = userEvent.setup();
  function Harness() {
    const [leadId, setLeadId] = useState<string | null>(null);
    return <>
      <button onClick={() => setLeadId("alex-chen")} type="button">Select Alex lead</button>
      <button onClick={() => setLeadId("domainnomad")} type="button">Select DomainNomad lead</button>
      <LeadsScreen initialSelectedLeadId={leadId} />
    </>;
  }
  renderAdmin(<Harness />);
  await screen.findByRole("heading", { name: "Lead pipeline" });

  await user.click(screen.getByRole("button", { name: "Select Alex lead" }));
  const alexDialog = await screen.findByRole("dialog", { name: "Alex Chen" });
  await user.selectOptions(within(alexDialog).getByLabelText("Next action"), "send-offer");
  await user.click(within(alexDialog).getByRole("button", { name: "Create tracked link" }));
  expect(await within(alexDialog).findByRole("textbox", { name: "Tracked URL" }))
    .toHaveValue("https://www.rayname.com/domain/search?utm_campaign=investor-outreach&utm_content=lead-alex-chen&utm_medium=community&utm_source=discord");

  await user.click(screen.getByRole("button", { name: "Select DomainNomad lead" }));
  const domainNomadDialog = await screen.findByRole("dialog", { name: "DomainNomad" });
  expect(within(domainNomadDialog).getByLabelText("Next action")).toHaveValue("follow-up");
  expect(within(domainNomadDialog).queryByRole("textbox", { name: "Tracked URL" }))
    .not.toBeInTheDocument();
  expect(within(domainNomadDialog).getByRole("status")).toHaveTextContent("");
  expect(within(domainNomadDialog).getByRole("button", { name: "Close lead details" }))
    .toHaveFocus();
});
