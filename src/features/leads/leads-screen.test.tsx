import { screen } from "@testing-library/react";
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

test("opens a lead when the query-selected id changes after mount", async () => {
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
  expect(await screen.findByRole("dialog", { name: "Alex Chen" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Select DomainNomad lead" }));
  expect(await screen.findByRole("dialog", { name: "DomainNomad" })).toBeVisible();
});
