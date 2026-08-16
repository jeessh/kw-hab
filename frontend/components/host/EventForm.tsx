"use client";

import { useState } from "react";
import type { Event } from "@/lib/api";
import { ImageDrop } from "@/components/ImageDrop";
import { checkPostingLink } from "@/lib/postingLink";
import { CATEGORIES } from "@/lib/categories";
import {
  PAID_MODELS,
  centsFrom,
  dollarsFrom,
  templateFor,
  type PricingModel,
} from "@/lib/pricing";
import { FREQUENCIES, type Frequency } from "@/lib/recurrence";

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
  categories: string[];
  activityType: string;
  capacity: string;
  minAge: string;
  maxAge: string;
  frequency: Frequency;
  occurrenceCount: string;
  repeatForever: boolean;
  pricingModel: PricingModel;
  priceAmount: string;
  priceGroupSize: string;
  priceSessions: string;
  priceNote: string;
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
  categories: [],
  activityType: "",
  capacity: "",
  minAge: "",
  maxAge: "",
  frequency: "once",
  occurrenceCount: "",
  repeatForever: false,
  pricingModel: "free",
  priceAmount: "",
  priceGroupSize: "",
  priceSessions: "",
  priceNote: "",
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
    categories: event.categories?.length
      ? event.categories
      : event.category
        ? [event.category]
        : [],
    activityType: event.activity_type ?? "",
    capacity: event.capacity != null ? String(event.capacity) : "",
    // Editing touches one occurrence; changing how often it repeats means
    // rebuilding the series, which isn't an edit.
    frequency: "once",
    occurrenceCount: "",
    repeatForever: false,
    pricingModel: event.pricing_model ?? "free",
    priceAmount: dollarsFrom(event.price_cents),
    priceGroupSize:
      event.price_group_size != null ? String(event.price_group_size) : "",
    priceSessions:
      event.price_sessions != null ? String(event.price_sessions) : "",
    priceNote: event.price_note ?? "",
    minAge: event.min_age != null ? String(event.min_age) : "",
    maxAge: event.max_age != null ? String(event.max_age) : "",
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
  if (v.pricingModel === "free") accessibility_tags.push("free");
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    notes: v.notes.trim() || null,
    categories: v.categories,
    activity_type: v.activityType || null,
    location: v.location.trim() || null,
    starts_at: startsAt,
    cover_image_url: v.coverImageUrl || null,
    is_virtual: v.isVirtual,
    is_youth: v.isYouth,
    requires_signup: v.requiresSignup,
    // A posting link is what makes registration external. Asking the question
    // twice — "where do people sign up?" and then for a URL — was one question
    // more than the design asks.
    registration_mode: v.registrationUrl.trim() ? "external" : "internal",
    registration_url: v.registrationUrl.trim() || null,
    // Built above and previously never sent — the array was a dead local, so
    // every program went out with no tags at all.
    accessibility_tags,
    frequency: v.frequency,
    occurrence_count:
      v.repeatForever || !v.occurrenceCount.trim()
        ? null
        : Number(v.occurrenceCount),
    repeat_forever: v.frequency !== "once" && v.repeatForever,
    pricing_model: v.pricingModel,
    price_cents: centsFrom(v.priceAmount),
    price_group_size: v.priceGroupSize.trim()
      ? Number(v.priceGroupSize)
      : null,
    price_sessions: v.priceSessions.trim() ? Number(v.priceSessions) : null,
    price_note: v.priceNote.trim() || null,
    // Free is a consequence of the pricing model, not a separate answer.
    // Letting them disagree is how a "Free" badge ends up on a $40 course.
    is_free: v.pricingModel === "free",
    // Blank means "no limit" and "any age", which is not the same as zero.
    capacity: v.capacity.trim() ? Number(v.capacity) : null,
    min_age: v.minAge.trim() ? Number(v.minAge) : null,
    max_age: v.maxAge.trim() ? Number(v.maxAge) : null,
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
  if (v.categories.length === 0) missing.push("activity type");
  const t = templateFor(v.pricingModel);
  if (t.needsAmount && !centsFrom(v.priceAmount)) missing.push("price");
  if (t.needsGroup && !v.priceGroupSize.trim()) missing.push("group size");
  if (t.needsSessions && !v.priceSessions.trim()) missing.push("sessions");
  if (v.pricingModel === "custom" && !v.priceNote.trim())
    missing.push("cost description");
  if (v.frequency !== "once" && !v.repeatForever && !v.occurrenceCount.trim())
    missing.push("how many times it repeats");
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
                // Chrome's date field happily takes a six-digit year — type
                // 999999 and it is accepted, then the program sits a hundred
                // thousand years out where nobody will ever see it. min/max
                // bound the spinner and mark it invalid; the clamp catches
                // typing, which min/max alone does not stop.
                min="2000-01-01"
                max="2100-12-31"
                onChange={(e) => {
                  const v = e.target.value;
                  const year = Number(v.slice(0, 4));
                  if (v && (v.length > 10 || year > 2100)) return;
                  set("date", v);
                }}
                className={`${fieldClass} date-icon-left`}
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

        <div className="flex flex-wrap gap-4">
          <div className="min-w-[180px] flex-1">
            <Labelled label="Spaces (leave blank for no limit)">
              <input
                type="number"
                min={1}
                value={values.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                className={fieldClass}
                placeholder="20"
              />
            </Labelled>
          </div>
          <div className="min-w-[130px]">
            <Labelled label="Youngest age">
              <input
                type="number"
                min={0}
                value={values.minAge}
                onChange={(e) => set("minAge", e.target.value)}
                className={fieldClass}
                placeholder="Any"
              />
            </Labelled>
          </div>
          <div className="min-w-[130px]">
            <Labelled label="Oldest age">
              <input
                type="number"
                min={0}
                value={values.maxAge}
                onChange={(e) => set("maxAge", e.target.value)}
                className={fieldClass}
                placeholder="Any"
              />
            </Labelled>
          </div>
        </div>

        <Labelled label="Posting link (optional)">
          {/* type="text", not "url": the browser's url validation rejects
              "yourorg.ca" outright, and someone pasting what is in their
              address bar has not made a mistake. The API adds https:// when
              the scheme is missing and leaves it alone when it isn't. */}
          <input
            type="text"
            inputMode="url"
            value={values.registrationUrl}
            onChange={(e) => set("registrationUrl", e.target.value)}
            className={fieldClass}
            placeholder="yourorg.ca/register"
          />
        </Labelled>
        {(() => {
          const hint = checkPostingLink(values.registrationUrl);
          if (!hint) {
            return (
              <p className="-mt-2 text-base text-muted">
                Leave this blank if people sign up here rather than on your own
                site.
              </p>
            );
          }
          // A caution, not a refusal. Some agencies really do have one page,
          // and blocking that would just get the link left out entirely —
          // which is worse than a link to the front page.
          return (
            <p
              role="status"
              className={`-mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-base ${
                hint.tone === "error"
                  ? "bg-[#FDECEF] text-[#A3123C]"
                  : "bg-[#FFF4DC] text-[#7B4B00]"
              }`}
            >
              <span aria-hidden className="mt-px font-bold">
                {hint.tone === "error" ? "!" : "\u26A0"}
              </span>
              <span>{hint.message}</span>
            </p>
          );
        })()}
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
          event in front of the right people. Choose as many as fit.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              type="button"
              // A wellness walk that is also a social was being filed as one
              // or the other, and the feed matches interests against these —
              // so dropping the second decided who never saw it.
              onClick={() =>
                set(
                  "categories",
                  values.categories.includes(c.label)
                    ? values.categories.filter((x) => x !== c.label)
                    : [...values.categories, c.label],
                )
              }
              aria-pressed={values.categories.includes(c.label)}
              className={`rounded-full border px-4 py-2 text-base transition-colors ${
                values.categories.includes(c.label)
                  ? "border-transparent text-ink"
                  : "border-[#B9B7C4] text-ink hover:bg-slate-50"
              }`}
              style={
                values.categories.includes(c.label)
                  ? { background: CYAN }
                  : undefined
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
          What does it cost?
        </legend>
        {/* Free or paid first; how it charges only if it charges. Six options
            at once made a simple question look hard, and the two "free" ones
            sitting side by side were the pair people stalled on. */}
        <div className="mt-3 flex flex-wrap gap-3">
          {(["free", "paid"] as const).map((choice) => {
            const isPaid = values.pricingModel !== "free";
            const on = choice === "paid" ? isPaid : !isPaid;
            return (
              <button
                key={choice}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set(
                    "pricingModel",
                    // Coming back to paid lands on the commonest shape rather
                    // than on nothing.
                    choice === "free" ? "free" : "per_session",
                  )
                }
                className={`min-h-[52px] rounded-xl border px-8 font-display text-lg font-semibold transition-colors ${
                  on
                    ? "border-transparent text-ink"
                    : "border-[#B9B7C4] text-ink hover:bg-slate-50"
                }`}
                style={on ? { background: CYAN } : undefined}
              >
                {choice === "free" ? "Free" : "Paid"}
              </button>
            );
          })}
        </div>

        {values.pricingModel !== "free" && (
          <div className="mt-4">
            <p className="text-base font-semibold text-ink">How is it paid?</p>
            <div className="mt-2 flex flex-col gap-2">
              {PAID_MODELS.map((m) => {
                const t = templateFor(m);
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      values.pricingModel === m
                        ? "border-transparent"
                        : "border-[#B9B7C4] hover:bg-slate-50"
                    }`}
                    style={
                      values.pricingModel === m
                        ? { background: `${CYAN}33`, borderColor: CYAN }
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="pricing"
                      checked={values.pricingModel === m}
                      onChange={() => set("pricingModel", m)}
                      className="mt-1 h-4 w-4"
                    />
                    <span>
                      <span className="block text-lg text-ink">{t.label}</span>
                      <span className="block text-base text-muted">
                        {t.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {values.pricingModel === "series" && (
          <p className="mt-2 text-base text-muted">
            Signing up once will enrol the member in every date in this series.
          </p>
        )}
      </fieldset>

      <fieldset className="mt-8">
        <legend className="font-display text-xl font-bold text-ink">
          Does it repeat?
        </legend>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <Labelled label="How often">
              <select
                value={values.frequency}
                onChange={(e) => set("frequency", e.target.value as Frequency)}
                className={fieldClass}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Labelled>
          </div>
          {values.frequency !== "once" && !values.repeatForever && (
            <div className="min-w-[170px]">
              <Labelled label="How many times" required>
                <input
                  type="number"
                  min={2}
                  max={104}
                  value={values.occurrenceCount}
                  onChange={(e) => set("occurrenceCount", e.target.value)}
                  className={fieldClass}
                  placeholder="8"
                />
              </Labelled>
            </div>
          )}
          {values.frequency !== "once" && (
            // A drop-in that has run every Friday for nine years has no
            // session count to give, and making one up to satisfy the form put
            // a wrong number on the listing.
            <label className="flex min-h-[52px] cursor-pointer items-center gap-2.5 text-lg text-ink">
              <input
                type="checkbox"
                checked={values.repeatForever}
                onChange={(e) => set("repeatForever", e.target.checked)}
                className="h-5 w-5"
              />
              It keeps going
            </label>
          )}
        </div>
        {values.frequency !== "once" && (
          <p className="mt-2 text-base text-muted">
            Each date is posted separately, so people can save the ones they can
            make.
            {values.repeatForever &&
              " We'll post about two years ahead and extend it from there."}
          </p>
        )}
      </fieldset>

      <fieldset className="mt-8">
        <legend className="flex items-center gap-2 font-display text-xl font-bold text-ink">
          <span aria-hidden className="text-lg text-[#E8318A]">
            *
          </span>
          Set event tags
        </legend>
        <div className="mt-4 flex flex-col items-start gap-3">
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
