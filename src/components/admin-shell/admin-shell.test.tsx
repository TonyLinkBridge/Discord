import { screen, within } from "@testing-library/react";
import { AdminShell } from "./admin-shell";
import { renderAdmin } from "@/test/render";

test("renders the approved navigation in order", () => {
  renderAdmin(
    <AdminShell title="Overview">
      <div>Route content</div>
    </AdminShell>,
  );

  const navigation = screen.getByRole("navigation", { name: "Primary" });
  expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
    "Overview",
    "Community",
    "Members",
    "Leads",
    "Campaigns",
    "Offers",
    "Content",
    "Bot & Automations",
    "Analytics",
    "Settings",
  ]);
});
