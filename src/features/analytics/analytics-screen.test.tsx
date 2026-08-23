import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestAdminDataStore } from "@/test/admin-data";
import { AdminShell } from "@/components/admin-shell/admin-shell";
import { renderAdmin } from "@/test/render";
import { AnalyticsScreen } from "./analytics-screen";

test("applies one date range to every analytics section", async () => {
  const user = userEvent.setup();
  renderAdmin(<AnalyticsScreen />);

  await screen.findByRole("heading", { name: "Conversion trend" });
  const rangeButton = screen.getByRole("button", { name: "Date range" });
  await user.click(rangeButton);
  await user.click(screen.getByRole("option", { name: "Aug 18–22, 2026" }));

  expect(rangeButton).toHaveFocus();
  expect(await screen.findAllByText("Aug 18–22, 2026")).toHaveLength(3);
  expect(screen.getByText("Conversion trend data table")).toBeInTheDocument();
  expect(screen.getByText("Attribution data table")).toBeInTheDocument();
  expect(screen.getByText("Funnel data table")).toBeInTheDocument();
  expect(screen.queryByRole("rowheader", { name: "Aug 16" })).not.toBeInTheDocument();
  expect(screen.getByRole("rowheader", { name: "Aug 18" })).toBeInTheDocument();
  expect(
    within(screen.getByRole("table", { name: "Attribution data table" }))
      .getByRole("row", { name: /\.com Transfer Week/ }),
  ).toHaveTextContent("$7,395");
});

test("renders 5, 7, and 22 trend points on one responsive chronological axis", async () => {
  const user = userEvent.setup();
  renderAdmin(<AnalyticsScreen />);

  const rangeButton = await screen.findByRole("button", { name: "Date range" });
  const getTrend = () => screen.getByRole("img", {
    name: /Registration, transfer, and renewal trend/,
  });
  const getScroller = () => screen.getByRole("region", { name: "Conversion trend axis" });

  expect(getTrend()).toHaveAttribute("data-point-count", "7");
  expect(getTrend()).toHaveStyle({
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    minWidth: "100%",
  });
  expect(getScroller()).toHaveAttribute("data-overflow", "fit");
  expect(getScroller()).not.toHaveAttribute("tabindex");

  await user.click(rangeButton);
  await user.click(screen.getByRole("option", { name: "Aug 18–22, 2026" }));
  expect(await screen.findByRole("img", { name: /Aug 18–22, 2026/ }))
    .toHaveAttribute("data-point-count", "5");
  expect(getTrend()).toHaveStyle({
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    minWidth: "100%",
  });
  expect(getScroller()).toHaveAttribute("data-overflow", "fit");
  expect(getScroller()).not.toHaveAttribute("tabindex");

  await user.click(rangeButton);
  await user.click(screen.getByRole("option", { name: "Aug 1–22, 2026" }));
  expect(await screen.findByRole("img", { name: /Aug 1–22, 2026/ }))
    .toHaveAttribute("data-point-count", "22");
  expect(getTrend()).toHaveStyle({
    gridTemplateColumns: "repeat(22, minmax(44px, 1fr))",
    minWidth: "1144px",
  });
  expect(getTrend()).toHaveProperty("children.length", 22);
  expect(getScroller()).toHaveAttribute("data-overflow", "horizontal");
  expect(getScroller()).toHaveAttribute("tabindex", "0");
});

