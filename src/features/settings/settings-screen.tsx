"use client";

import {
  Bell,
  CheckCircle,
  ClockCounterClockwise,
  DiscordLogo,
  LinkSimple,
  Palette,
  PlugsConnected,
  ShieldCheck,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { useAdminData } from "@/lib/admin-data/context";
import type { WorkspaceSettings } from "@/lib/admin-data/types";
import styles from "./settings-screen.module.css";

const sentenceCase = (value: string) => `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;

export function SettingsScreen() {
  const provider = useAdminData();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    provider.getWorkspaceSettings()
      .then((snapshot) => {
        if (active) setSettings(snapshot);
      })
      .catch(() => {
        if (active) setLoadError("Unable to load workspace settings");
      });
    return () => { active = false; };
  }, [provider]);

  if (loadError) return <p className={styles.loading} role="alert">{loadError}</p>;
  if (!settings) return <p className={styles.loading} role="status">Loading settings…</p>;

  return (
    <main className={styles.screen}>
      <section className={`${styles.panel} ${styles.connectionsPanel}`}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Server-side connections</p>
            <h2><PlugsConnected aria-hidden size={19} />Connection states</h2>
          </div>
          <span className={styles.securityNote}><ShieldCheck aria-hidden size={16} />Secret values stay hidden</span>
        </header>
        <div className={styles.connectionGrid}>
          <article>
            <span className={styles.connectionIcon}><DiscordLogo aria-hidden size={23} weight="duotone" /></span>
            <div>
              <h3>Discord OAuth</h3>
              <p>{settings.discord.serverName} server</p>
            </div>
            <span className={settings.discord.configured ? styles.configured : styles.notConfigured}>
              {settings.discord.configured ? "Configured" : "Not configured"}
            </span>
          </article>
          <article>
            <span className={styles.connectionIcon}><PlugsConnected aria-hidden size={23} weight="duotone" /></span>
            <div>
              <h3>RayName Marketing API</h3>
              <p>Future customer and renewal adapter</p>
            </div>
            <span className={settings.rayNameApi.status === "configured" ? styles.configured : styles.awaiting}>
              {settings.rayNameApi.status === "configured" ? "Connected" : "Awaiting access"}
            </span>
          </article>
        </div>
        <p className={styles.connectionHelp}>
          Credentials are managed in the deployment environment. This console reports connection state only and never renders credential values.
        </p>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}><h2>Workspace profile</h2></header>
        <dl className={styles.definitionList}>
          <div><dt>Name</dt><dd>{settings.workspace.name}</dd></div>
          <div><dt>Timezone</dt><dd>{settings.workspace.timezone}</dd></div>
        </dl>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}><h2><UsersThree aria-hidden size={18} />Operator access</h2></header>
        <div className={styles.settingSummary}>
          <strong>{settings.operatorAllowlist.length} operator configured</strong>
          <span>Allowlist identities are retained by the provider and are not displayed on this screen.</span>
        </div>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}><h2><LinkSimple aria-hidden size={18} />Tracking defaults</h2></header>
        <dl className={styles.definitionList}>
          <div><dt>Source</dt><dd>{settings.trackingDefaults.source}</dd></div>
          <div><dt>Medium</dt><dd>{settings.trackingDefaults.medium}</dd></div>
        </dl>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}><h2><Bell aria-hidden size={18} />Notifications</h2></header>
        <ul className={styles.preferenceList}>
          <li>
            {settings.notifications.dailySummary ? <CheckCircle aria-hidden size={17} /> : <XCircle aria-hidden size={17} />}
            <span><strong>Daily summary</strong><small>{settings.notifications.dailySummary ? "Enabled" : "Disabled"}</small></span>
          </li>
          <li>
            {settings.notifications.failedJobs ? <CheckCircle aria-hidden size={17} /> : <XCircle aria-hidden size={17} />}
            <span><strong>Failed jobs</strong><small>{settings.notifications.failedJobs ? "Enabled" : "Disabled"}</small></span>
          </li>
        </ul>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}><h2><ClockCounterClockwise aria-hidden size={18} />Data retention</h2></header>
        <div className={styles.settingSummary}>
          <strong>{settings.dataRetentionDays} days</strong>
          <span>Operational activity is retained according to the provider policy.</span>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.themePanel}`}>
        <header className={styles.panelHeader}><h2><Palette aria-hidden size={18} />Theme preference</h2></header>
        <div className={styles.themeSetting}>
          <div>
            <strong>{sentenceCase(settings.theme)} default</strong>
            <span>Use the theme control to change the current browser preference.</span>
          </div>
          <ThemeSelector />
        </div>
      </section>
    </main>
  );
}
