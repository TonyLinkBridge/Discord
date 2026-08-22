"use client";

import {
  ArrowRight,
  ArrowsClockwise,
  ChatCircleDots,
  CheckCircle,
  Tag,
  UserCircleCheck,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { useAdminData } from "@/lib/admin-data/context";
import type { Priority } from "@/lib/admin-data/types";
import { overviewDateRange } from "./overview-range";
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
  const [priorities, setPriorities] = useState<Priority[]>(initialPriorities ?? []);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (initialPriorities) return;

    let active = true;
    provider.getOverview(overviewDateRange).then((overview) => {
      if (active) setPriorities(overview.priorities);
    });
    return () => { active = false; };
  }, [initialPriorities, provider]);

  async function completePriority(priority: Priority) {
    try {
      await provider.completePriority(priority.id, "local-ray");
      setPriorities((items) => items.filter((item) => item.id !== priority.id));
      setStatus("Priority completed");
    } catch {
      setStatus("Unable to complete priority");
    }
  }

  return (
    <section className={`${styles.panel} ${styles.prioritiesPanel}`}>
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
            />
          </div>
        ))}
      </div>
      <p aria-live="polite" className={styles.visuallyHidden} role="status">{status}</p>
      <a className={styles.panelFooter} href="/priorities">
        View all priorities <ArrowRight aria-hidden size={13} weight="bold" />
      </a>
    </section>
  );
}
