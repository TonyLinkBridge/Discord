"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { SearchResult } from "@/lib/admin-data/types";
import styles from "./admin-shell.module.css";

const searchGroups: SearchResult["type"][] = ["Member", "Lead", "Domain", "Campaign"];
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function GlobalSearch({ onClose }: Readonly<{ onClose: () => void }>) {
  const provider = useAdminData();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [displayResults, setDisplayResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const resultRefs = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog?.setAttribute("open", "");
    }
    inputRef.current?.focus();

    return () => {
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
      openerRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      return;
    }

    let cancelled = false;
    let displayTimer: ReturnType<typeof setTimeout> | undefined;

    void provider.search(query).then((results) => {
      displayTimer = setTimeout(() => {
        if (!cancelled) {
          setDisplayResults(results);
          setActiveIndex(0);
        }
      }, 100);
    });

    return () => {
      cancelled = true;
      if (displayTimer) {
        clearTimeout(displayTimer);
      }
    };
  }, [provider, query]);

  const visibleResults = query.trim() ? displayResults : [];

  const groupedResults = searchGroups.map(
    (type) => [type, visibleResults.filter((result) => result.type === type)] as const,
  );

  const moveActiveResult = (direction: 1 | -1) => {
    setActiveIndex((current) => {
      if (!visibleResults.length) {
        return 0;
      }
      return (current + direction + visibleResults.length) % visibleResults.length;
    });
  };

  const activateCurrentResult = () => {
    const result = visibleResults[activeIndex];
    if (result) resultRefs.current.get(`${result.type}-${result.id}`)?.click();
  };

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;

    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      aria-label="Global search"
      className={styles.searchBackdrop}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleDialogKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
    >
      <section
        className={styles.searchDialog}
      >
        <label className={styles.searchInput} htmlFor={inputId}>
          <MagnifyingGlass aria-hidden size={19} />
          <input
            aria-activedescendant={visibleResults[activeIndex] ? `search-result-${visibleResults[activeIndex].type}-${visibleResults[activeIndex].id}` : undefined}
            aria-controls="global-search-results"
            aria-label="Search members, domains, leads, campaigns"
            autoComplete="off"
            id={inputId}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActiveResult(1);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActiveResult(-1);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                activateCurrentResult();
              }
              if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search members, domains, leads, campaigns..."
            ref={inputRef}
            role="searchbox"
            value={query}
          />
          <kbd className={styles.keyHint}>Esc</kbd>
        </label>
        <div className={styles.results} id="global-search-results" role="listbox" aria-label="Search results">
          {groupedResults.map(([type, results]) => results.length > 0 && (
            <div className={styles.resultGroup} key={type} role="group" aria-label={type}>
              <p>{type}s</p>
              {results.map((result) => {
                const resultIndex = displayResults.indexOf(result);
                const active = resultIndex === activeIndex;
                return (
                  <Link
                    aria-selected={active}
                    className={active ? `${styles.result} ${styles.resultActive}` : styles.result}
                    href={result.href}
                    id={`search-result-${result.type}-${result.id}`}
                    key={`${result.type}-${result.id}`}
                    onClick={onClose}
                    ref={(node) => {
                      const key = `${result.type}-${result.id}`;
                      if (node) resultRefs.current.set(key, node);
                      else resultRefs.current.delete(key);
                    }}
                    role="option"
                  >
                    <span><strong>{result.primary}</strong><small>{result.secondary}</small></span>
                    <em>{result.type}</em>
                  </Link>
                );
              })}
            </div>
          ))}
          {query && !visibleResults.length && <p className={styles.emptyResults}>No matching records</p>}
          {!query && <p className={styles.emptyResults}>Search RayName admin records</p>}
        </div>
      </section>
    </dialog>
  );
}
