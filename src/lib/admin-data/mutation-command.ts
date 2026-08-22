import { z } from "zod";

import { rayNameDestinationError } from "@/lib/tracking";

const identifierSchema = z.string().trim().min(1).max(200);
const textSchema = z.string().trim().min(1).max(500);
const longTextSchema = z.string().trim().min(1).max(5_000);
const rayNameDestinationSchema = z.url().superRefine((value, context) => {
  const message = rayNameDestinationError(value);
  if (message) context.addIssue({ code: "custom", message });
});
const leadActionSchema = z.enum([
  "message",
  "follow-up",
  "send-offer",
  "review-vip",
  "mark-converted",
]);
const contentStatusSchema = z.enum(["draft", "scheduled", "published"]);

const trackingInputSchema = z.object({
  campaign: identifierSchema,
  content: identifierSchema,
  destination: rayNameDestinationSchema,
  medium: identifierSchema,
  source: identifierSchema,
}).strict();

const memberPatchSchema = z.object({
  customerStatus: textSchema.optional(),
  notes: z.array(longTextSchema).max(100).optional(),
  roles: z.array(textSchema).max(50).optional(),
  segment: textSchema.optional(),
  verified: z.boolean().optional(),
  vipSignal: z.enum(["none", "candidate", "vip"]).optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "Member patch cannot be empty.");

const campaignInputSchema = z.object({
  audience: textSchema,
  channel: z.enum(["discord", "email", "community", "partner"]),
  destination: rayNameDestinationSchema,
  endDate: z.iso.date(),
  name: textSchema,
  objective: textSchema,
  startDate: z.iso.date(),
  status: z.enum(["draft", "scheduled", "active", "expired"]),
}).strict();

const offerPatchSchema = z.object({
  audience: textSchema.optional(),
  campaignId: identifierSchema.optional(),
  cta: textSchema.optional(),
  description: longTextSchema.optional(),
  destination: rayNameDestinationSchema.optional(),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(["draft", "scheduled", "active", "expired"]).optional(),
  title: textSchema.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "Offer patch cannot be empty.");

const contentPatchSchema = z.object({
  conversionLevel: z.enum(["education", "soft", "direct"]).optional(),
  ctas: z.array(textSchema).max(20).optional(),
  format: z.enum([
    "market-pulse",
    "domain-101",
    "name-battle",
    "domain-breakdown",
    "risk-check",
    "brand-launch",
  ]).optional(),
  publishAt: z.iso.datetime({ offset: true }).optional(),
  status: contentStatusSchema.optional(),
  title: textSchema.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "Content patch cannot be empty.");

export const adminMutationCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("complete-priority"),
    priorityId: identifierSchema,
  }).strict(),
  z.object({
    action: leadActionSchema,
    kind: z.literal("update-lead-action"),
    leadId: identifierSchema,
  }).strict(),
  z.object({
    action: leadActionSchema,
    kind: z.literal("complete-lead-action"),
    leadId: identifierSchema,
  }).strict(),
  z.object({
    kind: z.literal("update-member"),
    memberId: identifierSchema,
    patch: memberPatchSchema,
  }).strict(),
  z.object({
    kind: z.literal("verify-member"),
    memberId: identifierSchema,
  }).strict(),
  z.object({
    action: z.enum(["open-ticket", "review-vip"]),
    kind: z.literal("record-member-action"),
    memberId: identifierSchema,
  }).strict(),
  z.object({
    input: trackingInputSchema,
    kind: z.literal("create-tracked-link"),
  }).strict(),
  z.object({
    input: campaignInputSchema,
    kind: z.literal("create-campaign-with-tracked-link"),
    tracking: trackingInputSchema,
  }).strict(),
  z.object({
    kind: z.literal("update-offer"),
    offerId: identifierSchema,
    patch: offerPatchSchema,
  }).strict(),
  z.object({
    entryId: identifierSchema,
    kind: z.literal("update-content-entry"),
    patch: contentPatchSchema,
    precondition: z.object({ expectedStatus: contentStatusSchema }).strict().optional(),
  }).strict(),
]).superRefine((command, context) => {
  if (
    command.kind === "create-campaign-with-tracked-link"
    && command.input.endDate < command.input.startDate
  ) {
    context.addIssue({
      code: "custom",
      message: "Campaign end date cannot be earlier than its start date.",
      path: ["input", "endDate"],
    });
  }
});

export type AdminMutationCommand = z.infer<typeof adminMutationCommandSchema>;

export interface AuthorizedAdminMutation {
  actorId: string;
  command: AdminMutationCommand;
}

export type AdminMutationGate = (
  command: AdminMutationCommand,
) => Promise<AuthorizedAdminMutation>;
