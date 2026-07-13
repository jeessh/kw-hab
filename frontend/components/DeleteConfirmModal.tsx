"use client";

import { useState } from "react";
import { api, type Event } from "@/lib/api";
import { Modal } from "@/components/Modal";

export function DeleteConfirmModal({
  event,
  onClose,
  onDeleted,
}: {
  event: Event;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(`/events/${event.id}`, { method: "DELETE" });
      onDeleted();
    } catch {
      setError("Couldn't delete this program. You may not have permission.");
      setBusy(false);
    }
  }

  return (
    <Modal title={`Delete “${event.title}”?`} onClose={onClose}>
      <p className="mt-3 text-lg text-ink">
        This permanently removes the program and everyone&apos;s attendance for
        it. This cannot be undone.
      </p>

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
          onClick={confirm}
          disabled={busy}
          className="rounded-xl bg-pop px-6 py-3 font-semibold text-white transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete program"}
        </button>
      </div>
    </Modal>
  );
}
