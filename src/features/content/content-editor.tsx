"use client";

import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { useRef, useState, type FormEvent } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import type { ContentEntry } from "@/lib/admin-data/types";
import { contentFormats, summarizeContentMix, validateContentEntry } from "./content-mix";
import styles from "./content-screen.module.css";

type ContentFormValues = {
  title: string;
  format: ContentEntry["format"] | "";
  conversionLevel: ContentEntry["conversionLevel"] | "";
  publishDate: string;
  cta: string;
};

type ContentField = keyof ContentFormValues;
type ContentErrors = Partial<Record<ContentField, string>>;

const emptyValues: ContentFormValues = {
  title: "",
  format: "",
  conversionLevel: "",
  publishDate: "",
  cta: "",
};

const fieldOrder: readonly ContentField[] = [
  "title",
  "format",
  "conversionLevel",
  "publishDate",
  "cta",
];

const formatLabels = Object.fromEntries(
  contentFormats.map((format) => [format.value, format.label]),
) as Record<ContentEntry["format"], string>;

function formatPublishDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function validateForm(values: ContentFormValues): ContentErrors {
  const errors: ContentErrors = {};
  const entryResult = validateContentEntry({ title: values.title, ctas: [values.cta] });
  if (!entryResult.success) {
    for (const issue of entryResult.issues) {
      if (issue === "Enter a title") errors.title = issue;
      if (issue === "Each post must have exactly one CTA") errors.cta = issue;
    }
  }
  if (!values.format) errors.format = "Select a format";
  if (!values.conversionLevel) errors.conversionLevel = "Select a conversion level";
  if (!values.publishDate) errors.publishDate = "Enter a publish date";
  return errors;
}

