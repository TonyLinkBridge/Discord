import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAdmin } from "@/test/render";
import { TodaysPriorities } from "./todays-priorities";

test("completes a priority and removes it from today's queue", async () => {
  const user = userEvent.setup();
  renderAdmin(<TodaysPriorities />);

  expect(await screen.findByText("Verify 12 new members")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Review Verify 12 new members" }));
  await user.click(screen.getByRole("menuitem", { name: "Mark complete" }));

  expect(screen.queryByText("Verify 12 new members")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Priority completed");
});

test("supports completing a priority with keyboard menu navigation", async () => {
  const user = userEvent.setup();
  renderAdmin(<TodaysPriorities />);

  const trigger = await screen.findByRole("button", { name: "Review Verify 12 new members" });
  trigger.focus();
  await user.keyboard("{Enter}{ArrowDown}");

  expect(screen.getByRole("menuitem", { name: "Mark complete" })).toHaveFocus();
  await user.keyboard("{Enter}");

  expect(screen.queryByText("Verify 12 new members")).not.toBeInTheDocument();
});
