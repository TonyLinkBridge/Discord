"use client";

import { useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { OverviewSnapshot } from "@/lib/admin-data/types";
import { CampaignPerformance } from "./campaign-performance";
import { ConversionFunnel } from "./conversion-funnel";
import { ConversionPerformance } from "./conversion-performance";
import { HighIntentLeads } from "./high-intent-leads";
import { MetricStrip } from "./metric-strip";
import { overviewDateRange } from "./overview-range";
import styles from "./overview-screen.module.css";
import { TodaysPriorities } from "./todays-priorities";

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
        <TodaysPriorities priorities={snapshot.priorities} />
      </div>
      <div className={styles.lowerGrid}>
        <ConversionFunnel funnel={snapshot.funnel} />
        <HighIntentLeads leads={snapshot.leads} />
        <CampaignPerformance campaigns={snapshot.campaigns} />
      </div>
    </main>
  );
}
