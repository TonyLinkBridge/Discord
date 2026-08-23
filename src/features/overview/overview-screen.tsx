"use client";

import { useEffect, useState } from "react";
import { OverviewUnavailable } from "@/components/data-state/data-unavailable";
import { useAdminAvailability, useAdminData } from "@/lib/admin-data/context";
import type { OverviewSnapshot } from "@/lib/admin-data/types";
import { useReportingRange } from "@/lib/reporting-range";
import { CampaignPerformance } from "./campaign-performance";
import { ConversionFunnel } from "./conversion-funnel";
import { ConversionPerformance } from "./conversion-performance";
import { HighIntentLeads } from "./high-intent-leads";
import { MetricStrip } from "./metric-strip";
import styles from "./overview-screen.module.css";
import { TodaysPriorities } from "./todays-priorities";

export function OverviewScreen() {
  const provider = useAdminData();
  const availability = useAdminAvailability();
  const overviewAvailable = availability.capabilities["read-overview"].available;
  const { selectedRange } = useReportingRange();
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);

  useEffect(() => {
    if (!overviewAvailable) return;
    let active = true;
    provider.getOverview(selectedRange).then((overview) => {
      if (active) setSnapshot(overview);
    });
    return () => { active = false; };
  }, [overviewAvailable, provider, selectedRange]);

  if (!overviewAvailable) return <OverviewUnavailable />;

  const snapshotMatchesSelectedRange = snapshot
    && snapshot.range.from === selectedRange.from
    && snapshot.range.to === selectedRange.to;
  const displayedSnapshot = snapshotMatchesSelectedRange ? snapshot : null;

  if (!displayedSnapshot) {
    return (
      <p className={styles.loading} role="status">
        Loading overview for {selectedRange.label}…
      </p>
    );
  }

  return (
    <main className={styles.screen}>
      <MetricStrip metrics={displayedSnapshot.metrics} />
      <div className={styles.mainGrid}>
        <ConversionPerformance rangeLabel={selectedRange.label} trend={displayedSnapshot.trend} />
        <TodaysPriorities priorities={displayedSnapshot.priorities} />
      </div>
      <div className={styles.lowerGrid}>
        <ConversionFunnel
          funnel={displayedSnapshot.funnel}
          rangeLabel={selectedRange.label}
          semantics={displayedSnapshot.funnelSemantics}
        />
        <HighIntentLeads leads={displayedSnapshot.leads} />
        <CampaignPerformance campaigns={displayedSnapshot.campaigns} rangeLabel={selectedRange.label} />
      </div>
    </main>
  );
}
