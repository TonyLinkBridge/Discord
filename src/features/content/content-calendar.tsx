import { CalendarBlank, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import type { ContentEntry } from "@/lib/admin-data/types";
import { contentFormats, summarizeContentMix } from "./content-mix";
import styles from "./content-screen.module.css";

const formatLabels = Object.fromEntries(
  contentFormats.map((format) => [format.value, format.label]),
) as Record<ContentEntry["format"], string>;

const conversionLabels: Record<ContentEntry["conversionLevel"], string> = {
  direct: "Direct offer",
  education: "Education",
  soft: "Soft conversion",
};

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(value));
}

export function ContentCalendar({ entries }: Readonly<{ entries: readonly ContentEntry[] }>) {
  const orderedEntries = [...entries].sort((left, right) => left.publishAt.localeCompare(right.publishAt));
  const mix = summarizeContentMix(orderedEntries.map((entry) => entry.conversionLevel));

  return (
    <section aria-labelledby="content-calendar-title" className={styles.calendarPanel}>
      <header className={styles.calendarHeader}>
        <div>
          <p className={styles.eyebrow}>Seven-post publishing cycle</p>
          <h2 id="content-calendar-title">Content calendar</h2>
        </div>
        <span className={mix.compliant ? styles.compliant : styles.noncompliant}>
          {mix.compliant
            ? <CheckCircle aria-hidden size={15} weight="fill" />
            : <WarningCircle aria-hidden size={15} weight="fill" />}
          {mix.compliant ? "4:2:1 cycle compliant" : "4:2:1 cycle needs adjustment"}
        </span>
      </header>

      <ul aria-label="Publishing mix" className={styles.mixSummary}>
        <li>{mix.education} education</li>
        <li>{mix.soft} soft conversion</li>
        <li>{mix.direct} direct offer</li>
      </ul>

      <div className={styles.calendarGrid}>
        {orderedEntries.map((entry) => (
          <article className={styles.calendarCard} key={entry.id}>
            <header>
              <span><CalendarBlank aria-hidden size={14} />{dateLabel(entry.publishAt)}</span>
              <span className={`${styles.level} ${styles[entry.conversionLevel]}`}>
                {conversionLabels[entry.conversionLevel]}
              </span>
            </header>
            <p>{formatLabels[entry.format]}</p>
            <h3>{entry.title}</h3>
            <footer>
              <span>CTA</span>
              <strong>{entry.ctas[0]}</strong>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
