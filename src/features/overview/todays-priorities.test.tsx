import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestAdminDataStore } from "@/test/admin-data";
import { localAdminSeed } from "@/test/fixtures/admin-state";
import { renderAdmin } from "@/test/render";
import { TodaysPriorities } from "./todays-priorities";

test("completes a priority and removes it from today's queue", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<TodaysPriorities />);

  expect(await screen.findByText("Verify 12 new members")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Review Verify 12 new members" }));
  await user.click(screen.getByRole("menuitem", { name: "Mark complete" }));

  expect(screen.queryByText("Verify 12 new members")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Priority completed");
  expect(screen.getByRole("button", { name: "Open leads Follow up with 7 high-intent leads" })).toHaveFocus();
  expect((await provider.getOverview({ from: "2026-08-16", to: "2026-08-22" })).priorities).not.toContainEqual(
    expect.objectContaining({ id: "verify-new-members" }),
  );
  expect((await provider.getActivity())[0]).toMatchObject({
    action: "priority.completed",
    actorId: "local-ray",
    entityId: "verify-new-members",
  });
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
  expect(screen.getByRole("button", { name: "Open leads Follow up with 7 high-intent leads" })).toHaveFocus();
});

test("moves focus to the next priority after completing a middle row", async () => {
  const user = userEvent.setup();
  renderAdmin(<TodaysPriorities />);

  await user.click(await screen.findByRole("button", { name: "Open leads Follow up with 7 high-intent leads" }));
  await user.click(screen.getByRole("menuitem", { name: "Mark complete" }));

  expect(screen.getByRole("button", { name: "View offer Promote .com transfer offer" })).toHaveFocus();
});

test("moves focus to the previous priority after completing the final remaining action", async () => {
  const user = userEvent.setup();
  const seed = structuredClone(localAdminSeed);
  seed.overview.priorities = seed.overview.priorities.slice(0, 2);
  renderAdmin(<TodaysPriorities />, { provider: createTestAdminDataStore(seed) });

  await user.click(await screen.findByRole("button", { name: "Open leads Follow up with 7 high-intent leads" }));
  await user.click(screen.getByRole("menuitem", { name: "Mark complete" }));

  expect(screen.getByRole("button", { name: "Review Verify 12 new members" })).toHaveFocus();
});

test("moves focus to the priority section after completing the final row", async () => {
  const user = userEvent.setup();
  const seed = structuredClone(localAdminSeed);
  seed.overview.priorities = [seed.overview.priorities[0]];
  renderAdmin(<TodaysPriorities />, { provider: createTestAdminDataStore(seed) });

  await user.click(await screen.findByRole("button", { name: "Review Verify 12 new members" }));
  await user.click(screen.getByRole("menuitem", { name: "Mark complete" }));

  expect(screen.getByRole("heading", { name: "Today's priorities" }).closest("section")).toHaveFocus();
});
