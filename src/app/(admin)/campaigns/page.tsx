import { CampaignsScreen } from "@/features/campaigns/campaigns-screen";

export default async function CampaignsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ campaign?: string | string[] }>;
}>) {
  const requestedCampaign = (await searchParams).campaign;

  return <CampaignsScreen initialSelectedCampaignId={typeof requestedCampaign === "string" ? requestedCampaign : null} />;
}
