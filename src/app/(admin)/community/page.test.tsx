import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { renderAdmin } from "@/test/render";

const mocks = vi.hoisted(() => ({
  getDiscordFacts: vi.fn(),
  listMembers: vi.fn(),
  requireAdminActor: vi.fn(),
}));

vi.mock("@/lib/member-sync/runtime", () => ({
  createMemberSyncRuntime: () => ({
    ready: true,
    config: {
      guildId: "1540610722281824336",
      verifiedRoleId: "1540611679023276114",
    },
    repository: {
      getDiscordFacts: mocks.getDiscordFacts,
      listMembers: mocks.listMembers,
    },
  }),
}));

vi.mock("@/lib/require-admin-actor", () => ({
  requireAdminActor: mocks.requireAdminActor,
}));

vi.mock("@/lib/auth", () => ({
  getAdminAuthEnvironment: () => ({ environment: "production" }),
  getAuthenticatedDiscordUserId: vi.fn(),
}));

import CommunityPage from "./page";

beforeEach(() => {
  mocks.getDiscordFacts.mockReset().mockResolvedValue({
    activeMembers: 2,
    verifiedMembers: 1,
    botMembers: 0,
    roleDistribution: [
      {
        roleId: "1540611679023276114",
        label: "Verified Customer",
        value: 1,
      },
    ],
    lastSuccessfulSyncAt: "2026-08-24T05:00:00.000Z",
  });
  mocks.listMembers.mockReset().mockResolvedValue([
    {
      discordUserId: "223456789012345678",
      username: "member.one",
      globalName: null,
      guildDisplayName: "Member One",
      avatarHash: null,
      joinedAt: "2026-08-20T00:00:00.000Z",
      roleIds: ["1540611679023276114"],
      roleNames: ["Verified Customer"],
      isBot: false,
      membershipStatus: "active",
      verifiedAt: null,
      lastSeenAt: "2026-08-24T05:00:00.000Z",
      leftAt: null,
    },
  ]);
  mocks.requireAdminActor.mockReset().mockResolvedValue("323456789012345678");
});

test("mounts synchronized Discord Community facts", async () => {
  renderAdmin(await CommunityPage());

  expect(screen.getByRole("heading", { name: "Role distribution" })).toBeVisible();
  expect(screen.getByText("Verified Customer")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Channel activity unavailable" }))
    .toBeVisible();
  expect(mocks.requireAdminActor).toHaveBeenCalledOnce();
});

test("does not mount a sample community when snapshot storage fails", async () => {
  mocks.listMembers.mockRejectedValue(new Error("database unavailable"));

  renderAdmin(await CommunityPage());

  expect(screen.getByRole("heading", { name: "Community data is not connected" }))
    .toBeVisible();
  expect(screen.queryByText("1,248")).not.toBeInTheDocument();
});
