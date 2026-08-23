"use client";

import { useState } from "react";

import type { VerificationReviewRow } from "@/lib/verification/types";

import {
  VerificationDetail,
  type VerificationQueueActions,
} from "./verification-detail";
import styles from "./members-screen.module.css";

export function VerificationQueue({
  actions,
  rows,
}: Readonly<{
  actions: VerificationQueueActions;
  rows: VerificationReviewRow[];
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find(({ id }) => id === selectedId) ?? null;

  return (
    <section className={styles.verificationPanel}>
      <header className={styles.header}>
        <div>
          <h2>Customer verification queue</h2>
          <p>{rows.length} real request{rows.length === 1 ? "" : "s"} from Discord</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className={styles.verificationEmpty}>No verification requests yet</p>
      ) : (
        <div className={styles.verificationList}>
          {rows.map((row) => (
            <article className={styles.verificationRow} key={row.id}>
              <div>
                <strong>{row.displayName}</strong>
                <span>@{row.discordHandle}</span>
              </div>
              <span className={styles.verificationState}>{row.status.replace("_", " ")}</span>
              <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleDateString("en-GB")}</time>
              <button
                aria-label={`Review ${row.displayName}`}
                className={styles.openButton}
                onClick={() => setSelectedId(row.id)}
                type="button"
              >
                Review
              </button>
            </article>
          ))}
        </div>
      )}

      {selected ? (
        <VerificationDetail
          actions={actions}
          key={selected.id}
          onClose={() => setSelectedId(null)}
          row={selected}
        />
      ) : null}
    </section>
  );
}
