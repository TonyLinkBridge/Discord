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

test("activates the keyboard-selected result through its link", async () => {
  const user = userEvent.setup();
  renderAdmin(
    <AdminShell title="Overview">
      <div />
    </AdminShell>,
  );

  await user.keyboard("{Control>}k{/Control}");
  const search = screen.getByRole("searchbox");
  await user.type(search, "alex");
  const leadResult = await screen.findByRole("option", { name: /Alex Chen.*Lead/i });
  let activationCount = 0;
  leadResult.addEventListener("click", (event) => {
    event.preventDefault();
    activationCount += 1;
  });

  await user.keyboard("{ArrowDown}{Enter}");

  expect(leadResult).toHaveAttribute("aria-selected", "true");
  expect(activationCount).toBe(1);
});

test("contains focus and restores the search trigger after Escape", async () => {
  const user = userEvent.setup();
  renderAdmin(
    <AdminShell title="Overview">
      <div />
    </AdminShell>,
  );
  const trigger = screen.getByRole("button", { name: /Search members, domains, leads, campaigns/ });

  trigger.focus();
  await user.keyboard("{Enter}");
  const search = screen.getByRole("searchbox");
  await user.type(search, "alex");
  const dialog = screen.getByRole("dialog", { name: "Global search" });
  await screen.findByRole("option", { name: /Alex Chen.*Lead/i });

  await user.tab();
  await user.tab();
  await user.tab();
  expect(dialog).toContainElement(document.activeElement as HTMLElement);

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Global search" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
