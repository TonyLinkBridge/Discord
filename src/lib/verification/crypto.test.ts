import { createHmac } from "node:crypto";

import { describe, expect, test } from "vitest";

import { createVerificationCrypto } from "./crypto";

describe("verification crypto", () => {
  const rootKey = Buffer.alloc(32, 7).toString("base64");

  test("encrypts and decrypts a normalized email", () => {
    const crypto = createVerificationCrypto(rootKey);
    const encrypted = crypto.encryptEmail(" USER@Example.COM ");

    expect(crypto.decryptEmail(encrypted)).toBe("user@example.com");
    expect(JSON.stringify(encrypted)).not.toContain("user@example.com");
  });

  test("uses a fresh IV for identical plaintext", () => {
    const crypto = createVerificationCrypto(rootKey);
    const first = crypto.encryptEmail("user@example.com");
    const second = crypto.encryptEmail("user@example.com");

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test("creates a deterministic normalized lookup hash with a derived key", () => {
    const crypto = createVerificationCrypto(rootKey);
    const derived = crypto.lookupHash(" USER@Example.COM ");
    const rawRootHash = createHmac("sha256", Buffer.from(rootKey, "base64"))
      .update("rayname-verification-email-v1\0")
      .update("user@example.com")
      .digest("hex");

    expect(derived).toBe(crypto.lookupHash("user@example.com"));
    expect(derived).not.toBe(rawRootHash);
  });

  test("rejects a root key that is not exactly 32 decoded bytes", () => {
    expect(() =>
      createVerificationCrypto(Buffer.alloc(31, 7).toString("base64")),
    ).toThrow("VERIFICATION_DATA_KEY must decode to exactly 32 bytes");
  });

  test("rejects tampered encrypted email data", () => {
    const crypto = createVerificationCrypto(rootKey);
    const encrypted = crypto.encryptEmail("user@example.com");

    expect(() =>
      crypto.decryptEmail({
        ...encrypted,
        authTag: Buffer.alloc(16, 1).toString("base64"),
      }),
    ).toThrow();
  });
});
