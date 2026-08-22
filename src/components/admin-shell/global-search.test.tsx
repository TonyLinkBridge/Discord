import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminShell } from "./admin-shell";
import { renderAdmin } from "@/test/render";

test("opens grouped search results from the keyboard", async () => {
  const user = userEvent.setup();
  renderAdmin(
    <AdminShell title="Overview">
      <div />
    </AdminShell>,
  );

  await user.keyboard("{Meta>}k{/Meta}");
  await user.type(screen.getByRole("searchbox"), "alex");

  expect(await screen.findByRole("option", { name: /Alex Chen.*Lead/i })).toBeVisible();
});

test("moves through results with arrow keys and closes with Escape", async () => {
  const user = userEvent.setup();
  renderAdmin(
    <AdminShell title="Overview">
      <div />
    </AdminShell>,
  );

  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "alex");
  const firstResult = await screen.findByRole("option", { name: /@alexchen.*Member/i });

  expect(firstResult).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("option", { name: /Alex Chen.*Lead/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});
