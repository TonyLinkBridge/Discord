import type { DiscordFacts, SyncedDiscordMember } from "./types";

export type DiscordOverviewFacts = {
  discordMembers: number;
  verifiedCustomers: number;
  asOf: string;
};

export type DiscordCommunityFacts = {
  activeMembers: number;
  leftMembers: number;
  botMembers: number;
  verifiedMembers: number;
  roleDistribution: Array<{ label: string; value: number }>;
  asOf: string;
};

export type MemberDirectoryRow = {
  id: string;
  displayName: string;
  discordHandle: string;
  avatarUrl: string | null;
  membershipStatus: "active" | "left";
  verified: boolean;
  roles: string[];
  joinedAt: string | null;
  lastSeenAt: string;
  isBot: boolean;
};

const discordIdPattern = /^\d{17,20}$/;
const avatarHashPattern = /^[A-Za-z0-9_]+$/;

function avatarUrl(
  reference: string | null,
  guildId: string,
  discordUserId: string,
): string | null {
  if (
    !reference ||
    !discordIdPattern.test(guildId) ||
    !discordIdPattern.test(discordUserId)
  ) {
    return null;
  }
  const [scope, hash, extra] = reference.split(":");
  if (extra !== undefined || !hash || !avatarHashPattern.test(hash)) return null;
  if (scope === "user") {
    return `https://cdn.discordapp.com/avatars/${discordUserId}/${hash}.png?size=128`;
  }
  if (scope === "guild") {
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${discordUserId}/avatars/${hash}.png?size=128`;
  }
  return null;
}

export function toMemberDirectoryRows(
  members: SyncedDiscordMember[],
  guildId: string,
  verifiedRoleId: string,
): MemberDirectoryRow[] {
  return members.flatMap((member) => {
    if (!member.lastSeenAt) return [];
    return [
      {
        id: member.discordUserId,
        displayName:
          member.guildDisplayName || member.globalName || member.username,
        discordHandle: `@${member.username}`,
        avatarUrl: avatarUrl(
          member.avatarHash,
          guildId,
          member.discordUserId,
        ),
        membershipStatus: member.membershipStatus,
        verified: member.roleIds.includes(verifiedRoleId),
        roles: [...new Set(member.roleNames)],
        joinedAt: member.joinedAt,
        lastSeenAt: member.lastSeenAt,
        isBot: member.isBot,
      },
    ];
  });
}

function currentSnapshotMembers(members: SyncedDiscordMember[]) {
  return members.filter((member) => member.lastSeenAt !== null);
}

export function toDiscordOverviewFacts(
  members: SyncedDiscordMember[],
  facts: DiscordFacts,
  verifiedRoleId: string,
): DiscordOverviewFacts | null {
  if (!facts.lastSuccessfulSyncAt) return null;
  const currentMembers = currentSnapshotMembers(members);

  return {
    discordMembers: currentMembers.filter(
      (member) => member.membershipStatus === "active" && !member.isBot,
    ).length,
    verifiedCustomers: currentMembers.filter(
      (member) =>
        member.membershipStatus === "active" &&
        !member.isBot &&
        member.roleIds.includes(verifiedRoleId),
    ).length,
    asOf: facts.lastSuccessfulSyncAt,
  };
}

export function toDiscordCommunityFacts(
  members: SyncedDiscordMember[],
  facts: DiscordFacts,
  verifiedRoleId: string,
): DiscordCommunityFacts | null {
  if (!facts.lastSuccessfulSyncAt) return null;
  const currentMembers = currentSnapshotMembers(members);

  return {
    activeMembers: currentMembers.filter(
      (member) => member.membershipStatus === "active" && !member.isBot,
    ).length,
    leftMembers: currentMembers.filter(
      (member) => member.membershipStatus === "left" && !member.isBot,
    ).length,
    botMembers: currentMembers.filter(
      (member) => member.membershipStatus === "active" && member.isBot,
    ).length,
    verifiedMembers: currentMembers.filter(
      (member) =>
        member.membershipStatus === "active" &&
        !member.isBot &&
        member.roleIds.includes(verifiedRoleId),
    ).length,
    roleDistribution: facts.roleDistribution
      .filter((role) => role.label !== "@everyone")
      .map(({ label, value }) => ({ label, value })),
    asOf: facts.lastSuccessfulSyncAt,
  };
}
