import { OffersScreen } from "@/features/offers/offers-screen";
import { CapabilityBoundary } from "@/components/data-state/data-unavailable";

export default function OffersPage() {
  return (
    <CapabilityBoundary
      capability="read-offers"
      description="Connect the offer database and publishing provider to show real RayName offers."
      title="Offer data is not connected"
    >
      <OffersScreen />
    </CapabilityBoundary>
  );
}
