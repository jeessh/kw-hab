"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { ImageDrop } from "@/components/ImageDrop";

const ACCESS_OPTIONS = [
  "wheelchair_accessible",
  "asl_interpretation",
  "sensory_friendly",
  "childcare_provided",
  "transit_accessible",
  "free",
  "no_registration",
];

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    location: "",
    starts_at: "",
    cover_image_url: "",
    is_free: true,
    requires_signup: false,
  });
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [gallery, setGallery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  function toggleTag(t: string) {
    setTags((prev) => {
      const nextSet = new Set(prev);
      nextSet.has(t) ? nextSet.delete(t) : nextSet.add(t);
      return nextSet;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/events", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          starts_at: form.starts_at
            ? new Date(form.starts_at).toISOString()
            : null,
          accessibility_tags: [...tags],
          gallery: gallery.map((url, i) => ({ url, sort_order: i })),
        }),
      });
      router.push("/host/events");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/host");
        return;
      }
      setError("Couldn't create the program. Check the fields and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-6 py-10">
      <h1 className="font-display text-3xl font-extrabold text-ink">
        Add a program
      </h1>
      <p className="mt-1 text-muted">
        Fill in the details community members will see.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <Field label="Title">
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="input"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <input
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Food, Housing, Youth…"
              className="input"
            />
          </Field>
          <Field label="Starts at">
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => set("starts_at", e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <Field label="Location">
          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            className="input"
          />
        </Field>
        <ImageDrop
          label="Cover image"
          value={form.cover_image_url}
          onChange={(url) => set("cover_image_url", url)}
        />
        <ImageDrop
          label="Gallery images"
          multiple
          value={gallery}
          onChange={setGallery}
        />

        <fieldset>
          <legend className="text-sm font-semibold text-muted">
            Accessibility
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCESS_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  tags.has(t)
                    ? "bg-accent text-white"
                    : "bg-white text-ink shadow-card"
                }`}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-3 text-lg text-ink">
          <input
            type="checkbox"
            checked={form.is_free}
            onChange={(e) => set("is_free", e.target.checked)}
            className="h-5 w-5"
          />
          This program is free
        </label>

        <label className="flex items-center gap-3 text-lg text-ink">
          <input
            type="checkbox"
            checked={form.requires_signup}
            onChange={(e) => set("requires_signup", e.target.checked)}
            className="h-5 w-5"
          />
          Requires signup (otherwise it&apos;s drop-in)
        </label>
      </div>

      {error && <p className="mt-4 text-pop">{error}</p>}

      <div className="mt-8 flex gap-3">
        <button
          onClick={() => router.push("/host/events")}
          className="rounded-xl px-5 py-3 font-semibold text-muted hover:bg-white"
        >
          Cancel
        </button>
        <button
          disabled={busy || !form.title.trim()}
          onClick={submit}
          className="rounded-xl bg-accent px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Publishing…" : "Publish program"}
        </button>
      </div>

      <style jsx global>{`
        .input {
          border-radius: 0.75rem;
          border: 2px solid #e2def0;
          padding: 0.75rem 1rem;
          font-size: 1.125rem;
          outline: none;
          width: 100%;
          background: #fff;
        }
        .input:focus {
          border-color: #5b5bd6;
        }
      `}</style>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
