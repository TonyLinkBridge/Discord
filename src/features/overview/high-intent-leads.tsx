"use client";

import { ArrowRight, Fire } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { useAdminData } from "@/lib/admin-data/context";
import type { Lead, LeadAction } from "@/lib/admin-data/types";
import { useReportingRange } from "@/lib/reporting-range";
import styles from "./overview-screen.module.css";

const actionLabels: Record<LeadAction, string> = {
  "follow-up": "Follow up",
  "mark-converted": "Mark converted",
  message: "Message",
  "review-vip": "Review VIP",
  "send-offer": "Send offer",
};

const actionItems = (update: (action: LeadAction) => Promise<void>) => (
  (Object.entries(actionLabels) as [LeadAction, string][]).map(([action, label]) => ({
    label,
    onSelect: () => update(action),
  }))
);

export function HighIntentLeads({ leads: initialLeads }: Readonly<{ leads?: Lead[] }>) {
  const provider = useAdminData();
  const { selectedRange } = useReportingRange();
  const [leads, setLeads] = useState<Lead[]>(initialLeads ?? []);
  const [completedActions, setCompletedActions] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (initialLeads) return;

    let active = true;
    provider.getOverview(selectedRange).then((overview) => {
      if (active) setLeads(overview.leads);
    });
    return () => { active = false; };
  }, [initialLeads, provider, selectedRange]);

  async function updateLeadAction(lead: Lead, action: LeadAction) {
    try {
      await provider.updateLeadAction(lead.id, action, "local-ray");
      setLeads((items) => items.map((item) => (
        item.id === lead.id ? { ...item, completedAction: null, nextAction: action } : item
      )));
      setCompletedActions((items) => ({
        ...items,
        [lead.id]: action === "send-offer" ? "Offer sent" : actionLabels[action],
      }));
      setStatus(`${lead.name} updated`);
    } catch {
      setStatus(`Unable to update ${lead.name}`);
    }
  }

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
                <td>
                  <span className={styles.leadAction}>
                    <span className={styles.actionLabel}>
                      {completedActions[lead.id]
                        ?? (lead.nextAction
                          ? actionLabels[lead.nextAction]
                          : lead.completedAction
                            ? `${actionLabels[lead.completedAction]} complete`
                            : "No action scheduled")}
                    </span>
                    <ActionMenu
                      buttonLabel={`Actions for ${lead.name}`}
                      compact
                      items={actionItems((action) => updateLeadAction(lead, action))}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className={styles.visuallyHidden} role="status">{status}</p>
      <Link className={styles.panelFooter} href="/leads">
        View all leads <ArrowRight aria-hidden size={13} weight="bold" />
      </Link>
    </section>
  );
}
