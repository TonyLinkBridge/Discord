import { describe, expect, test, vi } from "vitest";

import { AdminAuthenticationError, requireAdminActor } from "./require-admin-actor";
import type { ResolvedAdminAuthEnvironment } from "@/features/auth/access-policy";

const productionEnvironment = (
  overrides: Partial<ResolvedAdminAuthEnvironment> = {},
): ResolvedAdminAuthEnvironment => ({
  allowlist: ["42"],
  credentialsReady: true,
  developmentOperatorId: null,
  environment: "production",
  ...overrides,
});

describe("requireAdminActor", () => {
  test.each([
    [
      "misconfigured production",
      productionEnvironment({ credentialsReady: false }),
      "42",
      "misconfigured",
    ],
    ["missing production session", productionEnvironment(), null, "unauthenticated"],
    ["revoked production session", productionEnvironment(), "7", "forbidden"],
  ] as const)("fails closed for %s", async (_label, environment, authenticatedUserId, code) => {
    const getAuthenticatedUserId = vi.fn().mockResolvedValue(authenticatedUserId);

    await expect(requireAdminActor({
      getAuthenticatedUserId,
      getEnvironment: () => environment,
    })).rejects.toEqual(expect.objectContaining<Partial<AdminAuthenticationError>>({ code }));
  });

  test("returns the current allowlisted Discord identity", async () => {
    await expect(requireAdminActor({
      getAuthenticatedUserId: vi.fn().mockResolvedValue(" 42 "),
      getEnvironment: () => productionEnvironment(),
    })).resolves.toBe("42");
  });

  test("returns the explicit development operator without reading a session", async () => {
    const getAuthenticatedUserId = vi.fn().mockResolvedValue("42");

    await expect(requireAdminActor({
      getAuthenticatedUserId,
      getEnvironment: () => ({
        allowlist: [],
        credentialsReady: false,
        developmentOperatorId: "local-ray",
        environment: "development",
      }),
    })).resolves.toBe("local-ray");
    expect(getAuthenticatedUserId).not.toHaveBeenCalled();
  });

  test("ignores a development bypass identity in production", async () => {
    await expect(requireAdminActor({
      getAuthenticatedUserId: vi.fn().mockResolvedValue(null),
      getEnvironment: () => productionEnvironment({ developmentOperatorId: "local-ray" }),
    })).rejects.toEqual(expect.objectContaining<Partial<AdminAuthenticationError>>({
      code: "unauthenticated",
    }));
  });

  test("requires the allowlist in development when no explicit operator is configured", async () => {
    await expect(requireAdminActor({
      getAuthenticatedUserId: vi.fn().mockResolvedValue("7"),
      getEnvironment: () => ({
        allowlist: ["42"],
        credentialsReady: true,
        developmentOperatorId: null,
        environment: "development",
      }),
    })).rejects.toEqual(expect.objectContaining<Partial<AdminAuthenticationError>>({
      code: "forbidden",
    }));
  });
});
