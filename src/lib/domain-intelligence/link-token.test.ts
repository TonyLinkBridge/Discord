import { createHmac, timingSafeEqual } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import {
  createOutboundToken,
  verifyOutboundToken,
} from "./link-token";

const signingKey = Buffer.alloc(32, 17).toString("base64");
const now = new Date("2026-08-26T00:00:00.000Z");
const requestId = "9cd5530b-3527-4af0-bf5d-27b2a3284ab1";

describe("RayFox outbound link tokens", () => {
  test("round-trips only the request, action, and 24-hour expiry", () => {
    const token = createOutboundToken({
      requestId,
      action: "register",
      now,
      signingKey,
    });
    const [encodedPayload] = token.split(".");

    expect(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    ).toEqual({
      requestId,
      action: "register",
      expiresAt: 1787788800,
    });
    expect(
      verifyOutboundToken({ token, signingKey, now }),
    ).toEqual({
      requestId,
      action: "register",
      expiresAt: 1787788800,
    });
  });

  test("rejects a tampered signature", () => {
    const token = createOutboundToken({
      requestId,
      action: "transfer",
      now,
      signingKey,
    });
    const [payload, signature] = token.split(".");
    const replacement = signature.endsWith("A") ? "B" : "A";

    expect(
      verifyOutboundToken({
        token: `${payload}.${signature.slice(0, -1)}${replacement}`,
        signingKey,
        now,
      }),
    ).toBeNull();
  });

  test("rejects expired, malformed, and invalid-action payloads", () => {
    const expired = createOutboundToken({
      requestId,
      action: "full_intelligence",
      now,
      signingKey,
    });
    expect(
      verifyOutboundToken({
        token: expired,
        signingKey,
        now: new Date("2026-08-27T00:00:01.000Z"),
      }),
    ).toBeNull();

    expect(
      verifyOutboundToken({ token: "not-a-token", signingKey, now }),
    ).toBeNull();

    const invalidActionPayload = Buffer.from(
      JSON.stringify({
        requestId,
        action: "delete_everything",
        expiresAt: 1787788800,
      }),
    ).toString("base64url");
    const signature = createHmac(
      "sha256",
      Buffer.from(signingKey, "base64"),
    )
      .update(invalidActionPayload)
      .digest("base64url");
    expect(
      verifyOutboundToken({
        token: `${invalidActionPayload}.${signature}`,
        signingKey,
        now,
      }),
    ).toBeNull();
  });

  test("uses a timing-safe comparison for valid-length signatures", () => {
    const compare = vi.fn(timingSafeEqual);
    const token = createOutboundToken({
      requestId,
      action: "continue_on_site",
      now,
      signingKey,
    });

    expect(
      verifyOutboundToken({ token, signingKey, now, timingSafeEqual: compare }),
    ).not.toBeNull();
    expect(compare).toHaveBeenCalledOnce();
    expect(compare.mock.calls[0][0]).toHaveLength(32);
    expect(compare.mock.calls[0][1]).toHaveLength(32);
  });
});
