"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { VerificationReviewRow } from "@/lib/verification/types";

import styles from "./members-screen.module.css";

export type VerificationActionResult = {
  ok: boolean;
  status: string;
  message: string;
};

export type VerificationQueueActions = {
  approve(requestId: string): Promise<VerificationActionResult>;
  reject(requestId: string, reason: string): Promise<VerificationActionResult>;
  retry(requestId: string): Promise<VerificationActionResult>;
};

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function VerificationDetail({
  actions,
  onClose,
  row,
}: Readonly<{
  actions: VerificationQueueActions;
  onClose(): void;
  row: VerificationReviewRow;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    closeRef.current?.focus();

    return () => {
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
      openerRef.current?.focus();
    };
  }, []);

  function requestClose() {
    if (pending) {
      setStatus("Wait for the current operation to finish");
      closeRef.current?.focus();
      return;
    }
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
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

  async function run(
    message: string,
    operation: () => Promise<VerificationActionResult>,
  ) {
    if (pending) return;
    setPending(true);
    setStatus(message);
    try {
      const result = await operation();
      setStatus(result.message);
      if (result.ok) setCompleted(true);
    } catch {
      setStatus("Unable to update this verification request");
    } finally {
      setPending(false);
    }
  }

  const resolved = row.status === "approved" || row.status === "rejected";

  return (
    <dialog
      aria-labelledby="verification-review-title"
      className={styles.verificationDialogBackdrop}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      <section className={styles.verificationDialog}>
        <header className={styles.drawerHeader}>
          <div>
            <p>@{row.discordHandle}</p>
            <h2 id="verification-review-title">Review {row.displayName}</h2>
          </div>
          <button
            aria-label="Close review"
            className={styles.iconButton}
            onClick={requestClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden size={18} weight="bold" />
          </button>
        </header>

        <dl className={styles.memberFacts}>
          <div><dt>Status</dt><dd>{row.status.replace("_", " ")}</dd></div>
          <div><dt>Discord user ID</dt><dd>{row.discordUserId}</dd></div>
          <div><dt>Registered email</dt><dd>{row.email ?? "Removed after retention period"}</dd></div>
          <div><dt>Submitted domain</dt><dd>{row.domain ?? "Not provided"}</dd></div>
        </dl>

        {row.safeFailure ? (
          <p className={styles.verificationFailure}>{row.safeFailure}</p>
        ) : null}

        {!resolved && !completed && row.status === "pending" ? (
          <section className={styles.verificationActions}>
            <button
              disabled={pending}
              onClick={() =>
                void run(`Approving ${row.displayName}`, () => actions.approve(row.id))
              }
              type="button"
            >
              Approve and assign Verified Customer
            </button>
            <label htmlFor="verification-rejection-reason">Rejection reason</label>
            <textarea
              disabled={pending}
              id="verification-rejection-reason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              value={reason}
            />
            <button
              disabled={pending}
              onClick={() => {
                const normalized = reason.trim();
                if (!normalized) {
                  setStatus("Enter a rejection reason");
                  return;
                }
                void run(`Rejecting ${row.displayName}`, () =>
                  actions.reject(row.id, normalized),
                );
              }}
              type="button"
            >
              Reject request
            </button>
          </section>
        ) : null}

        {!completed && row.status === "role_failed" ? (
          <button
            disabled={pending}
            onClick={() =>
              void run(`Retrying role assignment for ${row.displayName}`, () =>
                actions.retry(row.id),
              )
            }
            type="button"
          >
            Retry role assignment
          </button>
        ) : null}

        <p aria-live="polite" className={styles.status} role="status">{status}</p>
      </section>
    </dialog>
  );
}
