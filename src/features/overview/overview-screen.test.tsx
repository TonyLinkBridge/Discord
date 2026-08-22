import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { AdminShell } from "@/components/admin-shell/admin-shell";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { localAdminSeed } from "@/lib/admin-data/seed";
import { renderAdmin } from "@/test/render";
import { OverviewScreen } from "./overview-screen";

const approvedMetrics = [
  ["Discord Members", "1,248"],
  ["Verified Customers", "326"],
  ["Registrations", "168"],
  ["Transfers", "39"],
  ["Renewal Rate", "91.4%"],
  ["Attributed Revenue", "$18,420"],
] as const;

const approvedSections = [
  "Conversion performance",
  "Today's priorities",
  "Conversion funnel",
  "High-intent leads",
  "Campaign performance",
] as const;

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

test.each(["light", "dark"])(
  "shows the approved Overview content in %s mode without changing its order",
  async (theme) => {
    document.documentElement.className = theme;
    const { container } = renderAdmin(<OverviewScreen />);

    expect(await screen.findByText("Discord Members")).toBeVisible();
    const metricStrip = screen.getByRole("region", { name: "Overview metrics" });
    for (const [label, value] of approvedMetrics) {
      expect(within(metricStrip).getByText(label)).toBeVisible();
      expect(within(metricStrip).getByText(value)).toBeVisible();
    }

    for (const section of approvedSections) {
      expect(screen.getByRole("heading", { name: section })).toBeVisible();
    }

    expect(screen.getByText("Verify 12 new members")).toBeVisible();
    expect(screen.getByText("8,742")).toBeVisible();
    expect(screen.getByText("Alex Chen")).toBeVisible();
    expect(screen.getByText(".com Transfer Week")).toBeVisible();
    expect(screen.getAllByText("Very High")).toHaveLength(2);

    for (const destination of [
      "View all priorities",
      "View full funnel",
      "View all leads",
      "View all campaigns",
    ]) {
      expect(screen.getByRole("link", { name: destination })).toBeVisible();
    }

    expect(
      [...container.querySelectorAll("h2")].map((heading) => heading.textContent),
    ).toEqual(approvedSections);
  },
);

test("reads Overview values from the configured admin data provider", async () => {
  const seed = structuredClone(localAdminSeed);
  seed.community.memberGrowth.at(-1)!.totalMembers = 9999;

  renderAdmin(<OverviewScreen />, {
    provider: createLocalAdminDataProvider(seed),
  });

  expect(await screen.findByText("9,999")).toBeVisible();
  expect(screen.queryByText("1,248")).not.toBeInTheDocument();
});

test("applies the keyboard-selected global range to Overview content and labels", async () => {
  const user = userEvent.setup();
  renderAdmin(
    <AdminShell title="Overview">
      <OverviewScreen />
    </AdminShell>,
  );

  const initialMetrics = await screen.findByRole("region", { name: "Overview metrics" });
  expect(within(initialMetrics).getByText("$18,420")).toBeVisible();
  const commandBar = screen.getByRole("heading", { level: 1, name: "Overview" }).closest("header")!;
  const rangeButton = within(commandBar).getByRole("button", { name: /Date range:/ });
  act(() => rangeButton.focus());
  await user.keyboard("{Enter}");
  await user.keyboard("{ArrowDown}{Enter}");

  expect(rangeButton).toHaveAccessibleName("Date range: Aug 18 to 22, 2026");
  expect(within(await screen.findByRole("region", { name: "Overview metrics" }))
    .getByText("$14,460")).toBeVisible();
  expect(screen.getByRole("img", {
    name: "Registrations line chart for Aug 18–22, 2026",
  })).toBeVisible();
  expect(screen.getByRole("row", { name: /\.com Transfer Week/ })).toHaveTextContent("$7,395");
});

test("does not relabel an old Overview snapshot while the selected range loads", async () => {
  const user = userEvent.setup();
  const provider = createLocalAdminDataProvider();
  let releaseRecentRange = () => {};
  const recentRangeGate = new Promise<void>((resolve) => {
    releaseRecentRange = resolve;
  });
  const delayedProvider = {
    ...provider,
    async getOverview(...args: Parameters<typeof provider.getOverview>) {
      if (args[0].from === "2026-08-18") await recentRangeGate;
      return provider.getOverview(...args);
    },
  };
  renderAdmin(
    <AdminShell title="Overview">
      <OverviewScreen />
    </AdminShell>,
    { provider: delayedProvider },
  );

  const initialMetrics = await screen.findByRole("region", { name: "Overview metrics" });
  expect(within(initialMetrics).getByText("$18,420")).toBeVisible();
  const commandBar = screen.getByRole("heading", { level: 1, name: "Overview" }).closest("header")!;
  await user.click(within(commandBar).getByRole("button", { name: /Date range:/ }));
  await user.click(screen.getByRole("menuitemradio", { name: "Aug 18–22, 2026" }));

  expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
    "Loading overview for Aug 18–22, 2026",
  );
  expect(screen.queryByRole("region", { name: "Overview metrics" })).not.toBeInTheDocument();

  releaseRecentRange();
  expect(within(await screen.findByRole("region", { name: "Overview metrics" }))
    .getByText("$14,460")).toBeVisible();
});
