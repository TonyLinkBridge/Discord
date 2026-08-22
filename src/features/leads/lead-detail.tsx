"use client";

import { CheckCircle, Copy, LinkSimple, Moon, Sun, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useTheme } from "next-themes";
import { useAdminData } from "@/lib/admin-data/context";
import type { Lead, LeadAction } from "@/lib/admin-data/types";
import styles from "./leads-screen.module.css";

const actionLabels: Record<LeadAction, string> = {
  "follow-up": "follow-up",
  "mark-converted": "conversion",
  message: "message",
  "review-vip": "VIP review",
  "send-offer": "offer",
};

const actionOptions: readonly { value: LeadAction; label: string }[] = [
  { value: "message", label: "Message" },
  { value: "follow-up", label: "Follow up" },
  { value: "send-offer", label: "Send offer" },
  { value: "review-vip", label: "Review VIP" },
  { value: "mark-converted", label: "Mark converted" },
];

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function LeadDetail({
  focusFallbackRef,
  lead,
  onChange,
  onClose,
}: Readonly<{
  focusFallbackRef: RefObject<HTMLElement | null>;
  lead: Lead;
  onChange: (lead: Lead) => void;
  onClose: () => void;
}>) {
  const provider = useAdminData();
  const { resolvedTheme, setTheme } = useTheme();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [action, setAction] = useState<LeadAction | "">(lead.nextAction ?? "");
  const [pending, setPending] = useState<"completion" | "tracking" | "copy" | null>(null);
  const [status, setStatus] = useState("");
  const [trackedUrl, setTrackedUrl] = useState("");

  useEffect(() => {
    const focusFallback = focusFallbackRef.current;
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog?.setAttribute("open", "");
    }
    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();

    return () => {
      if (dialog?.open && typeof dialog.close === "function") {
        dialog.close();
      }
      if (openerRef.current?.isConnected) {
        openerRef.current.focus();
      } else {
        focusFallback?.focus();
      }
    };
  }, [focusFallbackRef]);

  useEffect(() => {
    if (pending) closeButtonRef.current?.focus();
  }, [pending]);

  function requestClose() {
    if (pending) {
      setStatus("Wait for the current operation to finish before closing");
      closeButtonRef.current?.focus();
      return;
    }

    onClose();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
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

  async function completeAction() {
    if (!action || pending) return;

    const completedAction = action;
    setPending("completion");
    setStatus(`Completing ${actionLabels[completedAction]} for ${lead.name}`);

    try {
      const updated = await provider.completeLeadAction(lead.id, completedAction, "local-ray");
      onChange(updated);
      setStatus(`${actionLabels[completedAction]} completed for ${lead.name}`);
      setAction("");
    } catch {
      setStatus(`Unable to complete ${actionLabels[completedAction]}`);
    } finally {
      setPending(null);
    }
  }

  async function createTrackedLink() {
    if (pending) return;

    setPending("tracking");
    setStatus(`Creating tracked registration link for ${lead.name}`);
    try {
      const campaign = await provider.getCampaign(lead.campaignId);
      const link = await provider.createTrackedLink({
        campaign: lead.campaignId,
        content: `lead-${lead.id}`,
        destination: campaign.destination,
        medium: "community",
        source: lead.source.toLocaleLowerCase().replaceAll(" ", "-"),
      }, "local-ray");
      setTrackedUrl(link.url);
      setStatus("Tracked registration link created");
    } catch {
      setStatus("Unable to create tracked link");
    } finally {
      setPending(null);
    }
  }

  async function copyTrackedLink() {
    if (pending) return;

    setPending("copy");
    try {
      await navigator.clipboard.writeText(trackedUrl);
      setStatus("Tracked registration link copied");
    } catch {
      setStatus("Unable to copy tracked link");
    } finally {
      setPending(null);
    }
  }

  const completedActionLabel = lead.completedAction
    ? actionOptions.find((item) => item.value === lead.completedAction)?.label
    : null;

  return (
    <dialog
      aria-labelledby="lead-detail-title"
      className={styles.drawer}
      onKeyDown={handleDialogKeyDown}
      ref={dialogRef}
    >
        <div aria-busy={pending !== null}>
          <header className={styles.drawerHeader}>
            <div>
              <p>{lead.segment} · {lead.intent} intent</p>
              <h2 id="lead-detail-title">{lead.name}</h2>
            </div>
            <div className={styles.drawerHeaderActions}>
              <button
                aria-disabled={pending !== null}
                aria-label="Close lead details"
                className={styles.iconButton}
                onClick={requestClose}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden size={18} weight="bold" />
              </button>
              <div aria-label="Lead detail theme" className={styles.drawerTheme} role="group">
                <button
                  aria-label="Use light theme"
                  aria-pressed={resolvedTheme === "light"}
                  disabled={pending !== null}
                  onClick={() => setTheme("light")}
                  type="button"
                >
                  <Sun aria-hidden size={16} />
                </button>
                <button
                  aria-label="Use dark theme"
                  aria-pressed={resolvedTheme === "dark"}
                  disabled={pending !== null}
                  onClick={() => setTheme("dark")}
                  type="button"
                >
                  <Moon aria-hidden size={16} />
                </button>
              </div>
            </div>
          </header>

          <dl className={styles.leadFacts}>
            <div><dt>Stage</dt><dd>{lead.stage.replaceAll("-", " ")}</dd></div>
            <div><dt>Source</dt><dd>{lead.source}</dd></div>
            <div><dt>Campaign</dt><dd>{lead.campaignId.replaceAll("-", " ")}</dd></div>
            <div><dt>Portfolio size</dt><dd>{lead.portfolioSizeBand}</dd></div>
            <div><dt>Last activity</dt><dd>{lead.lastActivity}</dd></div>
            <div><dt>Follow-up</dt><dd>{new Date(lead.followUpAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</dd></div>
            <div><dt>Attributed value</dt><dd>${lead.attributedValue.toLocaleString()}</dd></div>
            <div><dt>Last completed action</dt><dd>{completedActionLabel ? `${completedActionLabel} complete` : "None"}</dd></div>
          </dl>

          <section className={styles.detailSection}>
            <h3><CheckCircle aria-hidden size={17} /> Next action</h3>
            <label htmlFor="lead-next-action">Next action</label>
            <select
              disabled={pending !== null}
              id="lead-next-action"
              onChange={(event) => setAction(event.target.value as LeadAction | "")}
              value={action}
            >
              <option disabled value="">Select an action</option>
              {actionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button disabled={!action || pending !== null} onClick={completeAction} type="button">
              {action ? `Mark ${actionLabels[action]} complete` : "Select an action to complete"}
            </button>
          </section>

          <section className={styles.detailSection}>
            <h3><LinkSimple aria-hidden size={17} /> RayName registration</h3>
            <p className={styles.detailCopy}>Generate a campaign-attributed registration link for this lead.</p>
            <button disabled={pending !== null} onClick={createTrackedLink} type="button">Create tracked link</button>
            {trackedUrl ? (
              <div className={styles.trackedLink}>
                <label htmlFor="tracked-lead-url">Tracked URL</label>
                <input id="tracked-lead-url" readOnly type="text" value={trackedUrl} />
                <button disabled={pending !== null} onClick={copyTrackedLink} type="button">
                  <Copy aria-hidden size={15} /> Copy tracked link
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <p aria-live="polite" className={styles.status} role="status">{status}</p>
    </dialog>
  );
}
