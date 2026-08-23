import { MembersScreen } from "@/features/members/members-screen";
import { CapabilityBoundary } from "@/components/data-state/data-unavailable";

export default async function MembersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ member?: string | string[] }>;
}>) {
  const requestedMember = (await searchParams).member;

  return (
    <CapabilityBoundary
      capability="read-members"
      description="Connect Discord member sync to use the member directory and verification tools."
      title="Member data is not connected"
    >
      <MembersScreen initialSelectedMemberId={typeof requestedMember === "string" ? requestedMember : null} />
    </CapabilityBoundary>
  );
}
