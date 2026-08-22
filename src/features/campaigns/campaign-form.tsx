"use client";

import { LinkSimple, Megaphone } from "@phosphor-icons/react";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { useAdminData } from "@/lib/admin-data/context";
import type { CampaignCreationResult } from "@/lib/admin-data/types";
import { rayNameDestinationError } from "@/lib/tracking";
import styles from "./campaigns-screen.module.css";

const rayNameDestination = z.string().trim().superRefine((value, context) => {
  const message = rayNameDestinationError(value);
  if (message) context.addIssue({ code: "custom", message });
});

const slugify = (value: string) => value
  .normalize("NFKC")
  .trim()
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, "-")
  .replace(/(^-|-$)/g, "");

const campaignSchema = z.object({
  audience: z.string().trim().min(1, "Enter an audience"),
  channel: z.enum(["discord", "email", "community", "partner"]),
  destination: rayNameDestination,
  endDate: z.iso.date("Enter an end date"),
  name: z.string().trim().min(1, "Enter a campaign name").refine(
    (value) => slugify(value).length > 0,
    "Campaign name must include a letter or number",
  ),
  objective: z.string().trim().min(1, "Enter an objective"),
  startDate: z.iso.date("Enter a start date"),
}).refine((input) => input.endDate >= input.startDate, {
  message: "End date cannot be earlier than start date",
  path: ["endDate"],
});

type CampaignField = keyof z.infer<typeof campaignSchema>;
type CampaignErrors = Partial<Record<CampaignField, string>>;

const fieldOrder: readonly CampaignField[] = [
  "name",
  "objective",
  "audience",
  "channel",
  "destination",
  "startDate",
  "endDate",
];

const deriveCampaignStatus = (startDate: string, endDate: string) => {
  const today = new Date().toISOString().slice(0, 10);
  if (today < startDate) return "scheduled";
  if (today > endDate) return "expired";
  return "active";
};

export function CampaignForm({
  onCreated,
}: Readonly<{ onCreated?: (creation: CampaignCreationResult) => void }>) {
  const provider = useAdminData();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<CampaignErrors>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [trackedUrl, setTrackedUrl] = useState("");

  function focusFirstInvalid(nextErrors: CampaignErrors) {
    const firstInvalid = fieldOrder.find((field) => nextErrors[field]);
    if (firstInvalid) {
      const element = formRef.current?.elements.namedItem(firstInvalid);
      if (element instanceof HTMLElement) element.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const result = campaignSchema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      const nextErrors = result.error.issues.reduce<CampaignErrors>((issues, issue) => {
        const field = issue.path[0] as CampaignField | undefined;
        if (field && !issues[field]) issues[field] = issue.message;
        return issues;
      }, {});
      setErrors(nextErrors);
      setStatus("Campaign has validation errors");
      focusFirstInvalid(nextErrors);
      return;
    }

    setErrors({});
    setPending(true);
    setStatus(`Creating ${result.data.name} campaign`);
    try {
      const campaignSlug = slugify(result.data.name);
      const creation = await provider.createCampaignWithTrackedLink(
        {
          ...result.data,
          status: deriveCampaignStatus(result.data.startDate, result.data.endDate),
        },
        {
          campaign: campaignSlug,
          content: "campaign-form",
          destination: result.data.destination,
          medium: result.data.channel === "discord" ? "community" : "campaign",
          source: result.data.channel,
        },
      );
      setTrackedUrl(creation.trackedLink.url);
      setStatus(`${creation.campaign.name} campaign created`);
      onCreated?.(creation);
    } catch {
      setStatus("Unable to create campaign");
    } finally {
      setPending(false);
    }
  }

  const errorSummary = fieldOrder.filter((field) => errors[field]);

  return (
    <section aria-labelledby="campaign-form-title" className={styles.formPanel}>
      <header className={styles.formHeader}>
        <span className={styles.featureIcon}><Megaphone aria-hidden size={20} weight="duotone" /></span>
        <div>
          <h2 id="campaign-form-title">Create campaign</h2>
          <p>Launch an attributed campaign using a RayName-only destination.</p>
        </div>
      </header>

      {errorSummary.length ? (
        <div className={styles.errorSummary} role="alert">
          <strong>Review the campaign details</strong>
          <ul>{errorSummary.map((field) => <li key={field}>{errors[field]}</li>)}</ul>
        </div>
      ) : null}

      <form aria-busy={pending} className={styles.form} onSubmit={handleSubmit} ref={formRef}>
        <div className={styles.fullField}>
          <label htmlFor="campaign-name">Campaign name</label>
          <input aria-describedby={errors.name ? "campaign-name-error" : undefined} aria-invalid={Boolean(errors.name)} disabled={pending} id="campaign-name" name="name" type="text" />
          {errors.name ? <span className={styles.fieldError} id="campaign-name-error">{errors.name}</span> : null}
        </div>
        <label>
          Objective
          <input defaultValue="Drive attributed conversions" disabled={pending} name="objective" type="text" />
        </label>
        <label>
          Audience
          <input defaultValue="RayName customers" disabled={pending} name="audience" type="text" />
        </label>
        <label>
          Channel
          <select defaultValue="" disabled={pending} name="channel">
            <option disabled value="">Select a channel</option>
            <option value="discord">Discord</option>
            <option value="email">Email</option>
            <option value="community">Community</option>
            <option value="partner">Partner</option>
          </select>
        </label>
        <div className={styles.fullField}>
          <label htmlFor="campaign-destination">Destination</label>
          <input aria-describedby={errors.destination ? "campaign-destination-error" : undefined} aria-invalid={Boolean(errors.destination)} disabled={pending} id="campaign-destination" name="destination" placeholder="https://www.rayname.com/domain/search" type="url" />
          {errors.destination ? <span className={styles.fieldError} id="campaign-destination-error">{errors.destination}</span> : null}
        </div>
        <label>
          Start date
          <input aria-invalid={Boolean(errors.startDate)} disabled={pending} name="startDate" type="date" />
        </label>
        <div className={styles.formField}>
          <label htmlFor="campaign-end-date">End date</label>
          <input aria-describedby={errors.endDate ? "campaign-end-date-error" : undefined} aria-invalid={Boolean(errors.endDate)} disabled={pending} id="campaign-end-date" name="endDate" type="date" />
          {errors.endDate ? <span className={styles.fieldError} id="campaign-end-date-error">{errors.endDate}</span> : null}
        </div>
        <button className={styles.primaryButton} disabled={pending} type="submit">
          <Megaphone aria-hidden size={16} weight="bold" /> {pending ? "Creating campaign…" : "Create campaign"}
        </button>
      </form>

      {trackedUrl ? (
        <label className={styles.trackedField}>
          <span><LinkSimple aria-hidden size={15} /> Tracked URL</span>
          <input readOnly type="text" value={trackedUrl} />
        </label>
      ) : null}
      <p aria-live="polite" className={styles.status} role="status">{status}</p>
    </section>
  );
}
