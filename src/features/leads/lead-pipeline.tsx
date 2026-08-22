import { ArrowRight } from "@phosphor-icons/react";
import type { Lead, LeadStage } from "@/lib/admin-data/types";
import styles from "./leads-screen.module.css";

const stages: readonly { id: LeadStage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "engaged", label: "Engaged" },
  { id: "high-intent", label: "High Intent" },
  { id: "offer-sent", label: "Offer Sent" },
  { id: "converted", label: "Converted" },
  { id: "closed", label: "Closed" },
];

export function LeadPipeline({
  leads,
  onOpen,
}: Readonly<{
  leads: Lead[];
  onOpen: (lead: Lead) => void;
}>) {
  return (
    <div aria-label="Lead pipeline stages" className={styles.pipeline}>
      {stages.map((stage) => {
        const stageLeads = leads.filter((lead) => lead.stage === stage.id);
        return (
          <section aria-labelledby={`lead-stage-${stage.id}`} className={styles.pipelineColumn} key={stage.id}>
            <header>
              <h3 id={`lead-stage-${stage.id}`}>{stage.label}</h3>
              <span>{stageLeads.length}</span>
            </header>
            <div className={styles.pipelineCards}>
              {stageLeads.map((lead) => (
                <button aria-label={`Open ${lead.name}`} className={styles.leadCard} key={lead.id} onClick={() => onOpen(lead)} type="button">
                  <span><strong>{lead.name}</strong><ArrowRight aria-hidden size={13} /></span>
                  <small>{lead.segment} · {lead.intent} intent</small>
                  <small>{lead.portfolioSizeBand}</small>
                  <span className={styles.value}>${lead.attributedValue.toLocaleString()}</span>
                </button>
              ))}
              {!stageLeads.length ? <p className={styles.emptyStage}>No leads</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
