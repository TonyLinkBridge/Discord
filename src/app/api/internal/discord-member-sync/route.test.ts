import { describe, expect, test, vi } from "vitest";

import { createDiscordMemberSyncGet } from "./route";

const url = "http://localhost/api/internal/discord-member-sync";

function request(authorization?: string): Request {
  return new Request(url, {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("Discord member sync cron route", () => {
  test("fails closed when CRON_SECRET is absent", async () => {
    const run = vi.fn();
    const get = createDiscordMemberSyncGet({
      getSecret: () => undefined,
      run,
    });

    const response = await get(request("Bearer undefined"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Member synchronization unavailable",
    });
    expect(run).not.toHaveBeenCalled();
  });

  test.each([undefined, "Bearer wrong-secret", "test-cron-secret"])(
    "rejects unauthorized cron header %s",
    async (authorization) => {
      const run = vi.fn();
      const get = createDiscordMemberSyncGet({
        getSecret: () => "test-cron-secret",
        run,
      });

      const response = await get(request(authorization));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
      expect(run).not.toHaveBeenCalled();
    },
  );

  test("compares CRON_SECRET byte-for-byte without trimming it", async () => {
    const run = vi.fn().mockResolvedValue({
      status: "succeeded",
      runId: "run-1",
      memberCount: 0,
      activeMemberCount: 0,
      botCount: 0,
      completedAt: "2026-08-24T04:00:00.000Z",
    });
    const get = createDiscordMemberSyncGet({
      getSecret: () => " test-cron-secret ",
      run,
    });

    expect((await get(request("Bearer test-cron-secret"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  test("returns only safe counts for a completed run", async () => {
    const run = vi.fn().mockResolvedValue({
      status: "succeeded",
      runId: "run-1",
      memberCount: 42,
      activeMemberCount: 41,
      botCount: 1,
      completedAt: "2026-08-24T04:00:00.000Z",
    });
    const get = createDiscordMemberSyncGet({
      getSecret: () => "test-cron-secret",
      run,
    });

    const response = await get(request("Bearer test-cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "succeeded",
      runId: "run-1",
      memberCount: 42,
      activeMemberCount: 41,
      botCount: 1,
      completedAt: "2026-08-24T04:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("members");
    expect(JSON.stringify(body)).not.toContain("test-cron-secret");
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("returns conflict when the guild already has a running sync", async () => {
    const run = vi.fn().mockResolvedValue({
      status: "already-running",
      runId: "run-live",
      startedAt: "2026-08-24T03:59:00.000Z",
    });
    const get = createDiscordMemberSyncGet({
      getSecret: () => "test-cron-secret",
      run,
    });

    const response = await get(request("Bearer test-cron-secret"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      status: "already-running",
      runId: "run-live",
      startedAt: "2026-08-24T03:59:00.000Z",
    });
  });

  test("returns only the safe service failure", async () => {
    const run = vi.fn().mockResolvedValue({
      status: "failed",
      runId: "run-1",
      failure: {
        code: "members_intent_required",
        safeMessage:
          "Enable Server Members Intent for RayFox in the Discord Developer Portal",
        retryable: false,
      },
    });
    const get = createDiscordMemberSyncGet({
      getSecret: () => "test-cron-secret",
      run,
    });

    const response = await get(request("Bearer test-cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "failed",
      runId: "run-1",
      failure: {
        code: "members_intent_required",
        safeMessage:
          "Enable Server Members Intent for RayFox in the Discord Developer Portal",
        retryable: false,
      },
    });
    expect(JSON.stringify(body)).not.toContain("Bot ");
  });

  test("maps an unexpected runtime exception to one generic response", async () => {
    const get = createDiscordMemberSyncGet({
      getSecret: () => "test-cron-secret",
      run: vi.fn().mockRejectedValue(new Error("database URL and token")),
    });

    const response = await get(request("Bearer test-cron-secret"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Member synchronization unavailable",
    });
  });
});
