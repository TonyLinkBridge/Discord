"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { SearchResult } from "@/lib/admin-data/types";
import styles from "./admin-shell.module.css";

const searchGroups: SearchResult["type"][] = ["Member", "Lead", "Domain", "Campaign"];

export function GlobalSearch({ onClose }: Readonly<{ onClose: () => void }>) {
  const provider = useAdminData();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [displayResults, setDisplayResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
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

  return (
    <div className={styles.searchBackdrop} onMouseDown={onClose}>
      <section
        aria-label="Global search"
        className={styles.searchDialog}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
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
                  <a
                    aria-selected={active}
                    className={active ? `${styles.result} ${styles.resultActive}` : styles.result}
                    href={result.href}
                    id={`search-result-${result.type}-${result.id}`}
                    key={`${result.type}-${result.id}`}
                    role="option"
                  >
                    <span><strong>{result.primary}</strong><small>{result.secondary}</small></span>
                    <em>{result.type}</em>
                  </a>
                );
              })}
            </div>
          ))}
          {query && !visibleResults.length && <p className={styles.emptyResults}>No matching records</p>}
          {!query && <p className={styles.emptyResults}>Search RayName admin records</p>}
        </div>
      </section>
    </div>
  );
}
