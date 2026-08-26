import "server-only";

import {
  createHmac,
  timingSafeEqual as nodeTimingSafeEqual,
} from "node:crypto";

import type { DomainConversionAction } from "./repository";

const tokenLifetimeSeconds = 24 * 60 * 60;
const tokenSegmentPattern = /^[A-Za-z0-9_-]+$/;
const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validActions = new Set<DomainConversionAction>([
  "register",
  "transfer",
  "full_intelligence",
  "continue_on_site",
]);

export type OutboundTokenPayload = {
  requestId: string;
  action: DomainConversionAction;
  expiresAt: number;
};

function signingKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("Outbound link signing key must contain 32 bytes");
  }
  return key;
}

function signature(encodedPayload: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(encodedPayload).digest();
}

export function createOutboundToken(input: {
  requestId: string;
  action: DomainConversionAction;
  now: Date;
  signingKey: string;
}): string {
  if (!requestIdPattern.test(input.requestId)) {
    throw new Error("Outbound request ID is invalid");
  }
  if (!validActions.has(input.action)) {
    throw new Error("Outbound action is invalid");
  }
  const payload: OutboundTokenPayload = {
    requestId: input.requestId,
    action: input.action,
    expiresAt: Math.floor(input.now.getTime() / 1000) + tokenLifetimeSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, signingKey(input.signingKey)).toString("base64url")}`;
}

export function verifyOutboundToken(input: {
  token: string;
  signingKey: string;
  now: Date;
  timingSafeEqual?: (left: Uint8Array, right: Uint8Array) => boolean;
}): OutboundTokenPayload | null {
  try {
    const parts = input.token.split(".");
    if (
      parts.length !== 2 ||
      !parts[0] ||
      !parts[1] ||
      !tokenSegmentPattern.test(parts[0]) ||
      !tokenSegmentPattern.test(parts[1])
    ) {
      return null;
    }
    const supplied = Buffer.from(parts[1], "base64url");
    const expected = signature(parts[0], signingKey(input.signingKey));
    if (supplied.length !== expected.length) return null;
    const compare = input.timingSafeEqual ?? nodeTimingSafeEqual;
    if (!compare(supplied, expected)) return null;

    const parsed: unknown = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const payload = parsed as Record<string, unknown>;
    if (
      Object.keys(payload).length !== 3 ||
      !requestIdPattern.test(String(payload.requestId ?? "")) ||
      typeof payload.action !== "string" ||
      !validActions.has(payload.action as DomainConversionAction) ||
      !Number.isInteger(payload.expiresAt) ||
      Number(payload.expiresAt) <= Math.floor(input.now.getTime() / 1000)
    ) {
      return null;
    }
    return {
      requestId: payload.requestId as string,
      action: payload.action as DomainConversionAction,
      expiresAt: payload.expiresAt as number,
    };
  } catch {
    return null;
  }
}
