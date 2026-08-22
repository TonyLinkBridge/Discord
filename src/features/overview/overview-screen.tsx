"use client";

import {
  ArrowRight,
  ArrowsClockwise,
  ChatCircleDots,
  CheckCircle,
  Fire,
  Tag,
  UserCircleCheck,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { Lead, OverviewSnapshot, Priority } from "@/lib/admin-data/types";
import { CampaignPerformance } from "./campaign-performance";
import { ConversionFunnel } from "./conversion-funnel";
import { ConversionPerformance } from "./conversion-performance";
import { MetricStrip } from "./metric-strip";
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

function PrioritySummary({ priorities }: Readonly<{ priorities: Priority[] }>) {
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
            <span className={styles.actionLabel}>{priority.actionLabel}</span>
          </div>
        ))}
      </div>
      <a className={styles.panelFooter} href="/priorities">
        View all priorities <ArrowRight aria-hidden size={13} weight="bold" />
      </a>
    </section>
  );
}

const actionLabels: Record<Lead["nextAction"], string> = {
  "follow-up": "Follow up",
  "mark-converted": "Mark converted",
  "message": "Message",
  "review-vip": "Review VIP",
  "send-offer": "Send offer",
};

function HighIntentLeads({ leads }: Readonly<{ leads: Lead[] }>) {
  return (
    <section className={`${styles.panel} ${styles.lowerPanel}`}>
      <header className={styles.panelHeader}><h2>High-intent leads</h2></header>
      <div className={styles.tableScroller}>
        <table className={`${styles.dataTable} ${styles.leadsTable}`}>
          <thead><tr><th>Name</th><th>Segment</th><th>Intent</th><th>Last activity</th><th>Next action</th></tr></thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td><span className={styles.leadName}><i />{lead.name}</span></td>
                <td>{lead.segment}</td>
                <td>
                  <span className={lead.intent === "Very High" ? styles.intentCritical : styles.intentHigh}>
                    <Fire aria-hidden size={12} weight="fill" />
                    {lead.intent}
                  </span>
                </td>
                <td>{lead.lastActivity}</td>
                <td><span className={styles.actionLabel}>{actionLabels[lead.nextAction]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a className={styles.panelFooter} href="/leads">
        View all leads <ArrowRight aria-hidden size={13} weight="bold" />
      </a>
    </section>
  );
}

export function OverviewScreen() {
  const provider = useAdminData();
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    provider.getOverview(overviewDateRange).then((overview) => {
      if (active) setSnapshot(overview);
    });
    return () => { active = false; };
  }, [provider]);

  if (!snapshot) return <p className={styles.loading} role="status">Loading overview…</p>;

  return (
    <main className={styles.screen}>
      <MetricStrip metrics={snapshot.metrics} />
      <div className={styles.mainGrid}>
        <ConversionPerformance trend={snapshot.trend} />
        <PrioritySummary priorities={snapshot.priorities} />
      </div>
      <div className={styles.lowerGrid}>
        <ConversionFunnel funnel={snapshot.funnel} />
        <HighIntentLeads leads={snapshot.leads} />
        <CampaignPerformance campaigns={snapshot.campaigns} />
      </div>
    </main>
  );
}
