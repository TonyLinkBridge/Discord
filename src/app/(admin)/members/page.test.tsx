import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { createVerificationAvailability } from "@/lib/admin-data/availability";
import { createUnavailableAdminDataStore } from "@/lib/admin-data/unavailable-provider";
import type { VerificationReviewRow } from "@/lib/verification/types";
import { renderAdmin } from "@/test/render";

const mocks = vi.hoisted(() => ({
  getDiscordFacts: vi.fn(),
  getLatestStatus: vi.fn(),
  listForAdmin: vi.fn(),
  requireAdminActor: vi.fn(),
}));

vi.mock("@/lib/verification/runtime", () => ({
  createVerificationRuntime: () => ({
    ready: true,
    service: { listForAdmin: mocks.listForAdmin },
  }),
}));

vi.mock("@/lib/require-admin-actor", () => ({
  requireAdminActor: mocks.requireAdminActor,
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
      getLatestStatus: mocks.getLatestStatus,
    },
  }),
}));

vi.mock("@/lib/auth", () => ({
  getAdminAuthEnvironment: () => ({ environment: "production" }),
  getAuthenticatedDiscordUserId: vi.fn(),
}));

import MembersPage from "./page";

const pending: VerificationReviewRow = {
  id: "72345678-1234-4234-8234-123456789012",
  discordUserId: "223456789012345678",
  displayName: "DomainNomad",
  discordHandle: "domain.nomad",
  email: "owner@example.com",
  domain: "example.com",
  status: "pending",
  createdAt: "2026-08-23T00:00:00.000Z",
  reviewedAt: null,
  roleAssignedAt: null,
  safeFailure: null,
};

beforeEach(() => {
  mocks.listForAdmin.mockReset().mockResolvedValue([pending]);
  mocks.getDiscordFacts.mockReset().mockResolvedValue({
    activeMembers: 41,
    verifiedMembers: 20,
    botMembers: 1,
    roleDistribution: [],
    lastSuccessfulSyncAt: "2026-08-24T05:00:00.000Z",
  });
  mocks.getLatestStatus.mockReset().mockResolvedValue({
    state: "ready",
    lastRunId: "run-1",
    lastRunStatus: "succeeded",
    lastRunTrigger: "manual",
    lastRunStartedAt: "2026-08-24T04:59:00.000Z",
    lastRunCompletedAt: "2026-08-24T05:00:00.000Z",
    lastSuccessfulSyncAt: "2026-08-24T05:00:00.000Z",
    safeErrorCode: null,
    safeErrorMessage: null,
  });
  mocks.requireAdminActor.mockReset().mockResolvedValue("323456789012345678");
});

test("loads the real verification queue only after independent admin authorization", async () => {
  const config = {
    workspaceName: "RayName Discord Community",
    timezone: "UTC",
    discordServerName: "RayName Domain Club",
    discordOAuthConfigured: true,
    rayNameApiConfigured: false,
    operatorAllowlist: ["323456789012345678"],
  };
  const availability = createVerificationAvailability({
    ...config,
    databaseStatus: "connected",
    discordBotConfigured: true,
  });
  const provider = createUnavailableAdminDataStore(availability, config);
  const page = await MembersPage({ searchParams: Promise.resolve({}) });

  renderAdmin(page, { provider });

  expect(mocks.requireAdminActor).toHaveBeenCalledOnce();
  expect(mocks.listForAdmin).toHaveBeenCalledOnce();
  expect(mocks.getLatestStatus).toHaveBeenCalledWith("1540610722281824336");
  expect(mocks.getDiscordFacts).toHaveBeenCalledWith(
    "1540610722281824336",
    "1540611679023276114",
  );
  expect(
    screen.getByRole("heading", { name: "Discord member sync" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Customer verification queue" }),
  ).toBeVisible();
  expect(screen.getByText("DomainNomad")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Member data is not connected" }),
  ).toBeVisible();
  expect(screen.getAllByRole("main")).toHaveLength(1);
});

test("keeps the verification queue when member sync status storage is degraded", async () => {
  mocks.getLatestStatus.mockRejectedValue(new Error("database unavailable"));
  const config = {
    workspaceName: "RayName Discord Community",
    timezone: "UTC",
    discordServerName: "RayName Domain Club",
    discordOAuthConfigured: true,
    rayNameApiConfigured: false,
    operatorAllowlist: ["323456789012345678"],
  };
  const availability = createVerificationAvailability({
    ...config,
    databaseStatus: "connected",
    discordBotConfigured: true,
  });
  const provider = createUnavailableAdminDataStore(availability, config);
  const page = await MembersPage({ searchParams: Promise.resolve({}) });

  renderAdmin(page, { provider });

  expect(
    screen.getByRole("heading", { name: "Customer verification queue" }),
  ).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Discord member sync" }))
    .not.toBeInTheDocument();
});

test("keeps one main landmark when both member capabilities are unavailable", async () => {
  const config = {
    workspaceName: "RayName Discord Community",
    timezone: "UTC",
    discordServerName: "RayName Domain Club",
    discordOAuthConfigured: true,
    rayNameApiConfigured: false,
    operatorAllowlist: ["323456789012345678"],
  };
  const availability = createVerificationAvailability({
    ...config,
    databaseStatus: "not-connected",
    discordBotConfigured: false,
  });
  const provider = createUnavailableAdminDataStore(availability, config);
  const page = await MembersPage({ searchParams: Promise.resolve({}) });

  renderAdmin(page, { provider });

  expect(
    screen.getByRole("heading", { name: "Verification queue is not connected" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Member data is not connected" }),
  ).toBeVisible();
  expect(screen.getAllByRole("main")).toHaveLength(1);
});
