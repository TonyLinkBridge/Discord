import type { AdminMutationCommand, AdminMutationGate } from "./mutation-command";
import type { ActorAwareAdminDataStore, AdminDataProvider } from "./provider";

type CommandOf<Kind extends AdminMutationCommand["kind"]> = Extract<
  AdminMutationCommand,
  { kind: Kind }
>;

export function createAuthorizedAdminDataProvider(
  store: ActorAwareAdminDataStore,
  gate: AdminMutationGate,
): AdminDataProvider {
  const authorize = async <Kind extends AdminMutationCommand["kind"]>(
    command: CommandOf<Kind>,
    expectedKind: Kind,
  ): Promise<{ actorId: string; command: CommandOf<Kind> }> => {
    const authorized = await gate(command);
    if (authorized.command.kind !== expectedKind) {
      throw new Error("Mutation authorization returned a mismatched command.");
    }

    return authorized as { actorId: string; command: CommandOf<Kind> };
  };

  return {
    ...store,

    async completePriority(priorityId) {
      const authorized = await authorize(
        { kind: "complete-priority", priorityId },
        "complete-priority",
      );
      return store.completePriority(authorized.command.priorityId, authorized.actorId);
    },

    async updateLeadAction(leadId, action) {
      const authorized = await authorize(
        { action, kind: "update-lead-action", leadId },
        "update-lead-action",
      );
      return store.updateLeadAction(
        authorized.command.leadId,
        authorized.command.action,
        authorized.actorId,
      );
    },

    async completeLeadAction(leadId, action) {
      const authorized = await authorize(
        { action, kind: "complete-lead-action", leadId },
        "complete-lead-action",
      );
      return store.completeLeadAction(
        authorized.command.leadId,
        authorized.command.action,
        authorized.actorId,
      );
    },

    async updateMember(memberId, patch) {
      const authorized = await authorize(
        { kind: "update-member", memberId, patch },
        "update-member",
      );
      return store.updateMember(
        authorized.command.memberId,
        authorized.command.patch,
        authorized.actorId,
      );
    },

    async verifyMember(memberId) {
      const authorized = await authorize(
        { kind: "verify-member", memberId },
        "verify-member",
      );
      return store.verifyMember(authorized.command.memberId, authorized.actorId);
    },

    async recordMemberAction(memberId, action) {
      const authorized = await authorize(
        { action, kind: "record-member-action", memberId },
        "record-member-action",
      );
      return store.recordMemberAction(
        authorized.command.memberId,
        authorized.command.action,
        authorized.actorId,
      );
    },

    async createTrackedLink(input) {
      const authorized = await authorize(
        { input, kind: "create-tracked-link" },
        "create-tracked-link",
      );
      return store.createTrackedLink(authorized.command.input, authorized.actorId);
    },

    async createCampaignWithTrackedLink(input, tracking) {
      const authorized = await authorize(
        { input, kind: "create-campaign-with-tracked-link", tracking } as CommandOf<
          "create-campaign-with-tracked-link"
        >,
        "create-campaign-with-tracked-link",
      );
      return store.createCampaignWithTrackedLink(
        authorized.command.input,
        authorized.command.tracking,
        authorized.actorId,
      );
    },

    async updateOffer(offerId, patch) {
      const authorized = await authorize(
        { kind: "update-offer", offerId, patch },
        "update-offer",
      );
      return store.updateOffer(
        authorized.command.offerId,
        authorized.command.patch,
        authorized.actorId,
      );
    },

    async updateContentEntry(entryId, patch, precondition) {
      const authorized = await authorize(
        { entryId, kind: "update-content-entry", patch, precondition },
        "update-content-entry",
      );
      return store.updateContentEntry(
        authorized.command.entryId,
        authorized.command.patch,
        authorized.actorId,
        authorized.command.precondition,
      );
    },
  };
}
