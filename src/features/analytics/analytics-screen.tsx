"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarBlank,
  ChartLineUp,
  CurrencyDollar,
  Funnel,
  Gauge,
  Megaphone,
  TrendUp,
  UsersThree,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ListBox, ListBoxItem } from "react-aria-components";
import { useAdminData } from "@/lib/admin-data/context";
import type { AnalyticsSnapshot, DistributionItem } from "@/lib/admin-data/types";
import { reportingRangeOptions, useReportingRange } from "@/lib/reporting-range";
import styles from "./analytics-screen.module.css";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));

function DataTable({ caption, children }: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div aria-label={`${caption} scroll area`} className={styles.tableScroller} role="region" tabIndex={0}>
      <table className={styles.dataTable}>
        <caption className={styles.visuallyHidden}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

function DistributionCard({
  caption,
  icon,
  items,
  title,
  valueFormatter = (value) => value.toLocaleString("en-US"),
}: Readonly<{
  caption: string;
  icon: ReactNode;
  items: DistributionItem[];
  title: string;
  valueFormatter?: (value: number) => string;
}>) {
  const maximum = Math.max(...items.map((item) => item.value), 1);
  return (
    <section className={`${styles.panel} ${styles.distributionPanel}`}>
      <header className={styles.panelHeader}><h2>{icon}{title}</h2></header>
      <ul className={styles.barList}>
        {items.map((item) => (
          <li key={item.label}>
            <div><span>{item.label}</span><strong>{valueFormatter(item.value)}</strong></div>
            <span aria-hidden className={styles.barTrack}><i style={{ width: `${(item.value / maximum) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
      <table className={styles.visuallyHidden}>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Label</th><th scope="col">Value</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.label}><th scope="row">{item.label}</th><td>{item.value}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

export function AnalyticsScreen() {
  const provider = useAdminData();
  const { selectedRange, setSelectedRange } = useReportingRange();
  const rangeButtonRef = useRef<HTMLButtonElement>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let active = true;
    provider.getAnalytics({ from: selectedRange.from, to: selectedRange.to })
      .then((snapshot) => {
        if (active) setAnalytics(snapshot);
      })
      .catch(() => {
        if (active) setLoadError("Unable to load analytics");
      });
    return () => { active = false; };
  }, [provider, retryRevision, selectedRange]);

  if (loadError) {
    return (
      <div className={styles.loadError} role="alert">
        <p>{loadError}</p>
        <button
          onClick={() => {
            setLoadError("");
            setAnalytics(null);
            setRetryRevision((revision) => revision + 1);
          }}
          type="button"
        >
          Retry analytics
        </button>
      </div>
    );
  }
  const snapshotMatchesSelectedRange = analytics
    && analytics.range.from === selectedRange.from
    && analytics.range.to === selectedRange.to;
  const displayedAnalytics = snapshotMatchesSelectedRange ? analytics : null;

  const filteredTrend = displayedAnalytics?.trend.filter(
    (point) => point.date >= selectedRange.from && point.date <= selectedRange.to,
  ) ?? [];
  const maximumRegistrations = Math.max(...filteredTrend.map((point) => point.registrations), 1);
  const trendNeedsOverflow = filteredTrend.length > 7;

  return (
    <main className={styles.screen}>
      <div className={styles.toolbar}>
        <div>
          <p className={styles.eyebrow}>Provider-backed reporting</p>
          <p>One reporting window is applied across trend, attribution, and funnel views.</p>
        </div>
        <div
          className={styles.rangeControl}
          onKeyDown={(event) => {
            if (event.key === "Escape" && rangeOpen) {
              event.preventDefault();
              setRangeOpen(false);
              rangeButtonRef.current?.focus();
            }
          }}
        >
          <Button
            aria-controls="analytics-range-options"
            aria-expanded={rangeOpen}
            aria-label="Date range"
            className={styles.rangeButton}
            onPress={() => setRangeOpen((open) => !open)}
            ref={rangeButtonRef}
          >
            <CalendarBlank aria-hidden size={17} />
            <span>Range</span>
          </Button>
          {rangeOpen ? (
            <div className={styles.rangePopover}>
              <ListBox
                aria-label="Analytics date ranges"
                className={styles.rangeList}
                id="analytics-range-options"
                items={reportingRangeOptions}
                onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const selectedKey = [...keys][0];
                  const option = reportingRangeOptions.find((item) => item.id === selectedKey);
                  if (option) {
                    setSelectedRange(option);
                    setRangeOpen(false);
                    rangeButtonRef.current?.focus();
                  }
                }}
                selectedKeys={[selectedRange.id]}
                selectionMode="single"
              >
              {(option) => (
                <ListBoxItem
                  aria-label={option.label}
                  className={styles.rangeOption}
                  id={option.id}
                  textValue={option.label}
                >
                  {option.label.replace("–", " to ")}
                </ListBoxItem>
              )}
              </ListBox>
            </div>
          ) : null}
        </div>
      </div>

      {!displayedAnalytics ? (
        <p className={`${styles.loading} ${styles.fullWidth}`} role="status">
          Loading analytics for {selectedRange.label}…
        </p>
      ) : (
        <>

      <section className={`${styles.panel} ${styles.trendPanel}`}>
        <header className={styles.panelHeader}>
          <h2><ChartLineUp aria-hidden size={18} />Conversion trend</h2>
          <span>{selectedRange.label}</span>
        </header>
        <div
          aria-label="Conversion trend axis"
          className={styles.trendScroller}
          data-overflow={trendNeedsOverflow ? "horizontal" : "fit"}
          role="region"
          tabIndex={trendNeedsOverflow ? 0 : undefined}
        >
          <div
            aria-label={`Registration, transfer, and renewal trend for ${selectedRange.label}`}
            className={styles.trendChart}
            data-point-count={filteredTrend.length}
            role="img"
            style={{
              gridTemplateColumns: `repeat(${filteredTrend.length}, minmax(${trendNeedsOverflow ? "44px" : "0"}, 1fr))`,
              minWidth: trendNeedsOverflow ? `${filteredTrend.length * 52}px` : "100%",
            }}
          >
            {filteredTrend.map((point) => (
              <div className={styles.trendColumn} key={point.date}>
                <div className={styles.trendBars}>
                  <span className={styles.registrationBar} style={{ height: `${(point.registrations / maximumRegistrations) * 100}%` }} />
                  <span className={styles.transferBar} style={{ height: `${(point.transfers / maximumRegistrations) * 100}%` }} />
                  <span className={styles.renewalBar} style={{ height: `${(point.renewals / maximumRegistrations) * 100}%` }} />
                </div>
                <span>{dateLabel(point.date)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.legend}>
          <span>Registrations</span><span>Transfers</span><span>Renewals</span>
        </div>
        <DataTable caption="Conversion trend data table">
          <thead><tr><th scope="col">Date</th><th scope="col">Registrations</th><th scope="col">Transfers</th><th scope="col">Renewals</th><th scope="col">Revenue</th></tr></thead>
          <tbody>{filteredTrend.map((point) => (
            <tr key={point.date}><th scope="row">{dateLabel(point.date)}</th><td>{point.registrations}</td><td>{point.transfers}</td><td>{point.renewals}</td><td>${point.revenue.toLocaleString("en-US")}</td></tr>
          ))}</tbody>
        </DataTable>
      </section>

      <section className={`${styles.panel} ${styles.attributionPanel}`}>
        <header className={styles.panelHeader}>
          <h2><Megaphone aria-hidden size={18} />Campaign attribution</h2>
          <span>{selectedRange.label}</span>
        </header>
        <DataTable caption="Attribution data table">
          <thead><tr><th scope="col">Campaign</th><th scope="col">Channel</th><th scope="col">Visitors</th><th scope="col">Verified customers</th><th scope="col">Conversions</th><th scope="col">Revenue</th></tr></thead>
          <tbody>{displayedAnalytics.campaignAttribution.map((campaign) => (
            <tr key={campaign.id}><th scope="row">{campaign.name}</th><td>{campaign.channel}</td><td>{campaign.visitors.toLocaleString("en-US")}</td><td>{campaign.verifiedCustomers}</td><td>{campaign.conversions}</td><td>${campaign.revenue.toLocaleString("en-US")}</td></tr>
          ))}</tbody>
        </DataTable>
      </section>

      <section className={`${styles.panel} ${styles.funnelPanel}`}>
        <header className={styles.panelHeader}>
          <h2><Funnel aria-hidden size={18} />Conversion funnel</h2>
          <span>{selectedRange.label}</span>
        </header>
        <ol className={styles.funnelList}>
          {displayedAnalytics.funnel.map((step) => {
            const DeltaIcon = step.delta >= 0 ? ArrowUpRight : ArrowDownRight;
            return (
              <li key={step.label}>
                <div><strong>{step.label}</strong><span>{step.value.toLocaleString("en-US")}</span></div>
                <span className={step.delta >= 0 ? styles.positive : styles.negative}>
                  <DeltaIcon aria-hidden size={14} />{Math.abs(step.delta)}%
                </span>
              </li>
            );
          })}
        </ol>
        <DataTable caption="Funnel data table">
          <thead><tr><th scope="col">Stage</th><th scope="col">Volume</th><th scope="col">Conversion rate</th><th scope="col">Change</th></tr></thead>
          <tbody>{displayedAnalytics.funnel.map((step) => (
            <tr key={step.label}><th scope="row">{step.label}</th><td>{step.value}</td><td>{step.conversionRate === null ? "Entry" : `${step.conversionRate}%`}</td><td>{step.delta}%</td></tr>
          ))}</tbody>
        </DataTable>
      </section>

      <DistributionCard caption="Revenue by source data table" icon={<CurrencyDollar aria-hidden size={18} />} items={displayedAnalytics.revenueBySource} title="Revenue by source" valueFormatter={(value) => `$${value.toLocaleString("en-US")}`} />
      <DistributionCard caption="Conversion by segment data table" icon={<UsersThree aria-hidden size={18} />} items={displayedAnalytics.conversionBySegment} title="Conversion by segment" />
      <DistributionCard caption="Lead velocity data table" icon={<TrendUp aria-hidden size={18} />} items={displayedAnalytics.leadVelocity} title="Lead velocity" />
      <DistributionCard caption="Offer performance data table" icon={<Megaphone aria-hidden size={18} />} items={displayedAnalytics.offerPerformance} title="Offer performance" />

      <section className={`${styles.panel} ${styles.retentionPanel}`}>
        <Gauge aria-hidden size={25} weight="duotone" />
        <div><p>Customer retention</p><strong>{displayedAnalytics.retentionRate}%</strong><span>Renewal rate for the provider reporting period</span></div>
      </section>
        </>
      )}
    </main>
  );
}
