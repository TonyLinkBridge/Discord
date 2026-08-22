"use client";

import {
  CheckCircle,
  Copy,
  LinkSimple,
  NotePencil,
  Ticket,
  UserCircleCheck,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { Member } from "@/lib/admin-data/types";
import styles from "./members-screen.module.css";

const assignableRoles = ["Investor", "Flipper", "Startup", "Builder", "Beginner", "VIP"];
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function MemberDetail({
  focusFallbackRef,
  member,
  onChange,
  onClose,
}: Readonly<{
  focusFallbackRef: RefObject<HTMLElement | null>;
  member: Member;
  onChange: (member: Member) => void;
  onClose: () => void;
}>) {
  const provider = useAdminData();
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [role, setRole] = useState("VIP");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [trackedUrl, setTrackedUrl] = useState("");

  useEffect(() => {
    const focusFallback = focusFallbackRef.current;
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();

    return () => {
      if (openerRef.current?.isConnected) {
        openerRef.current.focus();
      } else {
        focusFallback?.focus();
      }
    };
  }, [focusFallbackRef]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function verifyCustomer() {
    try {
      const result = await provider.verifyMember(member.id, "local-ray");
      onChange(result.member);
      setStatus(result.status === "already-verified"
        ? "Customer was already verified"
        : "Customer verified manually");
    } catch {
      setStatus("Unable to verify customer");
    }
  }

  async function assignRole() {
    if (member.roles.includes(role)) {
      setStatus(`${role} role already assigned`);
      return;
    }

    try {
      const updated = await provider.updateMember(
        member.id,
        { roles: [...member.roles, role] },
        "local-ray",
      );
      onChange(updated);
      setStatus(`${role} role assigned`);
    } catch {
      setStatus("Unable to assign role");
    }
  }

  async function reviewVip() {
    try {
      await provider.recordMemberAction(member.id, "review-vip", "local-ray");
      setStatus("VIP review queued");
    } catch {
      setStatus("Unable to queue VIP review");
    }
  }

  async function openTicket() {
    try {
      await provider.recordMemberAction(member.id, "open-ticket", "local-ray");
      setStatus("Private support ticket opened");
    } catch {
      setStatus("Unable to open support ticket");
    }
  }

  async function addNote() {
    const nextNote = note.trim();
    if (!nextNote) {
      setStatus("Enter an internal note first");
      return;
    }

    try {
      const updated = await provider.updateMember(
        member.id,
        { notes: [...member.notes, nextNote] },
        "local-ray",
      );
      onChange(updated);
      setNote("");
      setStatus("Internal note added");
    } catch {
      setStatus("Unable to add internal note");
    }
  }

  async function createTrackedLink() {
    try {
      const link = await provider.createTrackedLink({
        campaign: "member-outreach",
        content: `member-${member.id}`,
        destination: "https://www.rayname.com/domain/search",
        medium: "community",
        source: "discord",
      }, "local-ray");
      setTrackedUrl(link.url);
      setStatus("Tracked RayName link created");
    } catch {
      setStatus("Unable to create tracked link");
    }
  }

  async function copyTrackedLink() {
    try {
      await navigator.clipboard.writeText(trackedUrl);
      setStatus("Tracked RayName link copied");
    } catch {
      setStatus("Unable to copy tracked link");
    }
  }

  return (
    <div className={styles.drawerBackdrop}>
      <aside
        aria-labelledby="member-detail-title"
        aria-modal="true"
        className={styles.drawer}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.drawerHeader}>
          <div>
            <p>{member.discordHandle}</p>
            <h2 id="member-detail-title">{member.displayName}</h2>
          </div>
          <button aria-label="Close member details" className={styles.iconButton} onClick={onClose} type="button">
            <X aria-hidden size={18} weight="bold" />
          </button>
        </header>

        <dl className={styles.memberFacts}>
          <div><dt>Verification</dt><dd>{member.verified ? "Verified" : "Unverified"}</dd></div>
          <div><dt>Segment</dt><dd>{member.segment}</dd></div>
          <div><dt>Customer status</dt><dd>{member.customerStatus}</dd></div>
          <div><dt>VIP signal</dt><dd>{member.vipSignal === "none" ? "None" : member.vipSignal}</dd></div>
          <div><dt>Registration source</dt><dd>{member.registrationSource}</dd></div>
          <div><dt>Last activity</dt><dd>{member.lastActivity}</dd></div>
        </dl>

        <section className={styles.detailSection}>
          <h3>Customer operations</h3>
          <div className={styles.buttonGrid}>
            <button disabled={member.verified} onClick={() => void verifyCustomer()} type="button">
              <CheckCircle aria-hidden size={16} /> Verify customer
            </button>
            <button onClick={() => void reviewVip()} type="button">
              <UserCircleCheck aria-hidden size={16} /> Review VIP
            </button>
            <button onClick={() => void openTicket()} type="button">
              <Ticket aria-hidden size={16} /> Open private support ticket
            </button>
          </div>
          <div className={styles.inlineForm}>
            <label htmlFor="member-role">Role to assign</label>
            <select id="member-role" onChange={(event) => setRole(event.target.value)} value={role}>
              {assignableRoles.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button onClick={() => void assignRole()} type="button">Assign role</button>
          </div>
          <div aria-label="Assigned roles" className={styles.roleChips}>
            {member.roles.map((item) => <span key={item}>{item}</span>)}
          </div>
        </section>

        <section className={styles.detailSection}>
          <h3><NotePencil aria-hidden size={17} /> Internal notes</h3>
          {member.notes.length ? (
            <ul className={styles.notes}>{member.notes.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
          ) : <p className={styles.emptyCopy}>No internal notes yet.</p>}
          <label htmlFor="internal-note">Internal note</label>
          <textarea id="internal-note" onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
          <button onClick={() => void addNote()} type="button">Add internal note</button>
        </section>

        <section className={styles.detailSection}>
          <h3><LinkSimple aria-hidden size={17} /> RayName tracking</h3>
          <p className={styles.emptyCopy}>Create an attributed RayName search link for this member.</p>
          <button onClick={() => void createTrackedLink()} type="button">Create tracked link</button>
          {trackedUrl ? (
            <div className={styles.trackedLink}>
              <label htmlFor="tracked-member-url">Tracked RayName URL</label>
              <input id="tracked-member-url" readOnly type="text" value={trackedUrl} />
              <button onClick={() => void copyTrackedLink()} type="button">
                <Copy aria-hidden size={15} /> Copy tracked link
              </button>
            </div>
          ) : null}
        </section>

        <p aria-live="polite" className={styles.status} role="status">{status}</p>
      </aside>
    </div>
  );
}
