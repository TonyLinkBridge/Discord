import { ArrowSquareOut, Fire } from "@phosphor-icons/react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { Lead } from "@/lib/admin-data/types";
import styles from "./leads-screen.module.css";

const actionLabels = {
  "follow-up": "Follow up",
  "mark-converted": "Mark converted",
  message: "Message",
  "review-vip": "Review VIP",
  "send-offer": "Send offer",
} as const;

export function LeadTable({
  leads,
  onOpen,
}: Readonly<{
  leads: Lead[];
  onOpen: (lead: Lead) => void;
}>) {
  const columns: DataTableColumn<Lead>[] = [
    {
      id: "name",
      header: "Name",
      render: (lead) => <strong className={styles.leadName}>{lead.name}</strong>,
    },
    { id: "source", header: "Source", render: (lead) => lead.source },
    { id: "segment", header: "Segment", render: (lead) => lead.segment },
    { id: "portfolio", header: "Portfolio", render: (lead) => lead.portfolioSizeBand },
    {
      id: "intent",
      header: "Intent",
      render: (lead) => (
        <span className={lead.intent === "Very High" ? styles.veryHigh : styles.high}>
          <Fire aria-hidden size={12} weight="fill" /> {lead.intent}
        </span>
      ),
    },
    { id: "stage", header: "Stage", render: (lead) => <span className={styles.stage}>{lead.stage.replaceAll("-", " ")}</span> },
    { id: "activity", header: "Last activity", render: (lead) => lead.lastActivity },
    { id: "action", header: "Next action", render: (lead) => actionLabels[lead.nextAction] },
    {
      id: "open",
      header: "",
      render: (lead) => (
        <button aria-label={`Open ${lead.name}`} className={styles.openButton} onClick={() => onOpen(lead)} type="button">
          Open <ArrowSquareOut aria-hidden size={13} />
        </button>
      ),
    },
  ];

  return (
    <DataTable
      caption="RayName conversion leads"
      columns={columns}
      emptyMessage="No leads match these filters."
      rows={leads}
    />
  );
}
