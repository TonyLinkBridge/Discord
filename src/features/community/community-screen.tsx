"use client";

import { Robot, ShieldCheck, SignOut, UsersThree } from "@phosphor-icons/react";

import { DataUnavailable } from "@/components/data-state/data-unavailable";
import type { DiscordCommunityFacts } from "@/lib/member-sync/read-model";

import styles from "./community-screen.module.css";

const factCards = [
  { id: "activeMembers", label: "Active members", Icon: UsersThree },
  { id: "leftMembers", label: "Left members", Icon: SignOut },
  { id: "botMembers", label: "Bots", Icon: Robot },
  { id: "verifiedMembers", label: "Verified members", Icon: ShieldCheck },
] as const;

function formatSnapshotTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function CommunityScreen({
  facts,
}: Readonly<{ facts: DiscordCommunityFacts | null }>) {
  if (!facts) {
    return (
      <main className={styles.screen}>
        <DataUnavailable
          description="Run a successful Discord member sync to show real community facts."
          title="Community data is not connected"
        />
      </main>
    );
  }

  const maximumRole = Math.max(
    1,
    ...facts.roleDistribution.map((role) => role.value),
  );

  return (
    <main className={styles.screen}>
      <p className={styles.integrationNote}>
        <span>Discord data connected · RayName Marketing API pending</span>
        <span aria-hidden> · </span>
        Latest snapshot: {" "}
        <time dateTime={facts.asOf}>{formatSnapshotTime(facts.asOf)} UTC</time>
      </p>

      <section aria-label="Community snapshot" className={styles.factGrid}>
        {factCards.map(({ id, label, Icon }) => (
          <article className={styles.factCard} key={id}>
            <span className={styles.metricIcon}>
              <Icon aria-hidden size={21} weight="duotone" />
            </span>
            <span>{label}</span>
            <strong>{facts[id].toLocaleString("en-US")}</strong>
          </article>
        ))}
      </section>

      <section className={`${styles.panel} ${styles.rolesPanel}`}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Latest Discord snapshot</p>
            <h2>Role distribution</h2>
          </div>
        </header>
        {facts.roleDistribution.length ? (
          <ul className={styles.roleList}>
            {facts.roleDistribution.map((role) => (
              <li key={role.label}>
                <div>
                  <span>{role.label}</span>
                  <strong>{role.value.toLocaleString("en-US")}</strong>
                </div>
                <span aria-hidden className={styles.roleTrack}>
                  <i style={{ width: `${(role.value / maximumRole) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyCopy}>
            No assignable roles were present in the latest snapshot.
          </p>
        )}
      </section>

      <div className={styles.unavailableGrid}>
        <DataUnavailable
          description="Message and channel activity are not collected by the current privacy-minimal Discord sync."
          title="Channel activity unavailable"
        />
        <DataUnavailable
          description="Onboarding completion requires a dedicated onboarding event source."
          title="Onboarding unavailable"
        />
        <DataUnavailable
          description="Paid conversion requires RayName Marketing API data."
          title="Paid conversion unavailable"
        />
      </div>
    </main>
  );
}
