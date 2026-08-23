"use client";

import { ChartLineUp, LinkSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { Campaign, TrackedLink } from "@/lib/admin-data/types";
import { CampaignForm } from "./campaign-form";
import styles from "./campaigns-screen.module.css";

const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

export function CampaignsScreen({ initialSelectedCampaignId = null }: Readonly<{
  initialSelectedCampaignId?: string | null;
}>) {
  const provider = useAdminData();
  const router = useRouter();
  const selectedCampaignRef = useRef<HTMLTableRowElement>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [trackedLinks, setTrackedLinks] = useState<TrackedLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [previousInitialSelectedId, setPreviousInitialSelectedId] = useState(initialSelectedCampaignId);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialSelectedCampaignId);

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (active) {
        setCampaigns(state.campaigns);
        setTrackedLinks(state.trackedLinks);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [provider]);

  if (previousInitialSelectedId !== initialSelectedCampaignId) {
    setPreviousInitialSelectedId(initialSelectedCampaignId);
    if (initialSelectedCampaignId) setSelectedCampaignId(initialSelectedCampaignId);
  }

  useEffect(() => {
    if (!loaded || !initialSelectedCampaignId) return;
    selectedCampaignRef.current?.focus();
    router.replace("/campaigns", { scroll: false });
  }, [initialSelectedCampaignId, loaded, router]);

  return (
    <main className={styles.screen}>
      <CampaignForm onCreated={({ campaign, trackedLink }) => {
        setCampaigns((items) => [campaign, ...items]);
        setTrackedLinks((items) => [trackedLink, ...items]);
      }} />
      <section aria-labelledby="campaign-list-title" className={styles.listPanel}>
        <header className={styles.listHeader}>
          <div>
            <p><ChartLineUp aria-hidden size={14} /> Attribution performance</p>
            <h2 id="campaign-list-title">Campaigns</h2>
          </div>
          <span>{loaded ? `${campaigns.length} campaigns` : "Loading campaigns…"}</span>
        </header>
        {loaded ? (
          <div className={styles.tableScroll}>
            <table>
              <caption className={styles.visuallyHidden}>Campaign management and attribution</caption>
              <thead><tr><th scope="col">Campaign</th><th scope="col">Channel</th><th scope="col">Dates</th><th scope="col">Clicks</th><th scope="col">Verified</th><th scope="col">Conversions</th><th scope="col">Revenue</th><th scope="col">Status</th></tr></thead>
              <tbody>{campaigns.length === 0 ? (
                <tr><td className={styles.emptyRow} colSpan={8}>No campaigns yet</td></tr>
              ) : campaigns.map((campaign) => {
                const trackedLink = trackedLinks.find((link) => link.id === campaign.trackedLinkId);
                return (
                <tr
                  aria-current={campaign.id === selectedCampaignId ? "true" : undefined}
                  className={campaign.id === selectedCampaignId ? styles.selectedCampaign : undefined}
                  key={campaign.id}
                  ref={campaign.id === selectedCampaignId ? selectedCampaignRef : undefined}
                  tabIndex={campaign.id === selectedCampaignId ? -1 : undefined}
                >
                  <th scope="row">
                    <strong>{campaign.name}</strong>
                    <small>
                      <LinkSimple aria-hidden size={12} /> {new URL(campaign.destination).pathname}
                      {trackedLink ? (
                        <a
                          aria-label={`Tracked URL for ${campaign.name}`}
                          href={trackedLink.url}
                        >
                          Tracked URL
                        </a>
                      ) : null}
                    </small>
                  </th>
                  <td>{statusLabel(campaign.channel)}</td>
                  <td>{campaign.startDate}<br />{campaign.endDate}</td>
                  <td>{campaign.visitors.toLocaleString()}</td>
                  <td>{campaign.verifiedCustomers.toLocaleString()}</td>
                  <td>{campaign.conversions.toLocaleString()}</td>
                  <td>${campaign.revenue.toLocaleString()}</td>
                  <td><span className={`${styles.badge} ${styles[campaign.status] ?? ""}`}>{statusLabel(campaign.status)}</span></td>
                </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <p className={styles.loading} role="status">Loading campaigns…</p>}
      </section>
    </main>
  );
}
