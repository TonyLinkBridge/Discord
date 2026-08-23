import { expectTypeOf, test } from "vitest";

import type { AdminAvailability } from "./availability";
import type {
  ActorAwareAdminDataStore,
  AdminDataProvider,
  ContentUpdatePrecondition,
} from "./provider";
import type { CampaignInput, ContentPatch, Member, MemberPatch, TrackingInput } from "./types";

test("keeps caller-controlled actor IDs out of the browser provider contract", () => {
  expectTypeOf<AdminDataProvider["availability"]>().toMatchTypeOf<AdminAvailability>();
  expectTypeOf<ActorAwareAdminDataStore["availability"]>()
    .toMatchTypeOf<AdminAvailability>();
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

test("keeps verification out of the generic member patch contract", () => {
  expectTypeOf<MemberPatch>().toEqualTypeOf<Partial<Pick<
    Member,
    "segment" | "roles" | "customerStatus" | "vipSignal" | "notes"
  >>>();
});
