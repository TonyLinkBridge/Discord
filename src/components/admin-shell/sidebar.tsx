"use client";

import { Buildings, CheckCircle } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import rayNameMark from "../../../assets/brand/rayname-server-icon.png";
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
        <Image
          alt="RayName mark"
          className={styles.brandMark}
          height={27}
          src={rayNameMark}
          width={27}
        />
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
      </div>
    </aside>
  );
}
