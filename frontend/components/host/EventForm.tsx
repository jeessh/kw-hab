"use client";

import { useState } from "react";
import type { Event } from "@/lib/api";
import { ImageDrop } from "@/components/ImageDrop";
import { CATEGORIES } from "@/lib/categories";

export const CYAN = "#35CDEE";

export type EventFormValues = {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  notes: string;
  registrationUrl: string;
  coverImageUrl: string;
  category: string;
  activityType: string;
  isFree: boolean;
  requiresSignup: boolean;
  isVirtual: boolean;
  isYouth: boolean;
};

export const EMPTY_FORM: EventFormValues = {
  title: "",
  date: "",
  time: "",
  location: "",
  description: "",
  notes: "",
  registrationUrl: "",
  coverImageUrl: "",
  category: "",
  activityType: "",
  isFree: true,
  requiresSignup: false,
  isVirtual: false,
  isYouth: false,
};

export function valuesFromEvent(event: Event): EventFormValues {
  const d = event.starts_at ? new Date(event.starts_at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: event.title,
    date: d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "",
    time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "",
    location: event.location ?? "",
    description: event.description ?? "",
    notes: event.notes ?? "",
    registrationUrl: event.registration_url ?? "",
    coverImageUrl: event.cover_image_url ?? "",
    category: event.category ?? "",
    activityType: event.activity_type ?? "",
    isFree: event.is_free,
    requiresSignup: event.requires_signup,
    isVirtual: event.is_virtual ?? false,
    isYouth: event.is_youth ?? false,
  };
}

/** What the API wants, from what the form holds. */
export function payloadFrom(v: EventFormValues) {
  const startsAt =
    v.date && v.time ? new Date(`${v.date}T${v.time}`).toISOString() : null;
  const accessibility_tags: string[] = [];
  if (v.isFree) accessibility_tags.push("free");
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    notes: v.notes.trim() || null,
    category: v.category || null,
    activity_type: v.activityType || null,
    location: v.location.trim() || null,
    starts_at: startsAt,
    cover_image_url: v.coverImageUrl || null,
    is_free: v.isFree,
    is_virtual: v.isVirtual,
    is_youth: v.isYouth,
    requires_signup: v.requiresSignup,
    // A posting link is what makes registration external. Asking the question
    // twice — "where do people sign up?" and then for a URL — was one question
    // more than the design asks.
    registration_mode: v.registrationUrl.trim() ? "external" : "internal",
    registration_url: v.registrationUrl.trim() || null,
  };
}

/** Everything marked with a * on the form. */
export function missingRequired(v: EventFormValues): string[] {
  const missing: string[] = [];
  if (!v.title.trim()) missing.push("name");
  if (!v.date) missing.push("date");
  if (!v.time) missing.push("time");
  if (!v.location.trim()) missing.push("location");
  if (!v.description.trim()) missing.push("description");
  if (!v.coverImageUrl) missing.push("image");
  if (!v.category) missing.push("activity type");
  return missing;
}

/* ---------------- pieces ---------------- */

