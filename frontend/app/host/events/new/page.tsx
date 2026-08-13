"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api, apiMessage } from "@/lib/api";
import { CATEGORIES } from "@/lib/categories";
import { AdminShell } from "@/components/AdminShell";
import { Button, Field, inputClass } from "@/components/AdminTable";
import { ImageDrop } from "@/components/ImageDrop";

// Plain-language labels. The stored slugs stay as they are — members filter on
// them — but nobody should have to read "asl_interpretation" off a form.
const ACCESS_OPTIONS: { slug: string; label: string }[] = [
  { slug: "wheelchair_accessible", label: "Wheelchair accessible" },
  { slug: "asl_interpretation", label: "ASL interpretation" },
  { slug: "sensory_friendly", label: "Sensory friendly" },
  { slug: "childcare_provided", label: "Childcare provided" },
  { slug: "transit_accessible", label: "Near transit" },
];
// "Drop in, no registration" used to live in the list above, where it could
// contradict the sign-up question below. Registration is one answer, asked once.

export default function NewProgramPage() {
  return (
    <AdminShell
      title="Add a program"
      description="Two things are required. Everything else is optional."
    >
      {() => <NewProgramForm />}
    </AdminShell>
  );
}

function NewProgramForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");

  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [isFree, setIsFree] = useState(true);
  const [requiresSignup, setRequiresSignup] = useState(false);
  const [regMode, setRegMode] = useState<"internal" | "external">("internal");
  const [regUrl, setRegUrl] = useState("");

  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Category is required because the member feed sorts on it: an uncategorised
  // program can never match anyone's interests, so it quietly sinks.
  // The link is required only in the one state that sends a member somewhere.
  const needsRegUrl = requiresSignup && regMode === "external";
  const valid =
    title.trim() !== "" && category !== "" && (!needsRegUrl || regUrl.trim() !== "");

  function toggleTag(slug: string) {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // "free" is a member-facing accessibility tag as well as a column; keep
      // the two in step so the feed's tag filter doesn't disagree with the
      // Free/Paid badge.
      const accessibility_tags = [...tags];
      if (isFree) accessibility_tags.push("free");

      await api("/events", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          location: location.trim() || null,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          cover_image_url: coverUrl || null,
          is_free: isFree,
          requires_signup: requiresSignup,
          registration_mode: regMode,
          registration_url: regUrl.trim() || null,
          accessibility_tags,
          gallery: gallery.map((url, i) => ({ url, sort_order: i })),
        }),
      });
      router.push("/host/events");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/host");
        return;
      }
      setError(
        apiMessage(e, "Couldn't save the program. Check the fields and retry."),
      );
      setBusy(false);
    }
  }

  return (
    <form
      className="max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) void submit();
      }}
    >
      <section className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5">
        <Field label="What is it called?" htmlFor="e-title">
          <input
            id="e-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Community Lunch"
            className={inputClass}
          />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            What kind of program is it?
          </legend>
          <p className="mt-0.5 text-xs text-slate-500">
            Members pick these same topics as interests — this is what puts your
            program in front of the right people.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const chosen = category === c.label;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setCategory(c.label)}
                  aria-pressed={chosen}
                  className="inline-flex items-center gap-1.5 rounded-md border-2 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                  style={{ borderColor: chosen ? c.color : "#cbd5e1" }}
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="When does it start?"
            htmlFor="e-when"
            hint="Leave empty if the date isn't set yet."
          >
            <input
              id="e-when"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Where is it?" htmlFor="e-where">
            <input
              id="e-where"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="KW Hab Community Room"
              className={inputClass}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Does it cost anything?
          </legend>
          <div className="mt-2 flex gap-2">
            <Choice
              name="cost"
              checked={isFree}
              onChange={() => setIsFree(true)}
              label="Free"
            />
            <Choice
              name="cost"
              checked={!isFree}
              onChange={() => setIsFree(false)}
              label="Costs money"
            />
          </div>
        </fieldset>
      </section>

      {/* Everything below is optional. Collapsed by default so the required
          path is a name and a topic, not a wall of fields. */}
      <section className="mt-4 rounded-lg border border-slate-200 bg-white">
        <h2>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            aria-controls="more-details"
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span>
              <span className="font-semibold text-slate-900">
                Add more details
              </span>
              <span className="block text-xs text-slate-500">
                Description, photos, accessibility, registration — all optional.
              </span>
            </span>
            <span aria-hidden className="text-slate-500">
              {showMore ? "▲" : "▼"}
            </span>
          </button>
        </h2>

        {showMore && (
          <div
            id="more-details"
            className="flex flex-col gap-5 border-t border-slate-200 p-5"
          >
            <Field label="Description" htmlFor="e-desc">
              <textarea
                id="e-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Who it's for and what happens."
                className={inputClass}
              />
            </Field>

            <ImageDrop
              label="Cover image"
              value={coverUrl}
              onChange={(url) => setCoverUrl(url)}
            />
            <ImageDrop
              label="More photos"
              multiple
              value={gallery}
              onChange={setGallery}
            />

            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                Accessibility
              </legend>
              <p className="mt-0.5 text-xs text-slate-500">
                Tick anything that applies. Members can filter on these.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ACCESS_OPTIONS.map((opt) => (
                  <button
                    key={opt.slug}
                    type="button"
                    onClick={() => toggleTag(opt.slug)}
                    aria-pressed={tags.has(opt.slug)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      tags.has(opt.slug)
                        ? "border-accent bg-accent text-white"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                Do people need to sign up?
              </legend>
              <div className="mt-2 flex gap-2">
                <Choice
                  name="signup"
                  checked={!requiresSignup}
                  onChange={() => setRequiresSignup(false)}
                  label="Just drop in"
                />
                <Choice
                  name="signup"
                  checked={requiresSignup}
                  onChange={() => setRequiresSignup(true)}
                  label="Sign-up required"
                />
              </div>
            </fieldset>

            {/* Only asked when it changes anything: a drop-in program is saved
                the same way whether or not you run your own registration. */}
            {requiresSignup && (
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">
                  Where do people sign up?
                </legend>
                <div className="mt-2 flex gap-2">
                  <Choice
                    name="regmode"
                    checked={regMode === "internal"}
                    onChange={() => setRegMode("internal")}
                    label="Here"
                  />
                  <Choice
                    name="regmode"
                    checked={regMode === "external"}
                    onChange={() => setRegMode("external")}
                    label="On our own site"
                  />
                </div>
                {regMode === "external" && (
                  <div className="mt-3">
                    <Field label="Link to your sign-up page" htmlFor="e-regurl">
                      <input
                        id="e-regurl"
                        type="url"
                        value={regUrl}
                        onChange={(e) => setRegUrl(e.target.value)}
                        placeholder="https://yourorg.ca/register"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                )}
              </fieldset>
            )}
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" tone="primary" disabled={!valid || busy}>
          {busy ? "Publishing…" : "Publish program"}
        </Button>
        <Link
          href="/host/events"
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </Link>
        {!valid && (
          <span className="text-xs text-slate-500">
            {needsRegUrl && !regUrl.trim()
              ? "Add the link to your sign-up page to publish."
              : "Add a name and pick a topic to publish."}
          </span>
        )}
      </div>
    </form>
  );
}

/** Radio styled as a segmented choice — one visible answer per question. */
function Choice({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={`cursor-pointer rounded-md border px-4 py-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-accent/40 ${
        checked
          ? "border-accent bg-accent text-white"
          : "border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  );
}
