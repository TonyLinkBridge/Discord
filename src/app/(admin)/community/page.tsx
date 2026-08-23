import { CommunityScreen } from "@/features/community/community-screen";
import { CapabilityBoundary } from "@/components/data-state/data-unavailable";

export default function CommunityPage() {
  return (
    <CapabilityBoundary
      capability="read-community"
      description="Connect Discord community sync to show real growth, roles, and channel activity."
      title="Community data is not connected"
    >
      <CommunityScreen />
    </CapabilityBoundary>
  );
}
