import { ArrowRight } from "@phosphor-icons/react";
import type { Campaign } from "@/lib/admin-data/types";
import styles from "./overview-screen.module.css";

const currency = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

export function CampaignPerformance({
  campaigns,
  rangeLabel,
}: Readonly<{ campaigns: Campaign[]; rangeLabel: string }>) {
  const totals = campaigns.reduce(
    (sum, campaign) => ({
      conversions: sum.conversions + campaign.conversions,
      revenue: sum.revenue + campaign.revenue,
      visitors: sum.visitors + campaign.visitors,
    }),
    { conversions: 0, revenue: 0, visitors: 0 },
  );

  return (
    <section className={`${styles.panel} ${styles.lowerPanel}`}>
      <header className={styles.panelHeader}>
        <h2>Campaign performance</h2>
        <span>{rangeLabel}</span>
      </header>
      <div className={styles.tableScroller}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Visitors</th>
              <th>Conversions</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>
                  <span className={styles.campaignName}>{campaign.name}</span>
                  <span className={styles.campaignStatus}>{campaign.status}</span>
                </td>
                <td>{campaign.visitors.toLocaleString("en-US")}</td>
                <td>
                  {campaign.conversions}
                  <small className={styles.conversionRate}>
                    {((campaign.conversions / campaign.visitors) * 100).toFixed(1)}%
                  </small>
                </td>
                <td>{currency.format(campaign.revenue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <td>{totals.visitors.toLocaleString("en-US")}</td>
              <td>{totals.conversions}</td>
              <td>{currency.format(totals.revenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <a className={styles.panelFooter} href="/campaigns">
        View all campaigns <ArrowRight aria-hidden size={13} weight="bold" />
      </a>
    </section>
  );
}
