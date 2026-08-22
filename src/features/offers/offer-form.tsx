"use client";

import { CalendarBlank, FloppyDisk, Tag } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { useAdminData } from "@/lib/admin-data/context";
import type { Offer } from "@/lib/admin-data/types";
import styles from "./offers-screen.module.css";

const offerStatuses = ["draft", "scheduled", "active", "expired"] as const;

const rayNameDestination = z.string().trim().url("Enter a valid destination URL").refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "rayname.com" || url.hostname.endsWith(".rayname.com"));
  } catch {
    return false;
  }
}, "Use an HTTPS RayName destination");

const offerSchema = z.object({
  audience: z.string().trim().min(1, "Enter an eligible audience"),
  campaignId: z.string().trim().min(1, "Associate a campaign"),
  cta: z.string().trim().min(1, "Enter a CTA label"),
  description: z.string().trim().min(1, "Enter a short description"),
  destination: rayNameDestination,
  endDate: z.iso.date("Enter an end date"),
  startDate: z.iso.date("Enter a start date"),
  status: z.enum(offerStatuses),
  title: z.string().trim().min(1, "Enter an offer title"),
}).refine((input) => input.endDate >= input.startDate, {
  message: "End date cannot be earlier than start date",
  path: ["endDate"],
});

type OfferFormValues = z.infer<typeof offerSchema>;
type OfferField = keyof OfferFormValues;
type OfferErrors = Partial<Record<OfferField, string>>;

const emptyOffer: OfferFormValues = {
  audience: "",
  campaignId: "",
  cta: "",
  description: "",
  destination: "",
  endDate: "2026-08-24",
  startDate: "2026-08-17",
  status: "draft",
  title: "",
};

const fieldOrder: readonly OfferField[] = [
  "title", "description", "audience", "destination", "startDate", "endDate", "cta", "campaignId", "status",
];

const lifecycleLabels: Record<Offer["status"], string> = {
  active: "Live",
  draft: "Draft",
  expired: "Expired",
  scheduled: "Scheduled",
};

function dateRangeLabel(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "Validity dates pending";
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startYear === endYear && start.getUTCMonth() === end.getUTCMonth()) {
    return `${month.format(start)} ${start.getUTCDate()}–${end.getUTCDate()}, ${endYear}`;
  }
  const startLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC", year: startYear === endYear ? undefined : "numeric" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }).format(end);
  return `${startLabel}–${endLabel}`;
}

