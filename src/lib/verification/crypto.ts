import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { normalizeVerificationEmail } from "./input";

const encryptionInfo = "rayname-verification-encryption-v1";
const lookupInfo = "rayname-verification-lookup-v1";
const hkdfSalt = "rayname-verification-root-v1";
const encryptionAad = Buffer.from("rayname-verification-email-v1\0");
const emailLookupPrefix = "rayname-verification-email-v1\0";

export type EncryptedEmail = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type VerificationCrypto = {
  encryptEmail(email: string): EncryptedEmail;
  decryptEmail(encrypted: EncryptedEmail): string;
  lookupHash(email: string): string;
};

function deriveKey(rootKey: Buffer, info: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", rootKey, Buffer.from(hkdfSalt), Buffer.from(info), 32),
  );
}

export function createVerificationCrypto(base64RootKey: string): VerificationCrypto {
  const rootKey = Buffer.from(base64RootKey, "base64");
  if (rootKey.length !== 32) {
    throw new Error("VERIFICATION_DATA_KEY must decode to exactly 32 bytes");
  }

  const encryptionKey = deriveKey(rootKey, encryptionInfo);
  const lookupKey = deriveKey(rootKey, lookupInfo);

  return {
    encryptEmail(email) {
      const normalizedEmail = normalizeVerificationEmail(email);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      cipher.setAAD(encryptionAad);
      const ciphertext = Buffer.concat([
        cipher.update(normalizedEmail, "utf8"),
        cipher.final(),
      ]);

      return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
      };
    },

    decryptEmail(encrypted) {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(encrypted.iv, "base64"),
      );
      decipher.setAAD(encryptionAad);
      decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },

    lookupHash(email) {
      return createHmac("sha256", lookupKey)
        .update(emailLookupPrefix)
        .update(normalizeVerificationEmail(email))
        .digest("hex");
    },
  };
}
