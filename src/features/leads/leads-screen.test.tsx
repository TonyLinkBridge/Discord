import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAdmin } from "@/test/render";
import { LeadsScreen } from "./leads-screen";

test("shows only high-intent investors after filtering", async () => {
  const user = userEvent.setup();
  renderAdmin(<LeadsScreen />);

  await user.selectOptions(await screen.findByLabelText("Segment"), "investor");
  await user.selectOptions(screen.getByLabelText("Intent"), "very-high");

  expect(await screen.findByText("Alex Chen")).toBeVisible();
  expect(screen.queryByText("Web3Builder")).not.toBeInTheDocument();
});
