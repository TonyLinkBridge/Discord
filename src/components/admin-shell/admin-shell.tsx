"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CommandBar } from "./command-bar";
import { GlobalSearch } from "./global-search";
import { navItems } from "./nav-items";
import { Sidebar } from "./sidebar";
import styles from "./admin-shell.module.css";

export function AdminShell({ children, title }: Readonly<{ children: React.ReactNode; title?: string }>) {
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const derivedTitle = navItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  )?.label ?? "Overview";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.contentColumn}>
        <CommandBar onSearch={() => setSearchOpen(true)} title={title ?? derivedTitle} />
        <div className={styles.routeContent}>{children}</div>
      </div>
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
