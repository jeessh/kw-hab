"use client";

import { useState } from "react";
import { api, type Event } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { ImageDrop } from "@/components/ImageDrop";

/** Turn an ISO timestamp into a value the datetime-local input accepts. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Owning host (or admin) modal to modify an event's core fields in place. */
export function EditEventModal({
  event,
  onClose,
  onSaved,
}: {
  event: Event;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [category, setCategory] = useState(event.category ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(event.starts_at));
  const [isFree, setIsFree] = useState(event.is_free);
  const [requiresSignup, setRequiresSignup] = useState(event.requires_signup);
  const [coverImageUrl, setCoverImageUrl] = useState(
    event.cover_image_url ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description,
          category: category.trim() || null,
          location: location.trim() || null,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          is_free: isFree,
          requires_signup: requiresSignup,
          cover_image_url: coverImageUrl || null,
        }),
      });
      onSaved();
    } catch {
      setError("Couldn't save this program. You may not have permission.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit program" onClose={onClose}>
      <div className="mt-5 flex flex-col gap-4">
        <Field label="Title" htmlFor="edit-title">
          <input
            id="edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field-input"
          />
        </Field>
        <Field label="Description" htmlFor="edit-desc">
          <textarea
            id="edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="field-input"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="edit-category">
            <input
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Food, Housing, Youth…"
              className="field-input"
            />
          </Field>
          <Field label="Starts at" htmlFor="edit-start">
            <input
              id="edit-start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="field-input"
            />
          </Field>
        </div>
        <Field label="Location" htmlFor="edit-location">
          <input
            id="edit-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="field-input"
          />
        </Field>

        <ImageDrop
          label="Cover image"
          value={coverImageUrl}
          onChange={setCoverImageUrl}
        />

        <label className="flex items-center gap-3 text-lg text-ink">
          <input
            type="checkbox"
            checked={isFree}
            onChange={(e) => setIsFree(e.target.checked)}
            className="h-5 w-5"
          />
          This program is free
        </label>
        <label className="flex items-center gap-3 text-lg text-ink">
          <input
            type="checkbox"
            checked={requiresSignup}
            onChange={(e) => setRequiresSignup(e.target.checked)}
            className="h-5 w-5"
          />
          Requires signup (otherwise it&apos;s drop-in)
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 font-semibold text-pop">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={busy}
          className="rounded-xl px-5 py-3 font-semibold text-muted hover:bg-paper disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={save}
          className="rounded-xl bg-accent px-6 py-3 font-semibold text-white transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>

      <style jsx global>{`
        .field-input {
          border-radius: 0.75rem;
          border: 2px solid #e2def0;
          padding: 0.65rem 0.9rem;
          font-size: 1.05rem;
          outline: none;
          width: 100%;
          background: #fff;
          color: #201b33;
        }
        .field-input:focus {
          border-color: #5b5bd6;
        }
      `}</style>
    </Modal>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
