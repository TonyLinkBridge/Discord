"use client";

import { ChartLineUp, LinkSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { Campaign } from "@/lib/admin-data/types";
import { CampaignForm } from "./campaign-form";
import styles from "./campaigns-screen.module.css";

const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

export function CampaignsScreen() {
  const provider = useAdminData();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (active) {
        setCampaigns(state.campaigns);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [provider]);

  return (
    <main className={styles.screen}>
      <CampaignForm onCreated={(campaign) => setCampaigns((items) => [campaign, ...items])} />
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
              <tbody>{campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <th scope="row"><strong>{campaign.name}</strong><small><LinkSimple aria-hidden size={12} /> {new URL(campaign.destination).pathname}</small></th>
                  <td>{statusLabel(campaign.channel)}</td>
                  <td>{campaign.startDate}<br />{campaign.endDate}</td>
                  <td>{campaign.visitors.toLocaleString()}</td>
                  <td>{campaign.verifiedCustomers.toLocaleString()}</td>
                  <td>{campaign.conversions.toLocaleString()}</td>
                  <td>${campaign.revenue.toLocaleString()}</td>
                  <td><span className={`${styles.badge} ${styles[campaign.status] ?? ""}`}>{statusLabel(campaign.status)}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className={styles.loading} role="status">Loading campaigns…</p>}
      </section>
    </main>
  );
}
