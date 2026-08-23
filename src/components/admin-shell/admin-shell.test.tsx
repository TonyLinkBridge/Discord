import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import AdminLayout from "@/app/(admin)/layout";
import { RayNameThemeProvider } from "@/components/theme/theme-provider";
import { AdminShell } from "./admin-shell";
import { renderAdmin } from "@/test/render";
import { TodaysPriorities } from "@/features/overview/todays-priorities";

const location = vi.hoisted(() => ({ pathname: "/" }));
const authorizeAdminMutation = vi.hoisted(() => vi.fn(async (input: unknown) => ({
  actorId: "42",
  command: input,
})));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => location.pathname,
}));

vi.mock("@/lib/auth", () => ({
  getAdminAuthEnvironment: () => ({
    environment: "development",
    credentialsReady: false,
    allowlist: [],
    developmentOperatorId: "local-ray",
  }),
  getAuthenticatedDiscordUserId: vi.fn(),
}));

vi.mock("@/app/(admin)/admin-mutation-actions", () => ({ authorizeAdminMutation }));

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

test("mounts the fail-closed provider in the production admin layout", async () => {
  const user = userEvent.setup();
  const layout = await AdminLayout({ children: <div>Route content</div> });
  render(
    <RayNameThemeProvider>
      {layout}
    </RayNameThemeProvider>,
  );

  await user.keyboard("{Meta>}k{/Meta}");
  await user.type(screen.getByRole("searchbox"), "alex");

  expect(await screen.findByText("No matching records")).toBeVisible();
  expect(screen.queryByRole("option", { name: /Alex Chen.*Lead/i })).not.toBeInTheDocument();
});

test("does not expose seeded mutation targets in the production admin layout", async () => {
  authorizeAdminMutation.mockClear();
  const layout = await AdminLayout({ children: <TodaysPriorities /> });
  render(<RayNameThemeProvider>{layout}</RayNameThemeProvider>);

  expect(screen.queryByText("Verify 12 new members")).not.toBeInTheDocument();
  expect(authorizeAdminMutation).not.toHaveBeenCalled();
});

test("shows the current workspace and complete command-bar controls", async () => {
  const user = userEvent.setup();
  renderAdmin(
    <AdminShell title="Overview">
      <div />
    </AdminShell>,
  );

  expect(await screen.findByText("RayName Discord Community")).toBeVisible();
  expect(screen.getByLabelText("Workspace: RayName Discord Community")).toHaveAttribute(
    "title",
    "RayName Discord Community",
  );
  const commandBar = screen.getByRole("banner");
  const operatorMenu = within(commandBar).getByRole("button", { name: "Operator menu" });
  expect(operatorMenu).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Operator menu" })).toHaveLength(1);
  expect(within(commandBar).getByRole("button", { name: "Notifications" })).toBeVisible();
  expect(screen.getByLabelText("System status: All systems operational")).toHaveAttribute(
    "title",
    "All systems operational",
  );

  await user.click(operatorMenu);
  expect(screen.getByRole("menuitem", { name: "Account settings" })).toBeVisible();
});

test("renders the official RayName mark with a one-line brand lockup", async () => {
  renderAdmin(
    <AdminShell title="Overview">
      <div />
    </AdminShell>,
  );

  await screen.findByText("RayName Discord Community");
  const brand = screen.getByRole("link", { name: "RayName Admin home" });
  expect(within(brand).getByRole("img", { name: "RayName mark" })).toBeVisible();
  expect(brand).toHaveTextContent("RayName Admin");
});

test("derives the command-bar title and automation destination from the route", () => {
  location.pathname = "/campaigns";
  renderAdmin(
    <AdminShell>
      <div />
    </AdminShell>,
  );

  expect(screen.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Bot & Automations" })).toHaveAttribute(
    "href",
    "/bot-automations",
  );
});
