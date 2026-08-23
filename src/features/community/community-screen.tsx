"use client";

import { ArrowSquareOut, CheckCircle, TrendUp, UsersThree } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { CommunitySnapshot } from "@/lib/admin-data/types";
import styles from "./community-screen.module.css";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

export function CommunityScreen() {
  const provider = useAdminData();
  const [community, setCommunity] = useState<CommunitySnapshot | null>(null);

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (active) setCommunity(state.community);
    });
    return () => { active = false; };
  }, [provider]);

  if (!community) return <p className={styles.loading} role="status">Loading community…</p>;

  if (
    community.memberGrowth.length === 0
    && community.roleDistribution.length === 0
    && community.channelActivity.length === 0
  ) {
    return (
      <main className={styles.screen}>
        <section className={`${styles.panel} ${styles.emptyState}`}>
          <h2>No community activity yet</h2>
          <p>The community connection is ready. Real activity will appear here after Discord sync returns records.</p>
        </section>
      </main>
    );
  }

  const newest = community.memberGrowth.at(-1);
  const maximumMembers = Math.max(...community.memberGrowth.map((point) => point.totalMembers));
  const maximumRole = Math.max(...community.roleDistribution.map((role) => role.value));
  const customerConversion = newest
    ? (community.conversion.paidCustomers / newest.totalMembers) * 100
    : 0;

  return (
    <main className={styles.screen}>
      <section className={`${styles.panel} ${styles.growthPanel}`}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Community health</p>
            <h2>Member growth</h2>
          </div>
          {newest ? (
            <span className={styles.total}>
              <UsersThree aria-hidden size={17} weight="duotone" />
              {newest.totalMembers.toLocaleString()} members
            </span>
          ) : null}
        </header>
        <div aria-label="Member growth chart" className={styles.growthChart} role="img">
          {community.memberGrowth.map((point) => (
            <div className={styles.growthColumn} key={point.date}>
              <div className={styles.growthBars}>
                <span
                  className={styles.totalBar}
                  style={{ height: `${(point.totalMembers / maximumMembers) * 100}%` }}
                  title={`${point.totalMembers} total members`}
                />
                <span
                  className={styles.activeBar}
                  style={{ height: `${(point.activeMembers / maximumMembers) * 100}%` }}
                  title={`${point.activeMembers} active members`}
                />
              </div>
              <span>{dateLabel(point.date)}</span>
            </div>
          ))}
        </div>
        <div className={styles.legend}>
          <span><i className={styles.totalKey} />Total members</span>
          <span><i className={styles.activeKey} />Active members</span>
        </div>
        <table className={styles.visuallyHidden}>
          <caption>Member growth data</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Total members</th><th scope="col">Active members</th></tr></thead>
          <tbody>
            {community.memberGrowth.map((point) => (
              <tr key={point.date}>
                <th scope="row">{dateLabel(point.date)}</th>
                <td>{point.totalMembers}</td>
                <td>{point.activeMembers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${styles.panel} ${styles.rolesPanel}`}>
        <header className={styles.panelHeader}><h2>Role distribution</h2></header>
        <ul className={styles.roleList}>
          {community.roleDistribution.map((role) => (
            <li key={role.label}>
              <div><span>{role.label}</span><strong>{role.value.toLocaleString()}</strong></div>
              <span aria-hidden className={styles.roleTrack}>
                <i style={{ width: `${(role.value / maximumRole) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.panel} ${styles.activityPanel}`}>
        <header className={styles.panelHeader}><h2>Channel activity</h2></header>
        <ul className={styles.channelList}>
          {community.channelActivity.map((item) => (
            <li key={item.channel}>
              <div><strong>{item.channel}</strong><span>{item.activeMembers} active members</span></div>
              <span>{item.messages.toLocaleString()} messages</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Community conversion" className={`${styles.panel} ${styles.conversionPanel}`}>
        <article>
          <span className={styles.metricIcon}><CheckCircle aria-hidden size={20} weight="duotone" /></span>
          <div>
            <strong>{community.onboarding.completionRate}% onboarding completion</strong>
            <span>{community.onboarding.completed} of {community.onboarding.started} new members completed onboarding</span>
          </div>
        </article>
        <article>
          <span className={styles.metricIcon}><TrendUp aria-hidden size={20} weight="duotone" /></span>
          <div>
            <strong>{customerConversion.toFixed(1)}% community-to-customer conversion</strong>
            <span>{community.conversion.paidCustomers} paid customers from {newest?.totalMembers.toLocaleString() ?? 0} members</span>
          </div>
        </article>
        <nav aria-label="Community shortcuts" className={styles.shortcuts}>
          <a href={community.discordServerUrl} rel="noreferrer" target="_blank">
            Open Discord <ArrowSquareOut aria-hidden size={14} weight="bold" />
          </a>
          <a href="/members">View members</a>
        </nav>
      </section>
    </main>
  );
}
