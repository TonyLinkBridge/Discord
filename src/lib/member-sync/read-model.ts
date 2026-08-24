import type { SyncedDiscordMember } from "./types";

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