function Labelled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-4 w-2 text-lg font-bold ${
          required ? "text-[#E8318A]" : "text-transparent"
        }`}
      >
        *
      </span>
      <label className="flex-1 rounded-2xl border border-[#B9B7C4] px-4 py-2.5 focus-within:border-accent">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted">
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </span>
        {children}
      </label>
    </div>
  );
}

const fieldClass =
  "mt-0.5 w-full bg-transparent text-lg text-ink outline-none placeholder:text-muted/70";

/** A two-choice pill. The design's tags are all either/or. */
function TagPair({
  left,
  right,
  value,
  onChange,
}: {
  left: string;
  right: string;
  /** true selects the left option. */
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`${left} or ${right}`}
      className="inline-flex items-center rounded-full border border-[#B9B7C4] p-1"
    >
      {[true, false].map((isLeft) => {
        const label = isLeft ? left : right;
        const active = value === isLeft;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(isLeft)}
            className="rounded-full px-5 py-1.5 text-lg text-ink transition-colors"
            style={active ? { background: CYAN } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- the form ---------------- */

export function EventForm({
  values,
  onChange,
  organization,
  submitting,
  submitLabel,
  onSubmit,
  onClear,
  error,
}: {
  values: EventFormValues;
  onChange: (next: EventFormValues) => void;
  /** Whose name this goes out under. */
  organization: string;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onClear: () => void;
  error: string | null;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const missing = missingRequired(values);
  const set = <K extends keyof EventFormValues>(
    key: K,
    v: EventFormValues[K],
  ) => onChange({ ...values, [key]: v });

  return (
    <form
      className="max-w-[820px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (missing.length) {
          setShowMissing(true);
          return;
        }
        if (!submitting) onSubmit();
      }}
    >
      <p className="text-base text-muted">
        All mandatory fields are marked with a{" "}
        <span className="font-bold text-[#E8318A]">*</span>.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <Labelled label="Name of event" required>
          <input
            autoFocus
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            className={fieldClass}
            placeholder="Open Space: Coffee & Chats"
          />
        </Labelled>

        <div className="flex flex-wrap gap-4">
          <div className="min-w-[240px] flex-1">
            <Labelled label="Date" required>
              <input
                type="date"
                value={values.date}
                onChange={(e) => set("date", e.target.value)}
                className={fieldClass}
              />
            </Labelled>
          </div>
          <div className="min-w-[160px]">
            <Labelled label="Time" required>
              <input
                type="time"
                value={values.time}
                onChange={(e) => set("time", e.target.value)}
                className={fieldClass}
              />
            </Labelled>
          </div>
        </div>

        <Labelled label="Location" required>
          <input
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            className={fieldClass}
            placeholder="Conestoga Mall Food Court"
          />
        </Labelled>

        <Labelled label="Brief description" required>
          <textarea
            rows={3}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            className={`${fieldClass} resize-y`}
            placeholder="A weekly gathering that brings people together at a cafe for food, fun and conversation."
          />
        </Labelled>

        <Labelled label="Extra details">
          <textarea
            rows={3}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            className={`${fieldClass} resize-y`}
            placeholder="What to bring, who to ask for, anything that varies week to week."
          />
        </Labelled>

        <Labelled label="Posting link">
          <input
            type="url"
            value={values.registrationUrl}
            onChange={(e) => set("registrationUrl", e.target.value)}
            className={fieldClass}
            placeholder="https://yourorg.ca/register"
          />
        </Labelled>
      </div>

      {/* Topic and kind aren't on the mockup, but the member feed groups and
          sorts on them — a program without a topic can't match anyone. */}
      <fieldset className="mt-8">
        <legend className="flex items-center gap-2 font-display text-xl font-bold text-ink">
          <span aria-hidden className="text-lg text-[#E8318A]">
            *
          </span>
          Activity Type
        </legend>
        <p className="mt-1 text-base text-muted">
          Members pick these same topics as interests — this is what puts your
          event in front of the right people.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => set("category", c.label)}
              aria-pressed={values.category === c.label}
              className={`rounded-full border px-4 py-2 text-base transition-colors ${
                values.category === c.label
                  ? "border-transparent text-ink"
                  : "border-[#B9B7C4] text-ink hover:bg-slate-50"
              }`}
              style={
                values.category === c.label ? { background: CYAN } : undefined
              }
            >
              <span aria-hidden>{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-8 flex items-start gap-2">
        <span aria-hidden className="mt-1 text-lg font-bold text-[#E8318A]">
          *
        </span>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold text-ink">
            Upload an image
          </h2>
          <p className="mt-1 text-base text-muted">
            This allows event-goers to understand what your event is all about.
          </p>
          <div className="mt-3">
            <ImageDrop
              label=""
              value={values.coverImageUrl}
              onChange={(v) => set("coverImageUrl", v)}
            />
          </div>
        </div>
      </div>

      <fieldset className="mt-8">
        <legend className="flex items-center gap-2 font-display text-xl font-bold text-ink">
          <span aria-hidden className="text-lg text-[#E8318A]">
            *
          </span>
          Set event tags
        </legend>
        <div className="mt-4 flex flex-col items-start gap-3">
          <TagPair
            left="Free"
            right="Paid"
            value={values.isFree}
            onChange={(v) => set("isFree", v)}
          />
          <TagPair
            left="Drop-In"
            right="Requires Registration"
            value={!values.requiresSignup}
            onChange={(v) => set("requiresSignup", !v)}
          />
          <TagPair
            left="Virtual"
            right="In-Person"
            value={values.isVirtual}
            onChange={(v) => set("isVirtual", v)}
          />
          <TagPair
            left="Youth"
            right="Everyone"
            value={values.isYouth}
            onChange={(v) => set("isYouth", v)}
          />
        </div>
      </fieldset>

      {showMissing && missing.length > 0 && (
        <p role="alert" className="mt-6 text-base font-semibold text-[#E8318A]">
          Still needed: {missing.join(", ")}.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-base font-semibold text-red-600">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3 pb-16">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg px-6 py-3 font-display text-lg font-semibold text-ink transition-transform enabled:hover:scale-[1.02] disabled:opacity-50"
          style={{ background: CYAN }}
        >
          {submitting ? "Posting…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowMissing(false);
            onClear();
          }}
          className="rounded-lg bg-[#D9D9D9] px-6 py-3 font-display text-lg font-semibold text-ink transition-colors hover:bg-[#CDCDCD]"
        >
          Clear Posting
        </button>
        <span className="sr-only" role="status">
          Posting under {organization}
        </span>
      </div>
    </form>
  );
}
