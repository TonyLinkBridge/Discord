"use client";

import { MagnifyingGlass, User } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { MemberDirectoryRow } from "@/lib/member-sync/read-model";

import { MemberDetail } from "./member-detail";
import styles from "./members-screen.module.css";

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function MembersScreen({
  initialSelectedMemberId = null,
  members,
}: Readonly<{
  initialSelectedMemberId?: string | null;
  members: MemberDirectoryRow[];
}>) {
  const router = useRouter();
  const membershipFilterRef = useRef<HTMLSelectElement>(null);
  const [previousInitialSelectedId, setPreviousInitialSelectedId] = useState(
    initialSelectedMemberId,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedMemberId,
  );
  const [search, setSearch] = useState("");
  const [membership, setMembership] = useState("all");
  const [verification, setVerification] = useState("all");
  const [role, setRole] = useState("all");
  const [accountType, setAccountType] = useState("all");

  if (previousInitialSelectedId !== initialSelectedMemberId) {
    setPreviousInitialSelectedId(initialSelectedMemberId);
    setSelectedId(initialSelectedMemberId);
  }

  const roles = useMemo(
    () => [...new Set(members.flatMap((member) => member.roles))].sort(),
    [members],
  );
  const filteredMembers = useMemo(
    () =>
      members.filter((member) => {
        const query = search.trim().toLocaleLowerCase();
        const matchesSearch =
          !query ||
          [member.displayName, member.discordHandle].some((value) =>
            value.toLocaleLowerCase().includes(query),
          );
        const matchesVerification =
          verification === "all" ||
          (verification === "verified" ? member.verified : !member.verified);
        const matchesAccountType =
          accountType === "all" ||
          (accountType === "bot" ? member.isBot : !member.isBot);
        return (
          matchesSearch &&
          matchesVerification &&
          matchesAccountType &&
          (membership === "all" || member.membershipStatus === membership) &&
          (role === "all" || member.roles.includes(role))
        );
      }),
    [accountType, membership, members, role, search, verification],
  );
  const selectedMember =
    members.find((member) => member.id === selectedId) ?? null;

  function closeMemberDetail() {
    setSelectedId(null);
    if (initialSelectedMemberId) {
      router.replace("/members", { scroll: false });
    }
  }

  const columns: DataTableColumn<MemberDirectoryRow>[] = [
    {
      id: "identity",
      header: "Discord identity",
      render: (member) => (
        <span className={styles.identity}>
          {member.avatarUrl ? (
            <span
              aria-hidden
              className={`${styles.avatar} ${styles.avatarImage}`}
              style={{ backgroundImage: `url("${member.avatarUrl}")` }}
            />
          ) : (
            <span className={styles.avatar}>
              <User aria-hidden size={15} weight="duotone" />
            </span>
          )}
          <span>
            <strong>{member.displayName}</strong>
            <small>{member.discordHandle}</small>
          </span>
        </span>
      ),
    },
    {
      id: "membership",
      header: "Membership",
      render: (member) => (
        <span
          className={
            member.membershipStatus === "active"
              ? styles.activeMember
              : styles.leftMember
          }
        >
          {member.membershipStatus}
        </span>
      ),
    },
    {
      id: "verification",
      header: "Verification",
      render: (member) => (
        <span className={member.verified ? styles.verified : styles.unverified}>
          {member.verified ? "Verified" : "Unverified"}
        </span>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      render: (member) => member.roles.join(", ") || "No roles",
    },
    {
      id: "joined",
      header: "Joined",
      render: (member) => formatDate(member.joinedAt),
    },
    {
      id: "snapshot",
      header: "Last snapshot",
      render: (member) => formatDate(member.lastSeenAt),
    },
    {
      id: "actions",
      header: "Open",
      render: (member) => (
        <button
          aria-label={`Open ${member.displayName}`}
          className={styles.openButton}
          onClick={() => setSelectedId(member.id)}
          type="button"
        >
          Open
        </button>
      ),
    },
  ];

  return (
    <main className={styles.screen}>
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2>Member directory</h2>
            <p>{filteredMembers.length} of {members.length} synchronized members</p>
          </div>
          <label className={styles.searchField}>
            <span>Search members</span>
            <MagnifyingGlass aria-hidden size={15} />
            <input
              aria-label="Search members"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or Discord handle"
              type="search"
              value={search}
            />
          </label>
        </header>

        <div aria-label="Member filters" className={styles.filters} role="group">
          <label>
            Membership
            <select
              onChange={(event) => setMembership(event.target.value)}
              ref={membershipFilterRef}
              value={membership}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label>
            Verification
            <select
              onChange={(event) => setVerification(event.target.value)}
              value={verification}
            >
              <option value="all">All</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </label>
          <label>
            Role
            <select onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="all">All</option>
              {roles.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Account type
            <select
              onChange={(event) => setAccountType(event.target.value)}
              value={accountType}
            >
              <option value="all">All</option>
              <option value="member">Members</option>
              <option value="bot">Bots</option>
            </select>
          </label>
        </div>

        <DataTable
          caption="Synchronized Discord members"
          columns={columns}
          emptyMessage={
            members.length === 0
              ? "No members yet"
              : "No members match these filters."
          }
          rows={filteredMembers}
        />
      </section>

      {selectedMember ? (
        <MemberDetail
          focusFallbackRef={membershipFilterRef}
          key={selectedMember.id}
          member={selectedMember}
          onClose={closeMemberDetail}
        />
      ) : null}
    </main>
  );
}