export function OfferForm({
  offerId,
  onUpdated,
}: Readonly<{ offerId: string; onUpdated?: (offer: Offer) => void }>) {
  const provider = useAdminData();
  const formRef = useRef<HTMLFormElement>(null);
  const touched = useRef(new Set<OfferField>());
  const [recordId, setRecordId] = useState("");
  const [values, setValues] = useState<OfferFormValues>(emptyOffer);
  const [errors, setErrors] = useState<OfferErrors>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [savedOffer, setSavedOffer] = useState<Offer | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading offer…");

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (!active) return;
      const offer = state.offers.find((item) => item.id === offerId)
        ?? state.offers.find((item) => item.campaignId === offerId);
      if (!offer) {
        setLoading(false);
        setStatusMessage("Unable to load offer");
        return;
      }

      const isCampaignAlias = offer.id !== offerId;
      const loadedValues: OfferFormValues = {
        audience: offer.audience,
        campaignId: offer.campaignId,
        cta: offer.cta,
        description: offer.description,
        destination: offer.destination,
        endDate: offer.endsAt.slice(0, 10),
        startDate: isCampaignAlias ? "2026-08-17" : offer.startsAt.slice(0, 10),
        status: offer.status,
        title: offer.title,
      };
      setRecordId(offer.id);
      setValues((current) => ({
        audience: touched.current.has("audience") ? current.audience : loadedValues.audience,
        campaignId: touched.current.has("campaignId") ? current.campaignId : loadedValues.campaignId,
        cta: touched.current.has("cta") ? current.cta : loadedValues.cta,
        description: touched.current.has("description") ? current.description : loadedValues.description,
        destination: touched.current.has("destination") ? current.destination : loadedValues.destination,
        endDate: touched.current.has("endDate") ? current.endDate : loadedValues.endDate,
        startDate: touched.current.has("startDate") ? current.startDate : loadedValues.startDate,
        status: touched.current.has("status") ? current.status : loadedValues.status,
        title: touched.current.has("title") ? current.title : loadedValues.title,
      }));
      setSavedOffer(offer);
      setLoading(false);
      setStatusMessage("");
    }).catch(() => {
      if (active) {
        setLoading(false);
        setStatusMessage("Unable to load offer");
      }
    });
    return () => { active = false; };
  }, [offerId, provider]);

  function updateField<Field extends OfferField>(field: Field, value: OfferFormValues[Field]) {
    touched.current.add(field);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function focusFirstInvalid(nextErrors: OfferErrors) {
    const firstInvalid = fieldOrder.find((field) => nextErrors[field]);
    const element = firstInvalid ? formRef.current?.elements.namedItem(firstInvalid) : null;
    if (element instanceof HTMLElement) element.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || loading || !recordId) return;
    const result = offerSchema.safeParse(values);
    if (!result.success) {
      const nextErrors = result.error.issues.reduce<OfferErrors>((issues, issue) => {
        const field = issue.path[0] as OfferField | undefined;
        if (field && !issues[field]) issues[field] = issue.message;
        return issues;
      }, {});
      setErrors(nextErrors);
      setStatusMessage("Offer has validation errors");
      focusFirstInvalid(nextErrors);
      return;
    }

    setErrors({});
    setPending(true);
    setStatusMessage("Saving offer…");
    try {
      const updated = await provider.updateOffer(recordId, {
        audience: result.data.audience,
        campaignId: result.data.campaignId,
        cta: result.data.cta,
        description: result.data.description,
        destination: result.data.destination,
        endsAt: `${result.data.endDate}T23:59:59Z`,
        startsAt: `${result.data.startDate}T00:00:00Z`,
        status: result.data.status,
        title: result.data.title,
      }, "local-ray");
      setSavedOffer(updated);
      setStatusMessage(`Offer saved and ${lifecycleLabels[updated.status].toLocaleLowerCase()}`);
      onUpdated?.(updated);
    } catch {
      setStatusMessage("Unable to save offer");
    } finally {
      setPending(false);
    }
  }

  const errorSummary = fieldOrder.filter((field) => errors[field]);
  const displayedStatus = savedOffer?.status ?? values.status;
  const displayedDates = savedOffer
    ? dateRangeLabel(savedOffer.startsAt.slice(0, 10), savedOffer.endsAt.slice(0, 10))
    : dateRangeLabel(values.startDate, values.endDate);

  return (
    <section aria-labelledby={`offer-form-${offerId}`} className={styles.formPanel}>
      <header className={styles.formHeader}>
        <span className={styles.featureIcon}><Tag aria-hidden size={20} weight="duotone" /></span>
        <div>
          <h2 id={`offer-form-${offerId}`}>Offer editor</h2>
          <p>Manage validity, attribution, and Discord publishing readiness.</p>
        </div>
        <div className={styles.lifecycleSummary}>
          <span className={`${styles.lifecycle} ${styles[displayedStatus]}`}>{lifecycleLabels[displayedStatus]}</span>
          <strong><CalendarBlank aria-hidden size={14} /> {displayedDates}</strong>
        </div>
      </header>

      {errorSummary.length ? (
        <div className={styles.errorSummary} role="alert">
          <strong>Review the offer details</strong>
          <ul>{errorSummary.map((field) => <li key={field}>{errors[field]}</li>)}</ul>
        </div>
      ) : null}

      <form aria-busy={pending} className={styles.form} onSubmit={handleSubmit} ref={formRef}>
        <label className={styles.fullField}>Offer title<input disabled={pending} name="title" onChange={(event) => updateField("title", event.target.value)} type="text" value={values.title} /></label>
        <label className={styles.fullField}>Short description<textarea disabled={pending} name="description" onChange={(event) => updateField("description", event.target.value)} rows={3} value={values.description} /></label>
        <label>Eligible audience<input disabled={pending} name="audience" onChange={(event) => updateField("audience", event.target.value)} type="text" value={values.audience} /></label>
        <label>CTA label<input disabled={pending} name="cta" onChange={(event) => updateField("cta", event.target.value)} type="text" value={values.cta} /></label>
        <div className={styles.fullField}>
          <label htmlFor={`offer-destination-${offerId}`}>Destination</label>
          <input aria-describedby={errors.destination ? `offer-destination-error-${offerId}` : undefined} aria-invalid={Boolean(errors.destination)} disabled={pending} id={`offer-destination-${offerId}`} name="destination" onChange={(event) => updateField("destination", event.target.value)} type="url" value={values.destination} />
          {errors.destination ? <span className={styles.fieldError} id={`offer-destination-error-${offerId}`}>{errors.destination}</span> : null}
        </div>
        <label>Start date<input disabled={pending} name="startDate" onChange={(event) => updateField("startDate", event.target.value)} type="date" value={values.startDate} /></label>
        <div className={styles.formField}>
          <label htmlFor={`offer-end-${offerId}`}>End date</label>
          <input aria-describedby={errors.endDate ? `offer-end-error-${offerId}` : undefined} aria-invalid={Boolean(errors.endDate)} disabled={pending} id={`offer-end-${offerId}`} name="endDate" onChange={(event) => updateField("endDate", event.target.value)} type="date" value={values.endDate} />
          {errors.endDate ? <span className={styles.fieldError} id={`offer-end-error-${offerId}`}>{errors.endDate}</span> : null}
        </div>
        <label>Campaign association<input disabled={pending} name="campaignId" onChange={(event) => updateField("campaignId", event.target.value)} type="text" value={values.campaignId} /></label>
        <label>Status<select disabled={pending} name="status" onChange={(event) => updateField("status", event.target.value as Offer["status"])} value={values.status}>{offerStatuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></label>
        <button className={styles.primaryButton} disabled={loading || pending || !recordId} type="submit"><FloppyDisk aria-hidden size={16} weight="bold" />{pending ? "Saving offer…" : "Save offer"}</button>
      </form>
      <p aria-live="polite" className={styles.status} role="status">{statusMessage}</p>
    </section>
  );
}
