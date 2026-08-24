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
  status,
  syncAction,
}: Readonly<{
  activeMemberCount: number;
  botCount: number;
  status: MemberSyncViewStatus;
  syncAction: (
    previousState: MemberSyncActionResult,
  ) => Promise<MemberSyncActionResult>;
}>) {
  const [result, action, pending] = useActionState(syncAction, initialResult);
  const serverRunning = status.state === "running";

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
              pending ? "Syncing" : serverRunning ? "Sync in progress" : undefined
            }
            className={styles.syncButton}
            disabled={pending || serverRunning}
            type="submit"
          >
            <ArrowsClockwise aria-hidden size={16} weight="bold" />
            {pending ? "Syncing…" : serverRunning ? "Sync in progress" : "Sync now"}
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
          Latest attempt failed: {status.safeErrorMessage}. The last successful data remains available.
        </p>
      ) : null}
    </section>
  );
}
