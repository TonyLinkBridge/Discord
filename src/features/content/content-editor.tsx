"use client";

import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminData } from "@/lib/admin-data/context";
import { ContentUpdateConflictError } from "@/lib/admin-data/provider";
import type { ContentEntry } from "@/lib/admin-data/types";
import { contentFormats, partitionContentCycles, validateContentEntry } from "./content-mix";
import styles from "./content-screen.module.css";

type ContentFormValues = {
  targetId: string;
  title: string;
  format: ContentEntry["format"] | "";
  conversionLevel: ContentEntry["conversionLevel"] | "";
  publishDate: string;
  cta: string;
};

type ContentField = keyof ContentFormValues;
type ContentErrors = Partial<Record<ContentField, string>>;

const emptyValues: ContentFormValues = {
  targetId: "",
  title: "",
  format: "",
  conversionLevel: "",
  publishDate: "",
  cta: "",
};

const fieldOrder: readonly ContentField[] = [
  "targetId",
  "title",
  "format",
  "conversionLevel",
  "publishDate",
  "cta",
];

const formatLabels = Object.fromEntries(
  contentFormats.map((format) => [format.value, format.label]),
) as Record<ContentEntry["format"], string>;

const noEligibleSlotsMessage =
  "No scheduled post slots are available. Published and draft posts cannot be replaced here.";
