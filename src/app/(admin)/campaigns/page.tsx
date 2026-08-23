import { CampaignsScreen } from "@/features/campaigns/campaigns-screen";
import { CapabilityBoundary } from "@/components/data-state/data-unavailable";

export default async function CampaignsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ campaign?: string | string[] }>;
}>) {
  const requestedCampaign = (await searchParams).campaign;

  return (
    <CapabilityBoundary
      capability="read-campaigns"
      description="Connect the campaign database and tracked-link provider to show real attribution campaigns."
      title="Campaign data is not connected"
    >
      <CampaignsScreen initialSelectedCampaignId={typeof requestedCampaign === "string" ? requestedCampaign : null} />
    </CapabilityBoundary>
  );
}
