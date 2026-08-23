import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import { z } from "zod";

const invalidDomainMessage = "Enter a valid domain name";

export function normalizeVerificationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeVerificationDomain(value: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    /\s/.test(trimmed) ||
    trimmed.includes("://") ||
    /[/\\?#@]/.test(trimmed) ||
    isIP(trimmed) !== 0
  ) {
    throw new Error(invalidDomainMessage);
  }

  const withoutTrailingDot = trimmed.endsWith(".")
    ? trimmed.slice(0, -1)
    : trimmed;
  const ascii = domainToASCII(withoutTrailingDot).toLowerCase();
  const labels = ascii.split(".");

  if (
    !ascii ||
    ascii.length > 253 ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9-]+$/.test(label) ||
        label.startsWith("-") ||
        label.endsWith("-"),
    )
  ) {
    throw new Error(invalidDomainMessage);
  }

  return ascii;
}

export const verificationSubmissionSchema = z
  .object({
    discordUserId: z.string().regex(/^\d{17,20}$/),
    guildId: z.string().regex(/^\d{17,20}$/),
    displayName: z.string().trim().min(1).max(100),
    discordHandle: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.email())
      .transform(normalizeVerificationEmail),
    domain: z
      .string()
      .trim()
      .max(253)
      .transform((domain) =>
        domain ? normalizeVerificationDomain(domain) : null,
      ),
  })
  .strict();

export type VerificationSubmission = z.infer<
  typeof verificationSubmissionSchema
>;
