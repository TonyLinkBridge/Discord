import {
  ArrowsClockwise,
  ArrowsLeftRight,
  CurrencyDollar,
  DiscordLogo,
  GlobeHemisphereWest,
  ShieldCheck,
  TrendDown,
  TrendUp,
} from "@phosphor-icons/react";
import type { Metric } from "@/lib/admin-data/types";
import styles from "./overview-screen.module.css";

function MetricIcon({ id }: Readonly<{ id: string }>) {
  const iconProps = { "aria-hidden": true, size: 27, weight: "duotone" as const };

  switch (id) {
    case "discord-members":
      return <DiscordLogo {...iconProps} />;
    case "verified-customers":
      return <ShieldCheck {...iconProps} />;
    case "registrations":
      return <GlobeHemisphereWest {...iconProps} />;
    case "transfers":
      return <ArrowsLeftRight {...iconProps} />;
    case "renewal-rate":
      return <ArrowsClockwise {...iconProps} />;
    default:
      return <CurrencyDollar {...iconProps} />;
  }
}

export function MetricStrip({ metrics }: Readonly<{ metrics: Metric[] }>) {
  return (
    <section aria-label="Overview metrics" className={styles.metricStrip}>
      {metrics.map((metric) => {
        const positive = metric.delta >= 0;
        const DeltaIcon = positive ? TrendUp : TrendDown;

        return (
          <article className={styles.metric} key={metric.id}>
            <span className={styles.metricIcon}>
              <MetricIcon id={metric.id} />
            </span>
            <span className={styles.metricCopy}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <strong className={styles.metricValue}>{metric.value}</strong>
              <span className={positive ? styles.deltaPositive : styles.deltaNegative}>
                <DeltaIcon aria-hidden size={13} weight="bold" />
                {Math.abs(metric.delta)}{metric.id === "renewal-rate" ? "pp" : "%"}
                <span className={styles.deltaPeriod}>{metric.deltaLabel.replace(/^pp\s*/, "")}</span>
              </span>
            </span>
          </article>
        );
      })}
    </section>
  );
}
