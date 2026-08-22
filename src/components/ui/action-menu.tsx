"use client";

import { CaretDown, DotsThree } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./action-menu.module.css";

export type ActionMenuItem = {
  label: string;
  onSelect: () => void | Promise<void>;
};

export function ActionMenu({
  buttonLabel,
  compact = false,
  items,
}: Readonly<{
  buttonLabel: string;
  compact?: boolean;
  items: readonly ActionMenuItem[];
}>) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);

  async function select(item: ActionMenuItem) {
    await item.onSelect();
    setOpen(false);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const menuItems = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const activeIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? menuItems.length - 1 : null;
    const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (nextIndex === null && direction === 0) return;

    event.preventDefault();
    menuItems[nextIndex ?? (activeIndex + direction + menuItems.length) % menuItems.length]?.focus();
  }

  return (
    <div className={styles.menuRoot}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={buttonLabel}
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") setOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        {compact ? <DotsThree aria-hidden size={17} weight="bold" /> : <><span>{buttonLabel.split(" ")[0]}</span><CaretDown aria-hidden size={12} weight="bold" /></>}
      </button>
      {open ? (
        <div aria-label={`${buttonLabel} actions`} className={styles.menu} id={menuId} onKeyDown={handleMenuKeyDown} ref={menuRef} role="menu">
          {items.map((item) => (
            <button
              className={styles.menuItem}
              key={item.label}
              onClick={() => void select(item)}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
