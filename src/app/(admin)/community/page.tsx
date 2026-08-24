import { CommunityScreen } from "@/features/community/community-screen";
import { getAdminAuthEnvironment, getAuthenticatedDiscordUserId } from "@/lib/auth";
import {
  toDiscordCommunityFacts,
  type DiscordCommunityFacts,
} from "@/lib/member-sync/read-model";
import { createMemberSyncRuntime } from "@/lib/member-sync/runtime";
import { requireAdminActor } from "@/lib/require-admin-actor";

export default async function CommunityPage() {
  const runtime = createMemberSyncRuntime();
  let facts: DiscordCommunityFacts | null = null;

  if (runtime.ready) {
    await requireAdminActor({
      getAuthenticatedUserId: getAuthenticatedDiscordUserId,
      getEnvironment: getAdminAuthEnvironment,
    });
    try {
      const [discordFacts, members] = await Promise.all([
        runtime.repository.getDiscordFacts(
          runtime.config.guildId,
          runtime.config.verifiedRoleId,
        ),
        runtime.repository.listMembers(runtime.config.guildId),
      ]);
      facts = toDiscordCommunityFacts(
        members,
        discordFacts,
        runtime.config.verifiedRoleId,
      );
    } catch {
      facts = null;
    }
  }

  return <CommunityScreen facts={facts} />;
}
