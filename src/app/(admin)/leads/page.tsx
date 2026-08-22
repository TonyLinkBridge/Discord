import { LeadsScreen } from "@/features/leads/leads-screen";

export default async function LeadsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lead?: string | string[] }>;
}>) {
  const requestedLead = (await searchParams).lead;

  return <LeadsScreen initialSelectedLeadId={typeof requestedLead === "string" ? requestedLead : null} />;
}
