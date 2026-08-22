"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { useTheme } from "next-themes";
import type { ThemeMode } from "@/lib/admin-data/types";
import styles from "./theme-selector.module.css";

const themeModes: ThemeMode[] = ["system", "light", "dark"];

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value !== undefined && themeModes.includes(value as ThemeMode);
}

export function ThemeSelector() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const selectedTheme = isThemeMode(theme) ? theme : "system";

  return (
    <MenuTrigger>
      <Button className={styles.trigger} aria-label="Theme settings">
        {resolvedTheme === "dark" ? <Moon aria-hidden size={18} /> : <Sun aria-hidden size={18} />}
      </Button>
      <Popover className={styles.popover} placement="bottom end" offset={8}>
        <Menu
          aria-label="Theme"
          className={styles.menu}
          selectedKeys={[selectedTheme]}
          selectionMode="single"
        >
          <MenuItem className={styles.item} id="system" onAction={() => setTheme("system")}>
            <Desktop aria-hidden size={16} />
            <span>System</span>
          </MenuItem>
          <MenuItem className={styles.item} id="light" onAction={() => setTheme("light")}>
            <Sun aria-hidden size={16} />
            <span>Light</span>
          </MenuItem>
          <MenuItem className={styles.item} id="dark" onAction={() => setTheme("dark")}>
            <Moon aria-hidden size={16} />
            <span>Dark</span>
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
