"use client";

import { Funnel, Kanban, Table } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { Lead } from "@/lib/admin-data/types";
import { LeadDetail } from "./lead-detail";
import { LeadPipeline } from "./lead-pipeline";
import { LeadTable } from "./lead-table";
import styles from "./leads-screen.module.css";

type LeadView = "table" | "pipeline";

const normalize = (value: string) => value.toLocaleLowerCase().replaceAll(" ", "-");

export function LeadsScreen() {
  const provider = useAdminData();
  const segmentFilterRef = useRef<HTMLSelectElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<LeadView>("table");
  const [segment, setSegment] = useState("all");
  const [intent, setIntent] = useState("all");

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (active) {
        setLeads(state.leads);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [provider]);

  const segments = useMemo(
    () => [...new Set(leads.map((lead) => lead.segment))],
    [leads],
  );
  const intents = useMemo(
    () => [...new Set(leads.map((lead) => lead.intent))],
    [leads],
  );
  const filteredLeads = useMemo(() => leads.filter((lead) => (
    (segment === "all" || normalize(lead.segment) === segment)
      && (intent === "all" || normalize(lead.intent) === intent)
  )), [intent, leads, segment]);
  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? null;

  function replaceLead(updated: Lead) {
    setLeads((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  if (!loaded) return <p className={styles.loading} role="status">Loading leads…</p>;

  return (
    <main className={styles.screen}>
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}><Funnel aria-hidden size={14} /> Conversion workspace</p>
            <h2>Lead pipeline</h2>
            <p>{filteredLeads.length} of {leads.length} leads</p>
          </div>
          <div aria-label="Lead view" className={styles.viewToggle} role="group">
            <button
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              type="button"
            >
              <Table aria-hidden size={15} /> Table
            </button>
            <button
              aria-pressed={view === "pipeline"}
              onClick={() => setView("pipeline")}
              type="button"
            >
              <Kanban aria-hidden size={15} /> Pipeline
            </button>
          </div>
        </header>

        <div aria-label="Lead filters" className={styles.filters} role="group">
          <label>
            Segment
            <select
              onChange={(event) => setSegment(event.target.value)}
              ref={segmentFilterRef}
              value={segment}
            >
              <option value="all">All segments</option>
              {segments.map((item) => <option key={item} value={normalize(item)}>{item}</option>)}
            </select>
          </label>
          <label>
            Intent
            <select onChange={(event) => setIntent(event.target.value)} value={intent}>
              <option value="all">All intent levels</option>
              {intents.map((item) => <option key={item} value={normalize(item)}>{item}</option>)}
            </select>
          </label>
        </div>

        {view === "table" ? (
          <LeadTable leads={filteredLeads} onOpen={(lead) => setSelectedId(lead.id)} />
        ) : (
          <LeadPipeline leads={filteredLeads} onOpen={(lead) => setSelectedId(lead.id)} />
        )}
      </section>

      {selectedLead ? (
        <LeadDetail
          focusFallbackRef={segmentFilterRef}
          lead={selectedLead}
          onChange={replaceLead}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </main>
  );
}
