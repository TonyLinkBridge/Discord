"use client";

import { useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { ContentEntry } from "@/lib/admin-data/types";
import { ContentCalendar } from "./content-calendar";
import { ContentEditor } from "./content-editor";
import styles from "./content-screen.module.css";

export function ContentScreen() {
  const provider = useAdminData();
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [loadingState, setLoadingState] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (active) {
        setEntries(state.content);
        setLoadingState("loaded");
      }
    }).catch(() => {
      if (active) setLoadingState("error");
    });
    return () => { active = false; };
  }, [provider]);

  async function refreshEntries() {
    const state = await provider.getState();
    setEntries(state.content);
  }

  if (loadingState === "loading") {
    return <p className={styles.loading} role="status">Loading content operations…</p>;
  }

  if (loadingState === "error" || !entries[0]) {
    return <p className={styles.loadError} role="alert">Unable to load the content calendar.</p>;
  }

  return (
    <main className={styles.screen}>
      <ContentEditor onUpdated={refreshEntries} showSavedPreview={false} />
      <ContentCalendar entries={entries} />
    </main>
  );
}
