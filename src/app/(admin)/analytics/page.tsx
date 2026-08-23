import { AnalyticsScreen } from "@/features/analytics/analytics-screen";
import { CapabilityBoundary } from "@/components/data-state/data-unavailable";

export default function AnalyticsPage() {
  return (
    <CapabilityBoundary
      capability="read-analytics"
      description="Connect the attribution database and RayName reporting provider to show real conversion analytics."
      title="Analytics data is not connected"
    >
      <AnalyticsScreen />
    </CapabilityBoundary>
  );
}
