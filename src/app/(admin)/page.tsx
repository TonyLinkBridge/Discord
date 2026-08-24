import { OverviewScreen } from "@/features/overview/overview-screen";
import { getAdminAuthEnvironment, getAuthenticatedDiscordUserId } from "@/lib/auth";
import {
  toDiscordOverviewFacts,
  type DiscordOverviewFacts,
} from "@/lib/member-sync/read-model";
import { createMemberSyncRuntime } from "@/lib/member-sync/runtime";
import { requireAdminActor } from "@/lib/require-admin-actor";

export default async function OverviewPage() {
  const runtime = createMemberSyncRuntime();
  let facts: DiscordOverviewFacts | null = null;

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
      facts = toDiscordOverviewFacts(
        members,
        discordFacts,
        runtime.config.verifiedRoleId,
      );
    } catch {
      facts = null;
    }
  }

  return <OverviewScreen facts={facts} />;
}
