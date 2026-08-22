import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAdmin } from "@/test/render";
import { HighIntentLeads } from "./high-intent-leads";

test("records Send Offer as the next action for Sarah K.", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<HighIntentLeads />);

  await user.click(await screen.findByRole("button", { name: "Actions for Sarah K." }));
  await user.click(screen.getByRole("menuitem", { name: "Send offer" }));

  expect(screen.getByRole("status")).toHaveTextContent("Sarah K. updated");
  expect(screen.getByText("Offer sent")).toBeVisible();
  expect(screen.getByRole("button", { name: "Actions for Sarah K." })).toHaveFocus();
  expect((await provider.getLead("sarah-k")).nextAction).toBe("send-offer");
  expect((await provider.getActivity())[0]).toMatchObject({
    action: "lead.action.updated",
    actorId: "local-ray",
    entityId: "sarah-k",
  });
});
