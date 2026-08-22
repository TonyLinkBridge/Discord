import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAdmin } from "@/test/render";
import { LeadsScreen } from "./leads-screen";

test("completes Alex Chen follow-up and creates an attributed registration link", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<LeadsScreen />);

  await user.click(await screen.findByRole("button", { name: "Open Alex Chen" }));
  await user.selectOptions(screen.getByLabelText("Next action"), "follow-up");
  await user.click(screen.getByRole("button", { name: "Mark follow-up complete" }));
  await user.click(screen.getByRole("button", { name: "Create tracked link" }));

  expect(
    (screen.getByRole("textbox", { name: "Tracked URL" }) as HTMLInputElement).value,
  ).toMatch(/utm_medium=community/);
  expect((await provider.getActivity()).slice(0, 2).map((event) => event.action)).toEqual([
    "tracking.link.created",
    "lead.action.completed",
  ]);
});
