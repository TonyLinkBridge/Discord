"use client";

import {
  ArrowsClockwise,
  ChatCircleDots,
  CheckCircle,
  Tag,
  UserCircleCheck,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { useAdminData } from "@/lib/admin-data/context";
import type { Priority } from "@/lib/admin-data/types";
import { useReportingRange } from "@/lib/reporting-range";
import styles from "./overview-screen.module.css";

function PriorityIcon({ kind }: Readonly<{ kind: string }>) {
  const props = { "aria-hidden": true, size: 23, weight: "duotone" as const };
  if (kind === "verification") return <UserCircleCheck {...props} />;
  if (kind === "lead-follow-up") return <ChatCircleDots {...props} />;
  if (kind === "offer") return <Tag {...props} />;
  if (kind === "renewal") return <ArrowsClockwise {...props} />;
  return <CheckCircle {...props} />;
}

export function TodaysPriorities({ priorities: initialPriorities }: Readonly<{ priorities?: Priority[] }>) {
  const provider = useAdminData();
  const { selectedRange } = useReportingRange();
  const [priorities, setPriorities] = useState<Priority[]>(initialPriorities ?? []);
  const [status, setStatus] = useState("");
  const prioritySectionRef = useRef<HTMLElement>(null);
  const priorityFocusIndex = useRef<number | null>(null);
  const restorePriorityFocus = useRef(false);

  useEffect(() => {
    if (initialPriorities) return;

    let active = true;
    provider.getOverview(selectedRange).then((overview) => {
      if (active) setPriorities(overview.priorities);
    });
    return () => { active = false; };
  }, [initialPriorities, provider, selectedRange]);

  useEffect(() => {
    if (!restorePriorityFocus.current) return;

    const nextActions = prioritySectionRef.current?.querySelectorAll<HTMLButtonElement>(
      '[data-action-menu-trigger="true"]',
    );
    const index = priorityFocusIndex.current ?? 0;
    const nextAction = nextActions?.[index] ?? nextActions?.[index - 1];
    (nextAction ?? prioritySectionRef.current)?.focus();
    priorityFocusIndex.current = null;
    restorePriorityFocus.current = false;
  }, [priorities]);

  async function completePriority(priority: Priority) {
    try {
      await provider.completePriority(priority.id);
      setPriorities((items) => items.filter((item) => item.id !== priority.id));
      setStatus("Priority completed");
    } catch {
      setStatus("Unable to complete priority");
    }
  }

  function focusPriorityAfterCompletion(priorityId: string) {
    priorityFocusIndex.current = priorities.findIndex((priority) => priority.id === priorityId);
    restorePriorityFocus.current = true;
  }

  return (
    <section className={`${styles.panel} ${styles.prioritiesPanel}`} ref={prioritySectionRef} tabIndex={-1}>
      <header className={styles.panelHeader}><h2>Today&apos;s priorities</h2></header>
      <div className={styles.priorityList}>
        {priorities.slice(0, 4).map((priority) => (
          <div className={styles.priorityRow} key={priority.id}>
            <span className={styles.rowIcon}><PriorityIcon kind={priority.kind} /></span>
            <span className={styles.rowCopy}>
              <strong>{priority.title}</strong>
              <small>{priority.detail}</small>
            </span>
            <ActionMenu
              buttonLabel={`${priority.actionLabel} ${priority.title}`}
              items={[{ label: "Mark complete", onSelect: () => completePriority(priority) }]}
              onActionComplete={() => focusPriorityAfterCompletion(priority.id)}
            />
          </div>
        ))}
      </div>
      <p aria-live="polite" className={styles.visuallyHidden} role="status">{status}</p>
    </section>
  );
}
