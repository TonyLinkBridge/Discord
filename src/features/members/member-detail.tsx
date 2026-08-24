"use client";

import { X } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { MemberDirectoryRow } from "@/lib/member-sync/read-model";

import styles from "./members-screen.module.css";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function MemberDetail({
  focusFallbackRef,
  member,
  onClose,
}: Readonly<{
  focusFallbackRef: RefObject<HTMLElement | null>;
  member: MemberDirectoryRow;
  onClose: () => void;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const focusFallback = focusFallbackRef.current;
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []),
    ];
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
          <button
            aria-label="Close member details"
            className={styles.iconButton}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} weight="bold" />
          </button>
        </header>

        <dl className={styles.memberFacts}>
          <div><dt>Membership</dt><dd>{member.membershipStatus}</dd></div>
          <div><dt>Verification</dt><dd>{member.verified ? "Verified" : "Unverified"}</dd></div>
          <div><dt>Account type</dt><dd>{member.isBot ? "Bot" : "Member"}</dd></div>
          <div><dt>Joined server</dt><dd>{formatDate(member.joinedAt)}</dd></div>
          <div><dt>Last snapshot</dt><dd>{formatDate(member.lastSeenAt)}</dd></div>
          <div><dt>Discord ID</dt><dd>{member.id}</dd></div>
        </dl>

        <section className={styles.detailSection}>
          <h3>Discord roles</h3>
          {member.roles.length ? (
            <div aria-label="Assigned Discord roles" className={styles.roleChips}>
              {member.roles.map((role) => <span key={role}>{role}</span>)}
            </div>
          ) : (
            <p className={styles.emptyCopy}>No synchronized roles.</p>
          )}
        </section>

        <p className={styles.emptyCopy}>
          This panel is read-only. Verification reviews remain in the separate customer verification queue.
        </p>
      </aside>
    </div>
  );
}
