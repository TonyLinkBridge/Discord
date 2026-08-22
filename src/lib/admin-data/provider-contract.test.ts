import { expectTypeOf, test } from "vitest";

import type { AdminDataProvider, ContentUpdatePrecondition } from "./provider";
import type { CampaignInput, ContentPatch, TrackingInput } from "./types";

test("keeps caller-controlled actor IDs out of the browser provider contract", () => {
  expectTypeOf<Parameters<AdminDataProvider["completePriority"]>>()
    .toEqualTypeOf<[priorityId: string]>();
  expectTypeOf<Parameters<AdminDataProvider["updateLeadAction"]>>()
    .toEqualTypeOf<[leadId: string, action: "message" | "follow-up" | "send-offer" | "review-vip" | "mark-converted"]>();
  expectTypeOf<Parameters<AdminDataProvider["createCampaignWithTrackedLink"]>>()
    .toEqualTypeOf<[input: CampaignInput, tracking: TrackingInput]>();
  expectTypeOf<Parameters<AdminDataProvider["updateContentEntry"]>>()
    .toEqualTypeOf<[
      entryId: string,
      patch: ContentPatch,
      precondition?: ContentUpdatePrecondition,
    ]>();
});
