import { ArrowDown, ArrowRight, ArrowUp } from "@phosphor-icons/react";
import type { FunnelStep } from "@/lib/admin-data/types";
import styles from "./overview-screen.module.css";

export function ConversionFunnel({
  funnel,
  rangeLabel,
}: Readonly<{ funnel: FunnelStep[]; rangeLabel: string }>) {
  return (
    <section className={`${styles.panel} ${styles.lowerPanel}`}>
      <header className={styles.panelHeader}>
        <h2>Conversion funnel</h2>
        <span>{rangeLabel}</span>
      </header>
      <div className={styles.funnelRows}>
        {funnel.map((step, index) => {
          const positive = step.delta >= 0;
          const DeltaIcon = positive ? ArrowUp : ArrowDown;
          return (
            <div className={styles.funnelRow} key={step.label}>
              <div className={styles.funnelShape} data-step={index + 1}>
                <span>{step.label}</span>
                <strong>{step.value.toLocaleString("en-US")}</strong>
              </div>
              <div className={styles.funnelStats}>
                {step.conversionRate !== null && <strong>{step.conversionRate}%</strong>}
                <span className={positive ? styles.deltaPositive : styles.deltaNegative}>
                  <DeltaIcon aria-hidden size={12} weight="bold" />
                  {Math.abs(step.delta)}%
                  <small>vs Aug 9–15</small>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <a className={styles.panelFooter} href="/analytics">
        View full funnel <ArrowRight aria-hidden size={13} weight="bold" />
      </a>
    </section>
  );
}
