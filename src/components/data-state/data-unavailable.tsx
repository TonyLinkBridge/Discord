"use client";

import { Database, PlugsConnected } from "@phosphor-icons/react";
import { useAdminAvailability } from "@/lib/admin-data/context";
import type { AdminCapability } from "@/lib/admin-data/availability";
import styles from "./data-unavailable.module.css";

export function DataUnavailable({ description, title }: Readonly<{
  description: string;
  title: string;
}>) {
  return (
    <section className={styles.unavailable} role="status">
      <span className={styles.icon}><PlugsConnected aria-hidden size={24} weight="duotone" /></span>
      <div>
        <p className={styles.eyebrow}>Live data required</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}

export function CapabilityBoundary({ as = "main", capability, children, description, title }: Readonly<{
  as?: "main" | "section";
  capability: AdminCapability;
  children: React.ReactNode;
  description?: string;
  title: string;
}>) {
  const availability = useAdminAvailability();
  const state = availability.capabilities[capability];

  if (state.available) return children;

  const Boundary = as;

  return (
    <Boundary className={styles.boundary}>
      <DataUnavailable
        description={description ?? state.reason ?? "This data source is not connected."}
        title={title}
      />
    </Boundary>
  );
}

const overviewMetricLabels = [
  "Discord Members",
  "Verified Customers",
  "Registrations",
  "Transfers",
  "Renewal Rate",
  "Attributed Revenue",
] as const;

export function OverviewUnavailable() {
  return (
    <main className={styles.overviewUnavailable}>
      <section aria-label="Overview metrics" className={styles.metricStrip}>
        {overviewMetricLabels.map((label) => (
          <article className={styles.metric} key={label}>
            <Database aria-hidden size={20} weight="duotone" />
            <span>{label}</span>
            <strong>—</strong>
          </article>
        ))}
      </section>
      <DataUnavailable
        description="Connect the Discord, database, and RayName data integrations to show real community and conversion results."
        title="Data source not connected"
      />
    </main>
  );
}
