import { describe, expect, test } from "vitest";

import { adminMutationCommandSchema, type AdminMutationCommand } from "./mutation-command";

const commands = [
  { kind: "complete-priority", priorityId: "verify-new-members" },
  { kind: "update-lead-action", leadId: "alex-chen", action: "send-offer" },
  { kind: "complete-lead-action", leadId: "alex-chen", action: "message" },
  { kind: "update-member", memberId: "alex-chen", patch: { roles: ["VIP"] } },
  { kind: "verify-member", memberId: "domainnomad" },
  { kind: "record-member-action", memberId: "alex-chen", action: "open-ticket" },
  {
    kind: "create-tracked-link",
    input: {
      campaign: "com-transfer-week",
      content: "lead-detail",
      destination: "https://www.rayname.com/domain/search",
      medium: "community",
      source: "discord",
    },
  },
  {
    kind: "create-campaign-with-tracked-link",
    input: {
      audience: "Builders",
      channel: "discord",
      destination: "https://www.rayname.com/domain/search",
      endDate: "2026-08-30",
      name: "Builder referral push",
      objective: "Convert builder referrals",
      startDate: "2026-08-23",
      status: "scheduled",
    },
    tracking: {
      campaign: "builder-referral-push",
      content: "campaign-form",
      destination: "https://www.rayname.com/domain/search",
      medium: "community",
      source: "discord",
    },
  },
  {
    kind: "update-offer",
    offerId: "com-transfer-offer",
    patch: { cta: "View transfer guide", status: "expired" },
  },
  {
    kind: "update-content-entry",
    entryId: "market-pulse-aug-22",
    patch: { status: "scheduled", title: "Updated title" },
    precondition: { expectedStatus: "scheduled" },
  },
  {
    kind: "approve-verification",
    requestId: "72345678-1234-4234-8234-123456789012",
  },
  {
    kind: "reject-verification",
    requestId: "72345678-1234-4234-8234-123456789012",
    reason: "Account details did not match",
  },
  {
    kind: "retry-verification-role",
    requestId: "72345678-1234-4234-8234-123456789012",
  },
] satisfies AdminMutationCommand[];

describe("adminMutationCommandSchema", () => {
  test.each(commands)("accepts the valid $kind command", (command) => {
    expect(adminMutationCommandSchema.parse(command)).toEqual(command);
  });

  test.each(commands)("rejects a spoofed actorId on $kind", (command) => {
    expect(() => adminMutationCommandSchema.parse({ ...command, actorId: "attacker" })).toThrow();
  });

  test.each([
    { kind: "complete-priority", priorityId: "" },
    { kind: "update-lead-action", leadId: "alex-chen", action: "delete" },
    { kind: "complete-lead-action", leadId: "", action: "message" },
    { kind: "update-member", memberId: "alex-chen", patch: { unknown: true } },
    { kind: "verify-member", memberId: "" },
    { kind: "record-member-action", memberId: "alex-chen", action: "ban" },
    {
      kind: "create-tracked-link",
      input: {
        campaign: "campaign",
        content: "content",
        destination: "https://example.com",
        medium: "community",
        source: "discord",
      },
    },
    {
      kind: "create-campaign-with-tracked-link",
      input: {
        audience: "Builders",
        channel: "discord",
        destination: "https://www.rayname.com/domain/search",
        endDate: "2026-08-22",
        name: "Backwards",
        objective: "Invalid dates",
        startDate: "2026-08-23",
        status: "scheduled",
      },
      tracking: {
        campaign: "backwards",
        content: "campaign-form",
        destination: "https://www.rayname.com/domain/search",
        medium: "community",
        source: "discord",
      },
    },
    { kind: "update-offer", offerId: "offer", patch: { status: "deleted" } },
    {
      kind: "update-content-entry",
      entryId: "content",
      patch: { format: "unknown" },
    },
    { kind: "approve-verification", requestId: "" },
    {
      kind: "reject-verification",
      requestId: "72345678-1234-4234-8234-123456789012",
      reason: "   ",
    },
    { kind: "retry-verification-role", requestId: "" },
  ])("rejects the invalid $kind command", (command) => {
    expect(() => adminMutationCommandSchema.parse(command)).toThrow();
  });

  test.each([
    { label: "verified flag", patch: { verified: true } },
    { label: "Verified role", patch: { roles: ["Verified"] } },
    { label: "verified customer status", patch: { customerStatus: "Verified customer" } },
  ])("rejects a generic member patch that manufactures verification via $label", ({ patch }) => {
    expect(() => adminMutationCommandSchema.parse({
      kind: "update-member",
      memberId: "domainnomad",
      patch,
    })).toThrow();
  });

  test("accepts a normal member patch without a verification transition", () => {
    const command = {
      kind: "update-member",
      memberId: "alex-chen",
      patch: { notes: ["Follow up next week"], roles: ["VIP"] },
    };

    expect(adminMutationCommandSchema.parse(command)).toEqual(command);
  });

  test.each([
    { ctas: [] },
    { ctas: ["Read", "Transfer"] },
    { ctas: ["   "] },
  ])("rejects a content CTA patch that is not exactly one nonblank CTA: $ctas", ({ ctas }) => {
    expect(() => adminMutationCommandSchema.parse({
      kind: "update-content-entry",
      entryId: "market-pulse-aug-22",
      patch: { ctas },
    })).toThrow();
  });

  test("accepts a content patch with exactly one nonblank CTA", () => {
    const command = {
      kind: "update-content-entry",
      entryId: "market-pulse-aug-22",
      patch: { ctas: ["Open the transfer guide"] },
    };

    expect(adminMutationCommandSchema.parse(command)).toEqual(command);
  });
});
