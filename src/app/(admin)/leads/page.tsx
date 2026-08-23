import { LeadsScreen } from "@/features/leads/leads-screen";
import { CapabilityBoundary } from "@/components/data-state/data-unavailable";

export default async function LeadsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lead?: string | string[] }>;
}>) {
  const requestedLead = (await searchParams).lead;

  return (
    <CapabilityBoundary
      capability="read-leads"
      description="Connect RayName attribution and Discord activity data to show real conversion leads."
      title="Lead data is not connected"
    >
      <LeadsScreen initialSelectedLeadId={typeof requestedLead === "string" ? requestedLead : null} />
    </CapabilityBoundary>
  );
}
