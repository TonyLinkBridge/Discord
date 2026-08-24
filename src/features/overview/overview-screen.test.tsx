import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { DiscordOverviewFacts } from "@/lib/member-sync/read-model";
import { renderAdmin } from "@/test/render";

import { OverviewScreen } from "./overview-screen";

const facts: DiscordOverviewFacts = {
  discordMembers: 1247,
  verifiedCustomers: 325,
  asOf: "2026-08-24T05:00:00.000Z",
};

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

test.each(["light", "dark"])(
  "shows only synchronized Discord facts in %s mode",
  (theme) => {
    document.documentElement.className = theme;
    renderAdmin(<OverviewScreen facts={facts} />);

    const metrics = screen.getByRole("region", { name: "Overview metrics" });
    expect(within(metrics).getByText("1,247")).toBeVisible();
    expect(within(metrics).getByText("325")).toBeVisible();
    expect(within(metrics).getAllByText("—")).toHaveLength(4);
    expect(within(metrics).getAllByText(/Latest Discord snapshot/)).toHaveLength(2);
    expect(screen.getByText("Discord data connected · RayName Marketing API pending"))
      .toBeVisible();
    expect(
      screen.getByRole("heading", { name: "RayName Marketing API pending" }),
    ).toBeVisible();

    for (const fakeSection of [
      "Conversion performance",
      "Today's priorities",
      "Conversion funnel",
      "High-intent leads",
      "Campaign performance",
    ]) {
      expect(screen.queryByRole("heading", { name: fakeSection }))
        .not.toBeInTheDocument();
    }
    expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();
    expect(screen.queryByText("$18,420")).not.toBeInTheDocument();
  },
);

test("shows no invented values before the first Discord snapshot", () => {
  renderAdmin(<OverviewScreen facts={null} />);

  expect(screen.getByText("Data source not connected")).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Overview metrics" }))
      .getAllByText("—"),
  ).toHaveLength(6);
  expect(screen.queryByText("1,247")).not.toBeInTheDocument();
});
