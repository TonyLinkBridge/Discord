import { describe, expect, test } from "vitest";
import {
  evaluateAdminAccess,
  normalizeAdminDiscordUserIds,
  resolveAdminAuthEnvironment,
} from "./access-policy";

describe("evaluateAdminAccess", () => {
  test.each([
    [
      {
        environment: "production" as const,
        authenticatedUserId: null,
        allowlist: ["42"],
        credentialsReady: true,
      },
      "sign-in",
    ],
    [
      {
        environment: "production" as const,
        authenticatedUserId: "7",
        allowlist: ["42"],
        credentialsReady: true,
      },
      "deny",
    ],
    [
      {
        environment: "production" as const,
        authenticatedUserId: "42",
        allowlist: ["42"],
        credentialsReady: true,
      },
      "allow",
    ],
    [
      {
        environment: "production" as const,
        authenticatedUserId: "42",
        allowlist: [],
        credentialsReady: false,
      },
      "misconfigured",
    ],
    [
      {
        environment: "development" as const,
        authenticatedUserId: "local-ray",
        allowlist: [],
        credentialsReady: false,
      },
      "allow",
    ],
  ])("evaluates admin access without failing open", (input, expected) => {
    expect(evaluateAdminAccess(input)).toBe(expected);
  });

  test("does not treat an empty development operator identity as a bypass", () => {
    expect(
      evaluateAdminAccess({
        environment: "development",
        authenticatedUserId: "   ",
        allowlist: [],
        credentialsReady: false,
      }),
    ).toBe("misconfigured");
  });

  test("does not apply the development bypass in test", () => {
    expect(
      evaluateAdminAccess({
        environment: "test",
        authenticatedUserId: "local-ray",
        allowlist: [],
        credentialsReady: false,
      }),
    ).toBe("misconfigured");
  });
});

describe("normalizeAdminDiscordUserIds", () => {
  test("trims entries, removes empty entries, and de-duplicates IDs", () => {
    expect(normalizeAdminDiscordUserIds(" 42,7,, 42 ,   ")).toEqual(["42", "7"]);
  });

  test("returns an empty allowlist for an absent value", () => {
    expect(normalizeAdminDiscordUserIds(undefined)).toEqual([]);
  });
});

describe("resolveAdminAuthEnvironment", () => {
  test("marks production ready only when OAuth credentials, secret, and an admin ID are present", () => {
    expect(
      resolveAdminAuthEnvironment({
        NODE_ENV: "production",
        AUTH_SECRET: " secret ",
        AUTH_DISCORD_ID: " client-id ",
        AUTH_DISCORD_SECRET: " client-secret ",
        ADMIN_DISCORD_USER_IDS: " 42, 7 ",
        DEV_OPERATOR_ID: "local-ray",
      }),
    ).toEqual({
      environment: "production",
      credentialsReady: true,
      allowlist: ["42", "7"],
      developmentOperatorId: null,
    });
  });

  test("fails closed when any production credential is blank", () => {
    expect(
      resolveAdminAuthEnvironment({
        NODE_ENV: "production",
        AUTH_SECRET: " ",
        AUTH_DISCORD_ID: "client-id",
        AUTH_DISCORD_SECRET: "client-secret",
        ADMIN_DISCORD_USER_IDS: "42",
      }).credentialsReady,
    ).toBe(false);
  });

  test("enables the operator bypass only for a nonempty development ID", () => {
    expect(
      resolveAdminAuthEnvironment({ NODE_ENV: "development", DEV_OPERATOR_ID: " local-ray " })
        .developmentOperatorId,
    ).toBe("local-ray");
    expect(
      resolveAdminAuthEnvironment({ NODE_ENV: "development", DEV_OPERATOR_ID: "   " })
        .developmentOperatorId,
    ).toBeNull();
  });
});
