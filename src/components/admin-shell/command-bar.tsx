"use client";

import { CalendarBlank, CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { signOut } from "next-auth/react";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { ThemeSelector } from "@/components/theme/theme-selector";
import {
  accessibleReportingRangeLabel,
  reportingRangeOptions,
  useReportingRange,
} from "@/lib/reporting-range";
import styles from "./admin-shell.module.css";
import { useAdminAvailability } from "@/lib/admin-data/context";
import type { AdminActorSummary } from "@/lib/auth";

export function CommandBar({ actor, onSearch, title }: Readonly<{
  actor: AdminActorSummary;
  onSearch: () => void;
  title: string;
}>) {
  const { selectedRange, setSelectedRange } = useReportingRange();
  const availability = useAdminAvailability();
  const analyticsAvailable = availability.capabilities["read-analytics"].available;
  const setupIncomplete = availability.dataMode === "unavailable";
  const actorInitial = actor.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className={styles.commandBar}>
      <h1>{title}</h1>
      <button className={styles.searchTrigger} type="button" onClick={onSearch}>
        <MagnifyingGlass aria-hidden size={18} weight="regular" />
        <span>Search members, domains, leads, campaigns...</span>
        <kbd className={styles.keyHint}>⌘ K</kbd>
      </button>
      <MenuTrigger>
        <Button
          aria-describedby={!analyticsAvailable ? "date-range-unavailable" : undefined}
          aria-label={`Date range: ${accessibleReportingRangeLabel(selectedRange.label)}`}
          className={styles.dateControl}
          isDisabled={!analyticsAvailable}
        >
          <CalendarBlank aria-hidden size={18} weight="regular" />
          <span>{selectedRange.label}</span>
          <CaretDown aria-hidden size={15} />
        </Button>
        <Popover className={styles.rangePopover} placement="bottom end" offset={8}>
          <Menu
            aria-label="Reporting date ranges"
            className={styles.rangeMenu}
            onAction={(key) => {
              const option = reportingRangeOptions.find((item) => item.id === key);
              if (option) setSelectedRange(option);
            }}
            selectedKeys={[selectedRange.id]}
            selectionMode="single"
          >
            {reportingRangeOptions.map((option) => (
              <MenuItem id={option.id} key={option.id}>{option.label}</MenuItem>
            ))}
          </Menu>
        </Popover>
      </MenuTrigger>
      {!analyticsAvailable && (
        <span className={styles.visuallyHidden} id="date-range-unavailable">
          Connect a reporting data source to choose a date range
        </span>
      )}
      <span className={setupIncomplete ? styles.systemStatus : `${styles.systemStatus} ${styles.systemStatusLive}`}>
        <i aria-hidden />{setupIncomplete ? "Setup incomplete" : "Live data connected"}
      </span>
      <ThemeSelector />
      <MenuTrigger>
        <Button className={styles.commandOperator} aria-label="Operator menu">
          <span className={styles.avatar} aria-hidden>{actorInitial}</span>
          <span className={styles.commandOperatorName}>{actor.name}</span>
          <CaretDown aria-hidden size={14} />
        </Button>
        <Popover className={styles.operatorPopover} placement="bottom end" offset={8}>
          <Menu
            aria-label="Operator menu"
            className={styles.operatorMenu}
            onAction={(key) => {
              if (key === "sign-out") void signOut({ callbackUrl: "/sign-in" });
            }}
          >
            <MenuItem id="sign-out">Sign out</MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
    </header>
  );
}
