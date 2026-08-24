import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { DiscordCommunityFacts } from "@/lib/member-sync/read-model";
import { renderAdmin } from "@/test/render";

import { CommunityScreen } from "./community-screen";

const facts: DiscordCommunityFacts = {
  activeMembers: 1240,
  leftMembers: 18,
  botMembers: 7,
  verifiedMembers: 325,
  roleDistribution: [
    { label: "Verified Customer", value: 325 },
    { label: "Domain Investor", value: 96 },
  ],
  asOf: "2026-08-24T05:00:00.000Z",
};

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

test.each(["light", "dark"])(
  "shows truthful synchronized community facts in %s mode",
  (theme) => {
    document.documentElement.className = theme;
    renderAdmin(<CommunityScreen facts={facts} />);

    const snapshot = screen.getByRole("region", { name: "Community snapshot" });
    expect(within(snapshot).getByText("1,240")).toBeVisible();
    expect(within(snapshot).getByText("18")).toBeVisible();
    expect(within(snapshot).getByText("7")).toBeVisible();
    expect(within(snapshot).getByText("325")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Role distribution" })).toBeVisible();
    expect(screen.getByText("Verified Customer")).toBeVisible();
    expect(screen.getByText("Domain Investor")).toBeVisible();
    expect(screen.getByText("Discord data connected · RayName Marketing API pending"))
      .toBeVisible();
    expect(screen.getByText(/Aug 24, 2026, 5:00 AM/)).toHaveAttribute(
      "datetime",
      facts.asOf,
    );

    for (const unavailable of [
      "Channel activity unavailable",
      "Onboarding unavailable",
      "Paid conversion unavailable",
    ]) {
      expect(screen.getByRole("heading", { name: unavailable })).toBeVisible();
    }
    expect(screen.queryByText(/% onboarding completion/)).not.toBeInTheDocument();
    expect(screen.queryByText(/community-to-customer conversion/))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/messages/)).not.toBeInTheDocument();
  },
);

test("renders an explicit empty role state without fabricating values", () => {
  renderAdmin(
    <CommunityScreen facts={{ ...facts, roleDistribution: [] }} />,
  );

  expect(screen.getByText("No assignable roles were present in the latest snapshot."))
    .toBeVisible();
});
