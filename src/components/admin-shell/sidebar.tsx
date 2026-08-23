"use client";

import { Buildings, WarningCircle } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import rayNameMark from "../../../assets/brand/rayname-server-icon.png";
import { navItems } from "./nav-items";
import { useAdminAvailability, useAdminData } from "@/lib/admin-data/context";
import styles from "./admin-shell.module.css";

export function Sidebar() {
  const provider = useAdminData();
  const availability = useAdminAvailability();
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

      <div
        aria-label={`Workspace: ${workspace}`}
        className={styles.workspace}
        role="group"
        title={workspace}
      >
        <Buildings aria-hidden size={17} weight="regular" />
        <span className={styles.workspaceName}>{workspace}</span>
      </div>

      <div className={styles.sidebarFooter}>
        <div
          aria-label={availability.dataMode === "unavailable" ? "Setup incomplete" : "Live data connected"}
          className={styles.healthCard}
          role="status"
          title={availability.dataMode === "unavailable" ? "Live integrations pending" : "Live data connected"}
        >
          <span className={styles.healthStatus}><WarningCircle aria-hidden size={14} weight="fill" /> {availability.dataMode === "unavailable" ? "Setup incomplete" : "Live data connected"}</span>
          <span className={styles.railOnly} aria-hidden><WarningCircle size={18} weight="fill" /></span>
          <div className={styles.healthDetails}>
            <span>Data status</span>
            <strong>{availability.dataMode === "unavailable" ? "Live integrations pending" : "Connected"}</strong>
          </div>
        </div>
      </div>
    </aside>
  );
}
