import { describe, expect, test, vi } from "vitest";

import { requireAdminActor } from "@/lib/require-admin-actor";

import { executeDiscordMemberSyncNow } from "./member-sync-actions";

describe("manual Discord member sync action", () => {
  test.each([
    new Error("unauthenticated"),
    new Error("revoked session"),
    new Error("not allowlisted"),
  ])("does not run when server authorization rejects the actor", async (error) => {
    const sync = vi.fn();

    await expect(
      executeDiscordMemberSyncNow({
        requireActor: vi.fn().mockRejectedValue(error),
        sync,
        revalidate: vi.fn(),
      }),
    ).resolves.toEqual({
      state: "failed",
      message: "Unable to start member synchronization.",
      retryable: false,
    });
    expect(sync).not.toHaveBeenCalled();
  });

  test("uses only the authenticated actor as requestedBy and revalidates success", async () => {
    const sync = vi.fn().mockResolvedValue({
      status: "succeeded",
      runId: "run-1",
      memberCount: 42,
      activeMemberCount: 41,
      botCount: 1,
      completedAt: "2026-08-24T05:00:00.000Z",
    });
    const revalidate = vi.fn();

    await expect(
      executeDiscordMemberSyncNow({
        requireActor: vi.fn().mockResolvedValue("authenticated-admin"),
        sync,
        revalidate,
      }),
    ).resolves.toEqual({
      state: "succeeded",
      memberCount: 42,
      completedAt: "2026-08-24T05:00:00.000Z",
    });
    expect(sync).toHaveBeenCalledWith("authenticated-admin");
    expect(revalidate).toHaveBeenCalledWith("/members");
  });

  test("maps an existing run and a safe failure without returning run IDs", async () => {
    const base = {
      requireActor: vi.fn().mockResolvedValue("authenticated-admin"),
      revalidate: vi.fn(),
    };

    await expect(
      executeDiscordMemberSyncNow({
        ...base,
        sync: vi.fn().mockResolvedValue({
          status: "already-running",
          runId: "secret-operational-run-id",
          startedAt: "2026-08-24T05:00:00.000Z",
        }),
      }),
    ).resolves.toEqual({
      state: "already-running",
      startedAt: "2026-08-24T05:00:00.000Z",
    });

    await expect(
      executeDiscordMemberSyncNow({
        ...base,
        sync: vi.fn().mockResolvedValue({
          status: "failed",
          runId: "secret-operational-run-id",
          failure: {
            code: "rate_limited",
            safeMessage: "Discord is rate limiting member synchronization",
            retryable: true,
            retryAfterSeconds: 30,
          },
        }),
      }),
    ).resolves.toEqual({
      state: "failed",
      message: "Discord is rate limiting member synchronization",
      retryable: true,
    });
    expect(base.revalidate).not.toHaveBeenCalled();
  });

  test("does not honor DEV_OPERATOR_ID in production", async () => {
    const sync = vi.fn();

    const result = await executeDiscordMemberSyncNow({
      requireActor: () =>
        requireAdminActor({
          getAuthenticatedUserId: async () => null,
          getEnvironment: () => ({
            environment: "production",
            credentialsReady: true,
            allowlist: ["real-admin"],
            developmentOperatorId: "dev-operator-must-be-ignored",
          }),
        }),
      sync,
      revalidate: vi.fn(),
    });

    expect(result.state).toBe("failed");
    expect(sync).not.toHaveBeenCalled();
  });
});
