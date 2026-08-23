import { ContentScreen } from "@/features/content/content-screen";
import { CapabilityBoundary } from "@/components/data-state/data-unavailable";

export default function ContentPage() {
  return (
    <CapabilityBoundary
      capability="read-content"
      description="Connect the content database and Discord publishing provider to show scheduled content."
      title="Content data is not connected"
    >
      <ContentScreen />
    </CapabilityBoundary>
  );
}
