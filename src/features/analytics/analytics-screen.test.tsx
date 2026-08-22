import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
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
});

test("retries a failed provider read from an explicit operator action", async () => {
  const user = userEvent.setup();
  const provider = createLocalAdminDataProvider();
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
