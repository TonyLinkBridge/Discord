"use client";

import { ArrowSquareOut, Broadcast, ChartLineUp } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { Campaign, Offer } from "@/lib/admin-data/types";
import { deriveOfferLifecycle, OfferForm } from "./offer-form";
import styles from "./offers-screen.module.css";

const publishingLabel: Record<Offer["status"], string> = {
  active: "Published to Discord",
  draft: "Not published",
  expired: "Publication ended",
  scheduled: "Queued for Discord",
};

export function OffersScreen() {
  const provider = useAdminData();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (active) {
        setOffers(state.offers);
        setCampaigns(state.campaigns);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [provider]);

  const replaceOffer = (updated: Offer) => setOffers((items) => items.map((item) => item.id === updated.id ? updated : item));

  return (
    <main className={styles.screen}>
      {loaded && offers[0] ? <OfferForm offerId={offers[0].id} onUpdated={replaceOffer} /> : <p className={styles.loading} role="status">Loading offer editor…</p>}
      <section aria-labelledby="offer-list-title" className={styles.listPanel}>
        <header className={styles.listHeader}><div><p><ChartLineUp aria-hidden size={14} /> Lifecycle and performance</p><h2 id="offer-list-title">Offers</h2></div><span>{offers.length} offers</span></header>
        <div className={styles.offerGrid}>
          {offers.map((offer) => {
            const campaign = campaigns.find((item) => item.id === offer.campaignId);
            const lifecycle = deriveOfferLifecycle(
              offer.status,
              offer.startsAt.slice(0, 10),
              offer.endsAt.slice(0, 10),
              new Date().toISOString().slice(0, 10),
            );
            return (
              <article className={styles.offerCard} key={offer.id}>
                <header><span className={`${styles.lifecycle} ${styles[lifecycle]}`}>{lifecycle === "active" ? "Live" : lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1)}</span><span><Broadcast aria-hidden size={14} /> {publishingLabel[lifecycle]}</span></header>
                <h3>{offer.title}</h3><p>{offer.description}</p>
                <dl><div><dt>Audience</dt><dd>{offer.audience}</dd></div><div><dt>CTA</dt><dd>{offer.cta}</dd></div><div><dt>Campaign</dt><dd>{campaign?.name ?? offer.campaignId}</dd></div><div><dt>Performance</dt><dd>{campaign ? `${campaign.conversions} conversions · $${campaign.revenue.toLocaleString()}` : "Awaiting attribution"}</dd></div></dl>
                <a href={offer.destination} rel="noreferrer" target="_blank">Open RayName destination <ArrowSquareOut aria-hidden size={14} /></a>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
