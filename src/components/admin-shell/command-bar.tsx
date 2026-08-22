"use client";

import { Bell, CalendarBlank, CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { ThemeSelector } from "@/components/theme/theme-selector";
import styles from "./admin-shell.module.css";

export function CommandBar({ onSearch, title }: Readonly<{ onSearch: () => void; title: string }>) {
  return (
    <header className={styles.commandBar}>
      <h1>{title}</h1>
      <button className={styles.searchTrigger} type="button" onClick={onSearch}>
        <MagnifyingGlass aria-hidden size={18} weight="regular" />
        <span>Search members, domains, leads, campaigns...</span>
        <kbd className={styles.keyHint}>⌘ K</kbd>
      </button>
      <button className={styles.dateControl} type="button" aria-label="Date range: Aug 16 to 22, 2026">
        <CalendarBlank aria-hidden size={18} weight="regular" />
        <span>Aug 16–22, 2026</span>
        <CaretDown aria-hidden size={15} />
      </button>
      <span className={styles.systemStatus}><i aria-hidden />All systems operational</span>
      <ThemeSelector />
      <button className={styles.iconButton} type="button" aria-label="Notifications">
        <Bell aria-hidden size={21} weight="regular" />
        <span className={styles.notificationCount}>7</span>
      </button>
      <MenuTrigger>
        <Button className={styles.commandOperator} aria-label="Operator menu">
          <span className={styles.avatar} aria-hidden>R</span>
          <span className={styles.commandOperatorName}>Ray</span>
          <CaretDown aria-hidden size={14} />
        </Button>
        <Popover className={styles.operatorPopover} placement="bottom end" offset={8}>
          <Menu aria-label="Operator menu" className={styles.operatorMenu}>
            <MenuItem id="account">Account settings</MenuItem>
            <MenuItem id="sign-out">Sign out</MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
    </header>
  );
}