export function ContentEditor({
  entryId = "market-pulse-aug-22",
  onUpdated,
  showSavedPreview = true,
}: Readonly<{
  entryId?: string;
  onUpdated?: (entry: ContentEntry) => void;
  showSavedPreview?: boolean;
}>) {
  const provider = useAdminData();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ContentFormValues>(emptyValues);
  const [errors, setErrors] = useState<ContentErrors>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [savedEntry, setSavedEntry] = useState<ContentEntry | null>(null);
  const [cycleCompliant, setCycleCompliant] = useState(false);

  function updateField<Field extends ContentField>(field: Field, value: ContentFormValues[Field]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function focusFirstInvalid(nextErrors: ContentErrors) {
    const firstInvalid = fieldOrder.find((field) => nextErrors[field]);
    const element = firstInvalid ? formRef.current?.elements.namedItem(firstInvalid) : null;
    if (element instanceof HTMLElement) element.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextErrors = validateForm(values);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus("Post has validation errors");
      focusFirstInvalid(nextErrors);
      return;
    }

    setErrors({});
    setPending(true);
    setStatus("Scheduling post…");
    try {
      const updated = await provider.updateContentEntry(entryId, {
        ctas: [values.cta.trim()],
        conversionLevel: values.conversionLevel as ContentEntry["conversionLevel"],
        format: values.format as ContentEntry["format"],
        publishAt: `${values.publishDate}T13:00:00Z`,
        status: "scheduled",
        title: values.title.trim(),
      }, "local-ray");
      const state = await provider.getState();
      setSavedEntry(updated);
      setCycleCompliant(summarizeContentMix(
        state.content.map((entry) => entry.conversionLevel),
      ).compliant);
      setStatus("Post scheduled");
      onUpdated?.(updated);
    } catch {
      setStatus("Unable to schedule post");
    } finally {
      setPending(false);
    }
  }

  const errorSummary = fieldOrder.filter((field) => errors[field]);

  return (
    <section aria-labelledby="content-editor-title" className={styles.editorPanel}>
      <header className={styles.panelHeader}>
        <span className={styles.featureIcon}>
          <PaperPlaneTilt aria-hidden size={20} weight="duotone" />
        </span>
        <div>
          <p className={styles.eyebrow}>Domain Intelligence</p>
          <h2 id="content-editor-title">Schedule a post</h2>
        </div>
      </header>

      {errorSummary.length ? (
        <div className={styles.errorSummary} role="alert">
          <strong>Review the post details</strong>
          <ul>
            {errorSummary.map((field) => <li key={field}>{errors[field]}</li>)}
          </ul>
        </div>
      ) : null}

      <form aria-busy={pending} className={styles.editorForm} onSubmit={handleSubmit} ref={formRef}>
        <div className={styles.fullField}>
          <label htmlFor="content-title">Title</label>
          <input
            aria-describedby={errors.title ? "content-title-error" : undefined}
            aria-invalid={Boolean(errors.title)}
            disabled={pending}
            id="content-title"
            name="title"
            onChange={(event) => updateField("title", event.target.value)}
            type="text"
            value={values.title}
          />
          {errors.title ? <span className={styles.fieldError} id="content-title-error">{errors.title}</span> : null}
        </div>
        <div className={styles.formField}>
          <label htmlFor="content-format">Format</label>
          <select
            aria-describedby={errors.format ? "content-format-error" : undefined}
            aria-invalid={Boolean(errors.format)}
            disabled={pending}
            id="content-format"
            name="format"
            onChange={(event) => updateField("format", event.target.value as ContentFormValues["format"])}
            value={values.format}
          >
            <option disabled value="">Select a format</option>
            {contentFormats.map((format) => (
              <option key={format.value} value={format.value}>{format.label}</option>
            ))}
          </select>
          {errors.format ? <span className={styles.fieldError} id="content-format-error">{errors.format}</span> : null}
        </div>
        <div className={styles.formField}>
          <label htmlFor="content-level">Conversion level</label>
          <select
            aria-describedby={errors.conversionLevel ? "content-level-error" : undefined}
            aria-invalid={Boolean(errors.conversionLevel)}
            disabled={pending}
            id="content-level"
            name="conversionLevel"
            onChange={(event) => updateField("conversionLevel", event.target.value as ContentFormValues["conversionLevel"])}
            value={values.conversionLevel}
          >
            <option disabled value="">Select a level</option>
            <option value="education">Education</option>
            <option value="soft">Soft conversion</option>
            <option value="direct">Direct offer</option>
          </select>
          {errors.conversionLevel ? <span className={styles.fieldError} id="content-level-error">{errors.conversionLevel}</span> : null}
        </div>
        <div className={styles.formField}>
          <label htmlFor="content-date">Publish date</label>
          <input
            aria-describedby={errors.publishDate ? "content-date-error" : undefined}
            aria-invalid={Boolean(errors.publishDate)}
            disabled={pending}
            id="content-date"
            name="publishDate"
            onChange={(event) => updateField("publishDate", event.target.value)}
            type="date"
            value={values.publishDate}
          />
          {errors.publishDate ? <span className={styles.fieldError} id="content-date-error">{errors.publishDate}</span> : null}
        </div>
        <div className={styles.formField}>
          <label htmlFor="content-cta">CTA</label>
          <input
            aria-describedby={errors.cta ? "content-cta-error" : undefined}
            aria-invalid={Boolean(errors.cta)}
            disabled={pending}
            id="content-cta"
            name="cta"
            onChange={(event) => updateField("cta", event.target.value)}
            type="text"
            value={values.cta}
          />
          {errors.cta ? <span className={styles.fieldError} id="content-cta-error">{errors.cta}</span> : null}
        </div>
        <button className={styles.primaryButton} disabled={pending} type="submit">
          <PaperPlaneTilt aria-hidden size={16} weight="bold" />
          {pending ? "Scheduling post…" : "Schedule post"}
        </button>
      </form>

      {showSavedPreview && savedEntry ? (
        <div className={styles.savedPreview}>
          <span className={styles.savedIcon}><CheckCircle aria-hidden size={20} weight="fill" /></span>
          <div>
            <strong>{savedEntry.title}</strong>
            <span>{formatPublishDate(savedEntry.publishAt)}</span>
            <span>{formatLabels[savedEntry.format]}</span>
          </div>
          <span className={cycleCompliant ? styles.compliant : styles.noncompliant}>
            {cycleCompliant ? "4:2:1 cycle compliant" : "4:2:1 cycle needs adjustment"}
          </span>
        </div>
      ) : null}
      <p aria-live="polite" className={styles.status} role="status">{status}</p>
    </section>
  );
}