const ineligibleSelectionStatus = "Selected post is no longer eligible";
const ineligibleSelectionNoSlotsStatus =
  "Selected post is no longer eligible. No scheduled post slots are available.";

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
  if (!values.targetId) errors.targetId = "Choose a post slot to replace";
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
  onUpdated,
  showSavedPreview = true,
}: Readonly<{
  onUpdated?: (entry: ContentEntry) => void | Promise<void>;
  showSavedPreview?: boolean;
}>) {
  const provider = useAdminData();
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [values, setValues] = useState<ContentFormValues>(emptyValues);
  const [errors, setErrors] = useState<ContentErrors>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("Loading post slots…");
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [slotLoadError, setSlotLoadError] = useState(false);
  const [savedEntry, setSavedEntry] = useState<ContentEntry | null>(null);
  const [cycleCompliant, setCycleCompliant] = useState(false);

  useEffect(() => {
    let active = true;
    provider.getState().then((state) => {
      if (!active) return;
      const orderedEntries = partitionContentCycles(state.content).flatMap((cycle) => cycle.entries);
      setEntries(orderedEntries);
      setSlotsLoaded(true);
      setStatus(orderedEntries.some((entry) => entry.status === "scheduled")
        ? ""
        : "No eligible replacement targets");
    }).catch(() => {
      if (!active) return;
      setSlotLoadError(true);
      setStatus("Unable to load post slots");
    });
    return () => { active = false; };
  }, [provider]);

  useEffect(() => {
    if (status === ineligibleSelectionStatus) {
      const target = formRef.current?.elements.namedItem("targetId");
      if (target instanceof HTMLElement) target.focus();
    } else if (status === ineligibleSelectionNoSlotsStatus) {
      statusRef.current?.focus();
    }
  }, [status]);

  function updateField<Field extends ContentField>(field: Field, value: ContentFormValues[Field]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function selectTarget(targetId: string) {
    const target = entries.find((entry) => entry.id === targetId && entry.status === "scheduled");
    if (!target) {
      setValues(emptyValues);
      return;
    }
    setValues({
      targetId,
      cta: target.ctas[0] ?? "",
      conversionLevel: target.conversionLevel,
      format: target.format,
      publishDate: target.publishAt.slice(0, 10),
      title: target.title,
    });
    setErrors({});
    setSavedEntry(null);
    setStatus("");
  }

  function focusFirstInvalid(nextErrors: ContentErrors) {
    const firstInvalid = fieldOrder.find((field) => nextErrors[field]);
    const element = firstInvalid ? formRef.current?.elements.namedItem(firstInvalid) : null;
    if (element instanceof HTMLElement) element.focus();
  }

  async function refreshAfterConflict() {
    const issue = "Only scheduled posts can be replaced. Choose another slot";
    const state = await provider.getState();
    const refreshedEntries = partitionContentCycles(state.content)
      .flatMap((cycle) => cycle.entries);
    const hasEligibleTarget = refreshedEntries.some((entry) => entry.status === "scheduled");
    setEntries(refreshedEntries);
    setValues(emptyValues);
    setErrors({ targetId: issue });
    setStatus(hasEligibleTarget ? ineligibleSelectionStatus : ineligibleSelectionNoSlotsStatus);
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
      const currentTarget = await provider.getContentEntry(values.targetId);
      if (currentTarget.status !== "scheduled") {
        await refreshAfterConflict();
        return;
      }
      const updated = await provider.updateContentEntry(values.targetId, {
        ctas: [values.cta.trim()],
        conversionLevel: values.conversionLevel as ContentEntry["conversionLevel"],
        format: values.format as ContentEntry["format"],
        publishAt: `${values.publishDate}T13:00:00Z`,
        status: "scheduled",
        title: values.title.trim(),
      }, { expectedStatus: "scheduled" });
      const state = await provider.getState();
      const cycles = partitionContentCycles(state.content);
      const selectedCycle = cycles.find((cycle) =>
        cycle.entries.some((entry) => entry.id === updated.id));
      setEntries(cycles.flatMap((cycle) => cycle.entries));
      setSavedEntry(updated);
      setCycleCompliant(selectedCycle?.compliant ?? false);
      setStatus("Post scheduled");
      await onUpdated?.(updated);
    } catch (error) {
      if (error instanceof ContentUpdateConflictError) {
        await refreshAfterConflict();
      } else {
        setStatus("Unable to schedule post");
      }
    } finally {
      setPending(false);
    }
  }

  const errorSummary = fieldOrder.filter((field) => errors[field]);
  const cycles = partitionContentCycles(entries);
  const positions = cycles.flatMap((cycle) => cycle.entries.map((entry, index) => ({
    cycle: cycle.number,
    entry,
    slot: index + 1,
  })));
  const eligiblePositions = positions.filter((position) => position.entry.status === "scheduled");
  const selectedPosition = eligiblePositions.find((position) => position.entry.id === values.targetId);
  const hasEligibleSlots = eligiblePositions.length > 0;

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
        {slotsLoaded ? (
          <div className={styles.fullField}>
            <label htmlFor="content-target">Post slot to replace</label>
            <select
              aria-describedby={errors.targetId ? "content-target-error" : "content-target-help"}
              aria-invalid={Boolean(errors.targetId)}
              disabled={pending || !hasEligibleSlots}
              id="content-target"
              name="targetId"
              onChange={(event) => selectTarget(event.target.value)}
              value={values.targetId}
            >
              <option disabled value="">Choose a scheduled post</option>
              {eligiblePositions.map((position) => (
                <option key={position.entry.id} value={position.entry.id}>
                  {`Cycle ${position.cycle} · Slot ${position.slot} · ${formatPublishDate(position.entry.publishAt)} · ${position.entry.title}`}
                </option>
              ))}
            </select>
            {errors.targetId
              ? <span className={styles.fieldError} id="content-target-error">{errors.targetId}</span>
              : <span className={styles.fieldHelp} id="content-target-help">
                {hasEligibleSlots
                  ? "Select the existing scheduled post that this draft will replace."
                  : noEligibleSlotsMessage}
              </span>}
          </div>
        ) : (
          <p className={slotLoadError ? styles.inlineLoadError : styles.fieldHelp}>
            {slotLoadError ? "Unable to load post slots." : "Loading post slots…"}
          </p>
        )}

        {selectedPosition ? (
          <p className={styles.replacementNotice}>
            <strong>{`Cycle ${selectedPosition.cycle}, slot ${selectedPosition.slot}`}</strong>
            {` · ${formatPublishDate(selectedPosition.entry.publishAt)} · ${selectedPosition.entry.title}. Saving will overwrite this existing post.`}
          </p>
        ) : null}

        <div className={styles.fullField}>
          <label htmlFor="content-title">Title</label>
          <input
            aria-describedby={errors.title ? "content-title-error" : undefined}
            aria-invalid={Boolean(errors.title)}
            disabled={pending || !values.targetId}
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
            disabled={pending || !values.targetId}
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
            disabled={pending || !values.targetId}
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
            disabled={pending || !values.targetId}
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
            disabled={pending || !values.targetId}
            id="content-cta"
            name="cta"
            onChange={(event) => updateField("cta", event.target.value)}
            type="text"
            value={values.cta}
          />
          {errors.cta ? <span className={styles.fieldError} id="content-cta-error">{errors.cta}</span> : null}
        </div>
        <button
          className={styles.primaryButton}
          disabled={pending || slotLoadError || (slotsLoaded && !hasEligibleSlots)}
          type="submit"
        >
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
      <p
        aria-live="polite"
        className={styles.status}
        ref={statusRef}
        role="status"
        tabIndex={-1}
      >
        {status}
      </p>
    </section>
  );
}
