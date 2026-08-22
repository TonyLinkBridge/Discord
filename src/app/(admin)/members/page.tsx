import { MembersScreen } from "@/features/members/members-screen";

export default async function MembersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ member?: string | string[] }>;
}>) {
  const requestedMember = (await searchParams).member;

  return <MembersScreen initialSelectedMemberId={typeof requestedMember === "string" ? requestedMember : null} />;
}
