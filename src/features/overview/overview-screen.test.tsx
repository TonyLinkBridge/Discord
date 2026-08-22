import { cleanup, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { localAdminSeed } from "@/lib/admin-data/seed";
import { renderAdmin } from "@/test/render";
import { OverviewScreen } from "./overview-screen";

const approvedMetrics = [
  ["Discord Members", "1,248"],
  ["Verified Customers", "326"],
  ["Registrations", "84"],
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

    expect(
      [...container.querySelectorAll("h2")].map((heading) => heading.textContent),
    ).toEqual(approvedSections);
  },
);

test("reads Overview values from the configured admin data provider", async () => {
  const seed = structuredClone(localAdminSeed);
  seed.overview.metrics[0] = {
    ...seed.overview.metrics[0],
    value: "9,999",
  };

  renderAdmin(<OverviewScreen />, {
    provider: createLocalAdminDataProvider(seed),
  });

  expect(await screen.findByText("9,999")).toBeVisible();
  expect(screen.queryByText("1,248")).not.toBeInTheDocument();
});
