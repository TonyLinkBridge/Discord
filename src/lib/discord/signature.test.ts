import nacl from "tweetnacl";
import { describe, expect, test } from "vitest";

import { verifyDiscordSignature } from "./signature";

describe("verifyDiscordSignature", () => {
  const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(11));
  const body = JSON.stringify({ id: "123456789012345678", type: 1 });
  const timestamp = "1787500000";
  const signature = Buffer.from(
    nacl.sign.detached(
      Uint8Array.from(Buffer.from(timestamp + body)),
      keyPair.secretKey,
    ),
  ).toString("hex");
  const publicKeyHex = Buffer.from(keyPair.publicKey).toString("hex");

  test("accepts the exact body and timestamp Discord signed", () => {
    expect(
      verifyDiscordSignature({
        body,
        publicKeyHex,
        signatureHex: signature,
        timestamp,
      }),
    ).toBe(true);
  });

  test.each([
    { body: `${body} ` },
    { timestamp: "1787500001" },
    {
      publicKeyHex: Buffer.from(
        nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(12)).publicKey,
      ).toString("hex"),
    },
  ])("rejects altered signed input %#", (override) => {
    expect(
      verifyDiscordSignature({
        body,
        publicKeyHex,
        signatureHex: signature,
        timestamp,
        ...override,
      }),
    ).toBe(false);
  });

  test.each([
    { signatureHex: null, timestamp },
    { signatureHex: "zz", timestamp },
    { signatureHex: signature.slice(2), timestamp },
    { signatureHex: signature, timestamp: null },
    { signatureHex: signature, timestamp: "" },
  ])("rejects missing or malformed headers %#", (headers) => {
    expect(
      verifyDiscordSignature({ body, publicKeyHex, ...headers }),
    ).toBe(false);
  });
});
