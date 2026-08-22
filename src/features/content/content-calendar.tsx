"use client";

import { CalendarBlank, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import type { ContentEntry } from "@/lib/admin-data/types";
import { contentFormats, partitionContentCycles } from "./content-mix";
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

function dateRangeLabel(entries: readonly ContentEntry[]): string {
  const start = new Date(entries[0].publishAt);
  const end = new Date(entries.at(-1)?.publishAt ?? entries[0].publishAt);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const startMonth = month.format(start);
  const endMonth = month.format(end);
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}, ${endYear}`;
  }
  return `${startMonth} ${start.getUTCDate()}, ${startYear}–${endMonth} ${end.getUTCDate()}, ${endYear}`;
}

export function ContentCalendar({ entries }: Readonly<{ entries: readonly ContentEntry[] }>) {
  const cycles = partitionContentCycles(entries);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = Math.min(selectedIndex, Math.max(0, cycles.length - 1));
  const selectedCycle = cycles[activeIndex] ?? cycles[0];
  const cycleLabel = `Cycle ${selectedCycle.number} · ${dateRangeLabel(selectedCycle.entries)}`;

  return (
    <section aria-labelledby="content-calendar-title" className={styles.calendarPanel}>
      <header className={styles.calendarHeader}>
        <div>
          <p className={styles.eyebrow}>Seven-post publishing cycle</p>
          <h2 id="content-calendar-title">Content calendar</h2>
        </div>
        <div className={styles.cycleControls}>
          <label>
            Publishing cycle
            <select onChange={(event) => setSelectedIndex(Number(event.target.value))} value={activeIndex}>
              {cycles.map((cycle, index) => (
                <option key={cycle.number} value={index}>
                  {`Cycle ${cycle.number}`}
                </option>
              ))}
            </select>
          </label>
          <strong className={styles.cycleLabel}>{cycleLabel}</strong>
        </div>
        <span className={selectedCycle.compliant ? styles.compliant : styles.noncompliant}>
          {selectedCycle.compliant
            ? <CheckCircle aria-hidden size={15} weight="fill" />
            : <WarningCircle aria-hidden size={15} weight="fill" />}
          {selectedCycle.compliant ? "4:2:1 cycle compliant" : "4:2:1 cycle needs adjustment"}
        </span>
      </header>

      {!selectedCycle.complete ? (
        <p className={styles.incompleteCycle}>
          {`Incomplete cycle · ${selectedCycle.entries.length} of 7 posts`}
        </p>
      ) : null}

      <ul aria-label="Publishing mix" className={styles.mixSummary}>
        <li>{selectedCycle.mix.education} education</li>
        <li>{selectedCycle.mix.soft} soft conversion</li>
        <li>{selectedCycle.mix.direct} direct offer</li>
      </ul>

      <div className={styles.calendarGrid}>
        {selectedCycle.entries.map((entry) => (
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