test("never relabels the previous snapshot while the selected range is loading", async () => {
  const user = userEvent.setup();
  const provider = createTestAdminDataStore();
  let releaseRecentRange = () => {};
  const recentRangeGate = new Promise<void>((resolve) => {
    releaseRecentRange = resolve;
  });
  const delayedProvider = {
    ...provider,
    async getAnalytics(...args: Parameters<typeof provider.getAnalytics>) {
      if (args[0].from === "2026-08-18") await recentRangeGate;
      return provider.getAnalytics(...args);
    },
  };
  renderAdmin(<AnalyticsScreen />, { provider: delayedProvider });

  expect(await screen.findByText("$9,420")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Date range" }));
  await user.click(screen.getByRole("option", { name: "Aug 18–22, 2026" }));

  expect(screen.getByRole("status")).toHaveTextContent("Loading analytics for Aug 18–22, 2026");
  expect(screen.queryByText("$9,420")).not.toBeInTheDocument();

  releaseRecentRange();
  expect(await screen.findByText("$7,395")).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("retries a failed provider read from an explicit operator action", async () => {
  const user = userEvent.setup();
  const provider = createTestAdminDataStore();
  let requests = 0;
  const recoveringProvider = {
    ...provider,
    async getAnalytics(...args: Parameters<typeof provider.getAnalytics>) {
      requests += 1;
      if (requests === 1) throw new Error("temporary read failure");
      return provider.getAnalytics(...args);
    },
  };

  renderAdmin(<AnalyticsScreen />, { provider: recoveringProvider });

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load analytics");
  await user.click(screen.getByRole("button", { name: "Retry analytics" }));

  expect(await screen.findByRole("heading", { name: "Conversion trend" })).toBeVisible();
  expect(requests).toBe(2);
});

test("dismisses the date range list with Escape and restores trigger focus", async () => {
  const user = userEvent.setup();
  renderAdmin(<AnalyticsScreen />);

  const rangeButton = await screen.findByRole("button", { name: "Date range" });
  await user.click(rangeButton);
  expect(screen.getByRole("option", { name: "Aug 18–22, 2026" })).toBeVisible();

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("option", { name: "Aug 18–22, 2026" })).not.toBeInTheDocument();
  expect(rangeButton).toHaveFocus();
});

test("shares the command-bar range with Analytics", async () => {
  const user = userEvent.setup();
  renderAdmin(
    <AdminShell title="Analytics">
      <AnalyticsScreen />
    </AdminShell>,
  );

  await screen.findByText("$9,420");
  const commandBar = screen.getByRole("heading", { level: 1, name: "Analytics" }).closest("header")!;
  await user.click(within(commandBar).getByRole("button", { name: /Date range:/ }));
  await user.click(screen.getByRole("menuitemradio", { name: "Aug 18–22, 2026" }));

  expect(await screen.findByRole("img", { name: /Aug 18–22, 2026/ }))
    .toHaveAttribute("data-point-count", "5");
  expect(screen.getByText("$7,395")).toBeVisible();
});

test("visibly distinguishes exact facts, modeled panels, and the retention snapshot", async () => {
  renderAdmin(<AnalyticsScreen />);

  await screen.findByRole("heading", { name: "Conversion trend" });
  const sectionFor = (heading: string) =>
    screen.getByRole("heading", { name: heading }).closest("section")!;

  const trend = sectionFor("Conversion trend");
  expect(within(trend).getByText("Exact dated facts")).toBeVisible();
  expect(trend).toHaveTextContent("Observed daily facts inside the selected range");
  const attribution = sectionFor("Campaign attribution");
  expect(within(attribution).getByText("Exact dated facts")).toBeVisible();
  expect(attribution).toHaveTextContent("Summed dated campaign events");

  for (const [heading, method] of [
    ["Conversion funnel", /baseline model/i],
    ["Revenue by source", /selected-range revenue ratio/i],
    ["Conversion by segment", /selected-range registration activity ratio/i],
    ["Lead velocity", /selected-range registration activity ratio/i],
    ["Offer performance", /selected-range registration activity ratio/i],
  ] as const) {
    const panel = sectionFor(heading);
    expect(within(panel).getByText("Modeled estimate")).toBeVisible();
    expect(panel).toHaveTextContent(method);
    expect(within(panel).queryByText("Exact dated facts")).not.toBeInTheDocument();
  }

  const retention = screen.getByText("Customer retention").closest("section")!;
  expect(within(retention).getByText("Latest available snapshot")).toBeVisible();
  expect(retention).toHaveTextContent("not a selected-period fact");
  expect(retention).not.toHaveTextContent("for the provider reporting period");
  expect(screen.queryByText("One reporting window is applied across trend, attribution, and funnel views."))
    .not.toBeInTheDocument();
});

test("does not show baseline funnel deltas as a recent-range comparison", async () => {
  const user = userEvent.setup();
  renderAdmin(<AnalyticsScreen />);

  await screen.findByRole("heading", { name: "Conversion funnel" });
  await user.click(screen.getByRole("button", { name: "Date range" }));
  await user.click(screen.getByRole("option", { name: "Aug 18–22, 2026" }));

  const funnel = screen.getByRole("heading", { name: "Conversion funnel" }).closest("section")!;
  expect(await within(funnel).findByText(/no period comparison is available/i)).toBeVisible();
  expect(within(funnel).queryByText(/vs Aug 9–15/i)).not.toBeInTheDocument();
  expect(within(funnel).getAllByText("Not available for modeled range")).toHaveLength(3);
});
