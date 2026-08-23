import { describe, expect, test, vi } from "vitest";

import { createVerificationRetentionGet } from "./route";

describe("verification retention route", () => {
  test("rejects missing and incorrect cron authorization", async () => {
    const purge = vi.fn();
    const get = createVerificationRetentionGet({
      getSecret: () => "test-cron-secret",
      purge,
    });

    for (const authorization of [null, "Bearer wrong-secret"]) {
      const headers = authorization ? { authorization } : undefined;
      const response = await get(
        new Request("http://localhost/api/internal/verification-retention", {
          headers,
        }),
      );
      expect(response.status).toBe(401);
    }
    expect(purge).not.toHaveBeenCalled();
  });

  test("returns only the idempotent purge count for an authorized call", async () => {
    const purge = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const get = createVerificationRetentionGet({
      getSecret: () => "test-cron-secret",
      purge,
    });
    const request = () =>
      new Request("http://localhost/api/internal/verification-retention", {
        headers: { authorization: "Bearer test-cron-secret" },
      });

    await expect((await get(request())).json()).resolves.toEqual({ purged: 2 });
    const second = await get(request());
    const secondBody = await second.json();
    expect(secondBody).toEqual({ purged: 0 });
    expect(JSON.stringify(secondBody)).not.toContain("ciphertext");
  });

  test("fails closed when CRON_SECRET is absent", async () => {
    const purge = vi.fn();
    const get = createVerificationRetentionGet({
      getSecret: () => undefined,
      purge,
    });
    const response = await get(
      new Request("http://localhost/api/internal/verification-retention", {
        headers: { authorization: "Bearer undefined" },
      }),
    );

    expect(response.status).toBe(503);
    expect(purge).not.toHaveBeenCalled();
  });
});
