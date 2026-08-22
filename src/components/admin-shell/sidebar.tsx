"use client";

import { Buildings, CaretDown, CheckCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./nav-items";
import { useAdminData } from "@/lib/admin-data/context";
import styles from "./admin-shell.module.css";

export function Sidebar() {
  const provider = useAdminData();
  const pathname = usePathname() ?? "/";
  const [workspace, setWorkspace] = useState("RayName");

  useEffect(() => {
    void provider.getWorkspaceSettings().then((settings) => setWorkspace(settings.workspace.name));
  }, [provider]);

  return (
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/" aria-label="RayName Admin home">
        <span className={styles.brandMark} aria-hidden>
          R
        </span>
        <span className={styles.brandName}>RayName <strong>Admin</strong></span>
      </Link>

      <nav className={styles.navigation} aria-label="Primary">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
              href={href}
              key={href}
              title={label}
            >
              <Icon aria-hidden size={21} weight="regular" />
              <span className={styles.navLabel}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.workspace} aria-label={`Workspace: ${workspace}`} title={workspace}>
        <Buildings aria-hidden size={17} weight="regular" />
        <span className={styles.workspaceName}>{workspace}</span>
      </div>

      <div className={styles.sidebarFooter}>
        <div
          aria-label="System status: All systems operational"
          className={styles.healthCard}
          role="status"
          title="All systems operational"
        >
          <span className={styles.healthStatus}><CheckCircle aria-hidden size={14} weight="fill" /> All systems operational</span>
          <span className={styles.railOnly} aria-hidden><CheckCircle size={18} weight="fill" /></span>
          <div className={styles.healthDetails}>
            <span>RayName Time (UTC)</span>
            <strong>Aug 22, 2026</strong>
          </div>
        </div>
        <button className={styles.operator} type="button" aria-label="Operator menu">
          <span className={styles.avatar} aria-hidden>R</span>
          <span className={styles.operatorDetails}><strong>Ray</strong><small>Operator</small></span>
          <CaretDown aria-hidden className={styles.operatorCaret} size={14} />
        </button>
      </div>
    </aside>
  );
}
