"use client";

import {
  CheckCircle,
  ClockCounterClockwise,
  LinkSimple,
  PlugsConnected,
  Robot,
  UserCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { SystemHealth } from "@/lib/admin-data/types";
import styles from "./bot-automations-screen.module.css";

const apiAutomationLabels = [
  "Enable /price",
  "Enable /search",
  "Enable /verify",
  "Enable renewal events",
] as const;

const serviceStatusLabel = (status: SystemHealth["services"][number]["status"]) =>
  status === "operational" ? "Healthy" : status === "degraded" ? "Degraded" : "Awaiting access";

export function BotAutomationsScreen() {
  const provider = useAdminData();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [pending, setPending] = useState<"tracking" | "verification" | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    provider.getSystemHealth().then((snapshot) => {
      if (active) setHealth(snapshot);
    });
    return () => { active = false; };
  }, [provider]);

  async function createTrackedLink() {
    if (pending) return;
    setPending("tracking");
    setStatus("Creating tracked link");
    try {
      await provider.createTrackedLink({
        campaign: "bot-operations",
        content: "manual-operations",
        destination: "https://www.rayname.com/domain/search",
        medium: "community",
        source: "discord",
      }, "local-ray");
      setStatus("Tracked link created");
    } catch {
      setStatus("Unable to create tracked link");
    } finally {
      setPending(null);
    }
  }

  async function verifyCustomer() {
    if (pending) return;
    setPending("verification");
    setStatus("Verifying DomainNomad");
    try {
      const member = await provider.getMember("domainnomad");
      const roles = member.roles.includes("Verified") ? member.roles : [...member.roles, "Verified"];
      await provider.updateMember("domainnomad", {
        customerStatus: "Verified customer",
        roles,
        verified: true,
      }, "local-ray");
      setStatus("DomainNomad verified manually");
    } catch {
      setStatus("Unable to verify DomainNomad");
    } finally {
      setPending(null);
    }
  }

  if (!health) return <p className={styles.loading} role="status">Loading system health…</p>;

  const apiPending = health.services.some(
    (service) => service.id === "rayname-api" && service.status === "awaiting-access",
  );

  return (
    <main className={styles.screen}>
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Live provider state</p>
            <h2>Connection health</h2>
          </div>
          <span className={styles.summary}><PlugsConnected aria-hidden size={17} />4 services</span>
        </header>
        <ul className={styles.serviceGrid}>
          {health.services.map((service) => {
            const StatusIcon = service.status === "operational" ? CheckCircle : WarningCircle;
            return (
              <li data-status={service.status} key={service.id}>
                <StatusIcon aria-hidden size={21} weight="duotone" />
                <div>
                  <strong>{service.label}</strong>
                  {service.detail !== serviceStatusLabel(service.status) ? <span>{service.detail}</span> : null}
                </div>
                <span className={service.status === "operational" ? styles.healthy : styles.awaiting}>
                  {serviceStatusLabel(service.status)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`${styles.panel} ${styles.automationPanel}`}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Marketing API automations</p>
            <h2>Bot commands &amp; events</h2>
          </div>
          <Robot aria-hidden className={styles.headerIcon} size={22} weight="duotone" />
        </header>
        {apiPending ? (
          <p className={styles.notice}>
            <WarningCircle aria-hidden size={18} weight="fill" />
            RayName Marketing API access is pending. API-dependent commands remain off until a server-side adapter is connected.
          </p>
        ) : null}
        <div className={styles.automationGrid}>
          {apiAutomationLabels.map((label) => (
            <button disabled={apiPending} key={label} type="button">{label}</button>
          ))}
        </div>
      </section>

      <section className={`${styles.panel} ${styles.manualPanel}`}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Available without API access</p>
            <h2>Manual operations</h2>
          </div>
        </header>
        <p className={styles.supportingCopy}>
          Tracked attribution and operator-recorded verification stay available through the admin data provider.
        </p>
        <p className={styles.queueTarget}><strong>Next verification: DomainNomad</strong></p>
        <div className={styles.manualActions}>
          <button disabled={pending !== null} onClick={createTrackedLink} type="button">
            <LinkSimple aria-hidden size={16} />Create tracked link
          </button>
          <button disabled={pending !== null} onClick={verifyCustomer} type="button">
            <UserCheck aria-hidden size={16} />Verify customer manually
          </button>
        </div>
        <p aria-live="polite" className={styles.operationStatus} role="status">{status}</p>
      </section>

      <section className={`${styles.panel} ${styles.activityPanel}`}>
        <header className={styles.panelHeader}><h2>Operational activity</h2></header>
        <div className={styles.activityGrid}>
          <article>
            <h3><Robot aria-hidden size={16} />Recent commands</h3>
            <ul>{health.recentCommands.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article>
            <h3><ClockCounterClockwise aria-hidden size={16} />Scheduled jobs</h3>
            <ul>{health.scheduledJobs.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article>
            <h3><WarningCircle aria-hidden size={16} />Failures</h3>
            {health.failures.length ? <ul>{health.failures.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No recent failures</p>}
          </article>
          <article>
            <h3><CheckCircle aria-hidden size={16} />Renewal reminders</h3>
            <ul>{health.renewalReminderRuns.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </div>
      </section>
    </main>
  );
}
