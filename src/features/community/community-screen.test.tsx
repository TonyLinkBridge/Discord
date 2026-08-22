import { screen } from "@testing-library/react";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { localAdminSeed } from "@/lib/admin-data/seed";
import { renderAdmin } from "@/test/render";
import { CommunityScreen } from "./community-screen";

test("shows the community health and conversion sections", async () => {
  renderAdmin(<CommunityScreen />);

  expect(await screen.findByRole("heading", { name: "Member growth" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Role distribution" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Channel activity" })).toBeVisible();
  expect(screen.getByText("78% onboarding completion")).toBeVisible();
  expect(screen.getByText("13.5% community-to-customer conversion")).toBeVisible();
});

test("reads community outcomes from the configured admin data provider", async () => {
  const seed = structuredClone(localAdminSeed);
  seed.community.memberGrowth[6] = {
    date: "2026-08-22",
    totalMembers: 1500,
    activeMembers: 620,
  };
  seed.community.roleDistribution[0] = { label: "Collectors", value: 501 };
  seed.community.channelActivity[0] = {
    channel: "#domain-lab",
    messages: 777,
    activeMembers: 203,
  };

  renderAdmin(<CommunityScreen />, {
    provider: createLocalAdminDataProvider(seed),
  });

  expect(await screen.findByRole("img", { name: "Member growth chart" })).toBeVisible();
  expect(screen.getByRole("cell", { name: "1500" })).toBeVisible();
  expect(screen.getByText("Collectors")).toBeVisible();
  expect(screen.getByText("#domain-lab")).toBeVisible();
  expect(screen.getByText("777 messages")).toBeVisible();
});
