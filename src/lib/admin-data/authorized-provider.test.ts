import { describe, expect, test, vi } from "vitest";

import { createAuthorizedAdminDataProvider } from "./authorized-provider";
import { createTestAdminDataStore } from "@/test/admin-data";
import { adminMutationCommandSchema, type AdminMutationCommand } from "./mutation-command";
import type { AdminDataProvider } from "./provider";

const authorizeAs = (actorId: string) => vi.fn(async (input: AdminMutationCommand) => ({
  actorId,
  command: adminMutationCommandSchema.parse(input),
}));

const mutationCases: ReadonlyArray<{
  kind: AdminMutationCommand["kind"];
  mutate(provider: AdminDataProvider): Promise<unknown>;
}> = [
  {
    kind: "complete-priority",
    mutate: (provider) => provider.completePriority("verify-new-members"),
  },
  {
    kind: "update-lead-action",
    mutate: (provider) => provider.updateLeadAction("alex-chen", "send-offer"),
  },
  {
    kind: "complete-lead-action",
    mutate: (provider) => provider.completeLeadAction("alex-chen", "message"),
  },
  {
    kind: "update-member",
    mutate: (provider) => provider.updateMember("alex-chen", { roles: ["VIP"] }),
  },
  {
    kind: "verify-member",
    mutate: (provider) => provider.verifyMember("domainnomad"),
  },
  {
    kind: "record-member-action",
    mutate: (provider) => provider.recordMemberAction("alex-chen", "open-ticket"),
  },
  {
    kind: "create-tracked-link",
    mutate: (provider) => provider.createTrackedLink({
      campaign: "com-transfer-week",
      content: "lead-detail",
      destination: "https://www.rayname.com/domain/search",
      medium: "community",
      source: "discord",
    }),
  },
  {
    kind: "create-campaign-with-tracked-link",
    mutate: (provider) => provider.createCampaignWithTrackedLink(
      {
        audience: "Builders",
        channel: "discord",
        destination: "https://www.rayname.com/domain/search",
        endDate: "2026-08-30",
        name: "Builder referral push",
        objective: "Convert builder referrals",
        startDate: "2026-08-23",
        status: "scheduled",
      },
      {
        campaign: "builder-referral-push",
        content: "campaign-form",
        destination: "https://www.rayname.com/domain/search",
        medium: "community",
        source: "discord",
      },
    ),
  },
  {
    kind: "update-offer",
    mutate: (provider) => provider.updateOffer("com-transfer-offer", { status: "expired" }),
  },
  {
    kind: "update-content-entry",
    mutate: (provider) => provider.updateContentEntry(
      "market-pulse-aug-22",
      { title: "Updated title" },
      { expectedStatus: "scheduled" },
    ),
  },
];

describe("createAuthorizedAdminDataProvider", () => {
  test.each(mutationCases)("authorizes and binds actor 42 for $kind", async ({ kind, mutate }) => {
    const store = createTestAdminDataStore();
    const gate = authorizeAs("42");
    gate.mockImplementation(async (input) => {
      expect(await store.getActivity()).toEqual([]);
      return { actorId: "42", command: adminMutationCommandSchema.parse(input) };
    });
    const provider = createAuthorizedAdminDataProvider(store, gate);

    await mutate(provider);

    expect(gate).toHaveBeenCalledOnce();
    expect(gate.mock.calls[0][0].kind).toBe(kind);
    expect((await store.getActivity()).map((event) => event.actorId))
      .toEqual(expect.arrayContaining(["42"]));
    expect((await store.getActivity()).every((event) => event.actorId === "42")).toBe(true);
  });

  test("does not mutate local state when the current session is denied", async () => {
    const store = createTestAdminDataStore();
    const provider = createAuthorizedAdminDataProvider(
      store,
      vi.fn().mockRejectedValue(new Error("forbidden")),
    );

    await expect(provider.completePriority("verify-new-members")).rejects.toThrow("forbidden");

    expect((await store.getActivity())).toEqual([]);
    expect((await store.getOverview({ from: "2026-08-16", to: "2026-08-22" })).priorities)
      .toContainEqual(expect.objectContaining({ id: "verify-new-members" }));
  });
});
