"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import { useActionState } from "react";

import type { MemberSyncViewStatus } from "@/lib/member-sync/types";
import type { MemberSyncActionResult } from "@/app/(admin)/member-sync-actions";

import styles from "./members-screen.module.css";

const initialResult: MemberSyncActionResult = { state: "idle" };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function MemberSyncStatus({
  activeMemberCount,
  botCount,
  currentTime,
  status,
  syncAction,
}: Readonly<{
  activeMemberCount: number;
  botCount: number;
  currentTime: string;
  status: MemberSyncViewStatus;
  syncAction: (
    previousState: MemberSyncActionResult,
  ) => Promise<MemberSyncActionResult>;
}>) {
  const [result, action, pending] = useActionState(syncAction, initialResult);
  const serverRunning = status.state === "running";
  const startedAt = status.lastRunStartedAt
    ? new Date(status.lastRunStartedAt).getTime()
    : Number.NaN;
  const staleRunning =
    serverRunning &&
    Number.isFinite(startedAt) &&
    new Date(currentTime).getTime() - startedAt >= 15 * 60 * 1_000;
  const activeServerRun = serverRunning && !staleRunning;

  return (
    <section aria-labelledby="member-sync-title" className={styles.syncPanel}>
      <div className={styles.syncHeader}>
        <div>
          <h2 id="member-sync-title">Discord member sync</h2>
          <p>
            Last successful sync: {status.lastSuccessfulSyncAt ? (
              <time dateTime={status.lastSuccessfulSyncAt}>
                {formatDate(status.lastSuccessfulSyncAt)}
              </time>
            ) : (
              <strong>Never synced</strong>
            )}
          </p>
        </div>
        <form action={action}>
          <button
            aria-label={
              pending
                ? "Syncing"
                : activeServerRun
                  ? "Sync in progress"
                  : staleRunning
                    ? "Recover sync"
                    : undefined
            }
            className={styles.syncButton}
            disabled={pending || activeServerRun}
            type="submit"
          >
            <ArrowsClockwise aria-hidden size={16} weight="bold" />
            {pending
              ? "Syncing…"
              : activeServerRun
                ? "Sync in progress"
                : staleRunning
                  ? "Recover sync"
                  : "Sync now"}
          </button>
        </form>
      </div>

      <dl className={styles.syncFacts}>
        <div>
          <dt>Active members</dt>
          <dd><strong>{activeMemberCount}</strong></dd>
        </div>
        <div>
          <dt>Bots</dt>
          <dd><strong>{botCount}</strong></dd>
        </div>
        <div>
          <dt>Sync state</dt>
          <dd>{status.state === "never" ? "Not started" : status.state}</dd>
        </div>
      </dl>

      {result.state === "succeeded" ? (
        <p className={styles.syncSuccess} role="status">
          Synced {result.memberCount} members successfully.
        </p>
      ) : result.state === "already-running" ? (
        <p className={styles.syncNotice} role="status">
          A member sync has already been running since {formatDate(result.startedAt)}.
        </p>
      ) : result.state === "failed" ? (
        <p className={styles.syncFailure} role="alert">
          {result.message}{result.retryable ? " Try again shortly." : ""}
        </p>
      ) : status.state === "degraded" && status.safeErrorMessage ? (
        <p className={styles.syncFailure} role="alert">
          Latest attempt failed: {status.safeErrorMessage}.{" "}
          {status.lastSuccessfulSyncAt
            ? "The last successful data remains available."
            : "No successful member snapshot is available."}
        </p>
      ) : null}
    </section>
  );
}
