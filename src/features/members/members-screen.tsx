"use client";

import { MagnifyingGlass, User } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAdminData } from "@/lib/admin-data/context";
import type { Member } from "@/lib/admin-data/types";
import { MemberDetail } from "./member-detail";
import styles from "./members-screen.module.css";

const normalize = (value: string) => value.toLocaleLowerCase().replaceAll(" ", "-");

export function MembersScreen({ initialSelectedMemberId = null }: Readonly<{
  initialSelectedMemberId?: string | null;
}>) {
  const provider = useAdminData();
  const router = useRouter();
  const verificationFilterRef = useRef<HTMLSelectElement>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [previousInitialSelectedId, setPreviousInitialSelectedId] = useState(initialSelectedMemberId);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedMemberId);
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState("all");
  const [segment, setSegment] = useState("all");
  const [customerStatus, setCustomerStatus] = useState("all");
  const [vipSignal, setVipSignal] = useState("all");

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (active) {
        setMembers(state.members);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [provider]);

  if (previousInitialSelectedId !== initialSelectedMemberId) {
    setPreviousInitialSelectedId(initialSelectedMemberId);
    setSelectedId(initialSelectedMemberId);
  }

  const segments = useMemo(() => [...new Set(members.map((member) => member.segment))], [members]);
  const customerStatuses = useMemo(
    () => [...new Set(members.map((member) => member.customerStatus))],
    [members],
  );
  const filteredMembers = useMemo(() => members.filter((member) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesQuery = !query || [member.displayName, member.discordHandle, member.segment]
      .some((value) => value.toLocaleLowerCase().includes(query));
    const matchesVerification = verification === "all"
      || (verification === "verified" ? member.verified : !member.verified);
    return matchesQuery
      && matchesVerification
      && (segment === "all" || normalize(member.segment) === segment)
      && (customerStatus === "all" || normalize(member.customerStatus) === customerStatus)
      && (vipSignal === "all" || member.vipSignal === vipSignal);
  }), [customerStatus, members, search, segment, verification, vipSignal]);
  const selectedMember = members.find((member) => member.id === selectedId) ?? null;

  function replaceMember(updated: Member) {
    setMembers((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  function closeMemberDetail() {
    setSelectedId(null);
    if (initialSelectedMemberId) router.replace("/members", { scroll: false });
  }

  const columns: DataTableColumn<Member>[] = [
    {
      id: "identity",
      header: "Discord identity",
      render: (member) => (
        <span className={styles.identity}>
          <span className={styles.avatar}><User aria-hidden size={15} weight="duotone" /></span>
          <span><strong>{member.displayName}</strong><small>{member.discordHandle}</small></span>
        </span>
      ),
    },
    { id: "verification", header: "Verification", render: (member) => <span className={member.verified ? styles.verified : styles.unverified}>{member.verified ? "Verified" : "Unverified"}</span> },
    { id: "segment", header: "Segment", render: (member) => member.segment },
    { id: "roles", header: "Roles", render: (member) => member.roles.join(", ") },
    { id: "source", header: "Registration source", render: (member) => member.registrationSource },
    { id: "status", header: "Customer status", render: (member) => member.customerStatus },
    { id: "vip", header: "VIP signal", render: (member) => <span className={styles.vip}>{member.vipSignal === "none" ? "None" : member.vipSignal}</span> },
    { id: "activity", header: "Last activity", render: (member) => member.lastActivity },
    { id: "actions", header: "", render: (member) => <button aria-label={`Open ${member.displayName}`} className={styles.openButton} onClick={() => setSelectedId(member.id)} type="button">Open</button> },
  ];

  if (!loaded) return <p className={styles.loading} role="status">Loading members…</p>;

  return (
    <main className={styles.screen}>
      <section className={styles.panel}>
        <header className={styles.header}>
          <div><h2>Member directory</h2><p>{filteredMembers.length} of {members.length} members</p></div>
          <label className={styles.searchField}>
            <span>Search members</span>
            <MagnifyingGlass aria-hidden size={15} />
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Name or Discord handle" type="search" value={search} />
          </label>
        </header>

        <div aria-label="Member filters" className={styles.filters} role="group">
          <label>Verification
            <select onChange={(event) => setVerification(event.target.value)} ref={verificationFilterRef} value={verification}>
              <option value="all">All</option><option value="verified">Verified</option><option value="unverified">Unverified</option>
            </select>
          </label>
          <label>Segment
            <select onChange={(event) => setSegment(event.target.value)} value={segment}>
              <option value="all">All</option>
              {segments.map((item) => <option key={item} value={normalize(item)}>{item}</option>)}
            </select>
          </label>
          <label>Customer status
            <select onChange={(event) => setCustomerStatus(event.target.value)} value={customerStatus}>
              <option value="all">All</option>
              {customerStatuses.map((item) => <option key={item} value={normalize(item)}>{item}</option>)}
            </select>
          </label>
          <label>VIP signal
            <select onChange={(event) => setVipSignal(event.target.value)} value={vipSignal}>
              <option value="all">All</option><option value="none">None</option><option value="candidate">Candidate</option><option value="vip">VIP</option>
            </select>
          </label>
        </div>

        <DataTable
          caption="RayName community members"
          columns={columns}
          emptyMessage="No members match these filters."
          rows={filteredMembers}
        />
      </section>

      {selectedMember ? (
        <MemberDetail
          focusFallbackRef={verificationFilterRef}
          member={selectedMember}
          onChange={replaceMember}
          onClose={closeMemberDetail}
        />
      ) : null}
    </main>
  );
}
