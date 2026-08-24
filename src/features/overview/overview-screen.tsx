"use client";

import { DataUnavailable, OverviewUnavailable } from "@/components/data-state/data-unavailable";
import type { Metric } from "@/lib/admin-data/types";
import type { DiscordOverviewFacts } from "@/lib/member-sync/read-model";

import { MetricStrip } from "./metric-strip";
import styles from "./overview-screen.module.css";

function snapshotLabel(value: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
  return `Latest Discord snapshot · ${formatted} UTC`;
}

export function OverviewScreen({
  facts,
}: Readonly<{ facts: DiscordOverviewFacts | null }>) {
  if (!facts) return <OverviewUnavailable />;

  const discordSnapshot = snapshotLabel(facts.asOf);
  const metrics: Metric[] = [
    {
      id: "discord-members",
      label: "Discord Members",
      value: facts.discordMembers.toLocaleString("en-US"),
      delta: null,
      deltaLabel: discordSnapshot,
    },
    {
      id: "verified-customers",
      label: "Verified Customers",
      value: facts.verifiedCustomers.toLocaleString("en-US"),
      delta: null,
      deltaLabel: discordSnapshot,
    },
    ...[
      ["registrations", "Registrations"],
      ["transfers", "Transfers"],
      ["renewal-rate", "Renewal Rate"],
      ["attributed-revenue", "Attributed Revenue"],
    ].map(([id, label]) => ({
      id,
      label,
      value: "—",
      delta: null,
      deltaLabel: "Marketing API pending",
    })),
  ];

  return (
    <main className={styles.screen}>
      <p className={styles.integrationNote}>
        Discord data connected · RayName Marketing API pending
      </p>
      <MetricStrip metrics={metrics} />
      <DataUnavailable
        description="Registrations, transfers, renewals, attributed revenue, conversion performance, priorities, funnel, leads, and campaigns will appear after the RayName Marketing API is connected."
        title="RayName Marketing API pending"
      />
    </main>
  );
}
