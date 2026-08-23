import "server-only";

import nacl from "tweetnacl";

const publicKeyPattern = /^[0-9a-f]{64}$/i;
const signaturePattern = /^[0-9a-f]{128}$/i;
const timestampPattern = /^\d{1,20}$/;

function bytesFromHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function verifyDiscordSignature(input: {
  body: string;
  publicKeyHex: string;
  signatureHex: string | null;
  timestamp: string | null;
}): boolean {
  if (
    !input.signatureHex ||
    !input.timestamp ||
    !publicKeyPattern.test(input.publicKeyHex) ||
    !signaturePattern.test(input.signatureHex) ||
    !timestampPattern.test(input.timestamp)
  ) {
    return false;
  }

  try {
    return nacl.sign.detached.verify(
      Uint8Array.from(Buffer.from(input.timestamp + input.body)),
      bytesFromHex(input.signatureHex),
      bytesFromHex(input.publicKeyHex),
    );
  } catch {
    return false;
  }
}
