import { describe, expect, test } from "vitest";

import { toMemberDirectoryRows } from "./read-model";
import type { SyncedDiscordMember } from "./types";

const guildId = "1540610722281824336";
const userId = "223456789012345678";
const verifiedRoleId = "1540611679023276114";

function member(input: Partial<SyncedDiscordMember> = {}): SyncedDiscordMember {
  return {
    discordUserId: userId,
    username: "domain.nomad",
    globalName: "Domain Nomad",
    guildDisplayName: "DomainNomad",
    avatarHash: "user:a_abc123",
    joinedAt: "2026-08-20T00:00:00.000Z",
    roleIds: [verifiedRoleId, "1540611700000000000"],
    roleNames: ["Verified Customer", "Flipper"],
    isBot: false,
    membershipStatus: "active",
    verifiedAt: "2026-08-21T00:00:00.000Z",
    lastSeenAt: "2026-08-24T05:00:00.000Z",
    leftAt: null,
    ...input,
  };
}

describe("Discord member directory read model", () => {
  test("maps only provider-backed Discord member fields", () => {
    const rows = toMemberDirectoryRows([member()], guildId, verifiedRoleId);

    expect(rows).toEqual([
      {
        id: userId,
        displayName: "DomainNomad",
        discordHandle: "@domain.nomad",
        avatarUrl: `https://cdn.discordapp.com/avatars/${userId}/a_abc123.png?size=128`,
        membershipStatus: "active",
        verified: true,
        roles: ["Verified Customer", "Flipper"],
        joinedAt: "2026-08-20T00:00:00.000Z",
        lastSeenAt: "2026-08-24T05:00:00.000Z",
        isBot: false,
      },
    ]);
    const serialized = JSON.stringify(rows);
    for (const forbidden of [
      "segment",
      "registrationSource",
      "customerStatus",
      "vipSignal",
      "lastActivity",
      "notes",
      "email",
      "message",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("derives current verification from the configured role, not historical verifiedAt", () => {
    const [row] = toMemberDirectoryRows(
      [member({ roleIds: [], roleNames: [], verifiedAt: "2026-08-21T00:00:00.000Z" })],
      guildId,
      verifiedRoleId,
    );

    expect(row.verified).toBe(false);
  });

  test("derives a guild-avatar URL and rejects unsafe avatar references", () => {
    const [guildAvatar, unsafeAvatar] = toMemberDirectoryRows(
      [
        member({ avatarHash: "guild:guild_hash123" }),
        member({
          discordUserId: "223456789012345679",
          avatarHash: "user:../../secret",
        }),
      ],
      guildId,
      verifiedRoleId,
    );

    expect(guildAvatar.avatarUrl).toBe(
      `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/guild_hash123.png?size=128`,
    );
    expect(unsafeAvatar.avatarUrl).toBeNull();
  });

  test("excludes legacy verification rows that have never appeared in a complete snapshot", () => {
    expect(
      toMemberDirectoryRows([member({ lastSeenAt: null })], guildId, verifiedRoleId),
    ).toEqual([]);
  });
});
