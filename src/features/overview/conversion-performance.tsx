"use client";

import { useEffect, useState } from "react";
import { AccessibleLineChart } from "@/components/charts/accessible-line-chart";
import { useAdminData } from "@/lib/admin-data/context";
import type { TrendPoint } from "@/lib/admin-data/types";
import { useReportingRange } from "@/lib/reporting-range";
import styles from "./overview-screen.module.css";
const seriesOptions = ["registrations", "transfers", "renewals"] as const;
type Series = (typeof seriesOptions)[number];

const seriesLabels: Record<Series, string> = {
  registrations: "Registrations",
  renewals: "Renewals",
  transfers: "Transfers",
};

export function ConversionPerformance({
  rangeLabel,
  trend,
}: Readonly<{ rangeLabel?: string; trend?: TrendPoint[] }>) {
  const provider = useAdminData();
  const { selectedRange } = useReportingRange();
  const [fetchedTrend, setFetchedTrend] = useState<TrendPoint[] | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series>("registrations");

  useEffect(() => {
    if (trend) return;

    let active = true;
    provider.getOverview(selectedRange).then((overview) => {
      if (active) setFetchedTrend(overview.trend);
    });
    return () => { active = false; };
  }, [provider, selectedRange, trend]);

  const resolvedTrend = trend ?? fetchedTrend;
  if (!resolvedTrend) return <p role="status">Loading performance…</p>;

  const label = seriesLabels[selectedSeries];
  const data = resolvedTrend.map((point) => ({ date: point.date, value: point[selectedSeries] }));
  const total = data.reduce((sum, point) => sum + point.value, 0);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + seriesOptions.length) % seriesOptions.length;
    const nextSeries = seriesOptions[nextIndex];
    setSelectedSeries(nextSeries);
    const nextTab = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `#performance-tab-${nextSeries}`,
    );
    nextTab?.focus();
  };

  return (
    <section className={`${styles.panel} ${styles.performancePanel}`}>
      <header className={styles.panelHeader}>
        <h2>Conversion performance</h2>
        <div aria-label="Performance metric" className={styles.chartTabs} role="tablist">
          {seriesOptions.map((series, index) => (
            <button
              aria-controls="performance-chart-panel"
              aria-selected={selectedSeries === series}
              className={styles.chartTab}
              id={`performance-tab-${series}`}
              key={series}
              onClick={() => setSelectedSeries(series)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              role="tab"
              tabIndex={selectedSeries === series ? 0 : -1}
              type="button"
            >
              {seriesLabels[series]}
            </button>
          ))}
        </div>
      </header>
      <div
        aria-labelledby={`performance-tab-${selectedSeries}`}
        id="performance-chart-panel"
        role="tabpanel"
      >
        <AccessibleLineChart data={data} label={label} rangeLabel={rangeLabel ?? selectedRange.label} />
      </div>
      <div className={styles.chartLegend}>
        <span><i /> {label}</span>
        <span>Total ({rangeLabel ?? selectedRange.label}): {total}</span>
      </div>
    </section>
  );
}
