"use client";

import { useState } from "react";
import { api, apiMessage, type Event } from "@/lib/api";
import { Modal } from "@/components/Modal";
import {
  EventForm,
  payloadFrom,
  valuesFromEvent,
  type EventFormValues,
} from "@/components/host/EventForm";

/**
 * Editing is the create form.
 *
 * They used to be two forms that disagreed: edit offered a free-text category,
 * dropped the gallery and the accessibility tags, and couldn't reach half the
 * fields create could set. Two forms with different ideas of what a program
 * needs is exactly how a standardized listing format stops being standard.
 */
export function EditEventModal({
  event,
  onClose,
  onSaved,
}: {
  event: Event;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<EventFormValues>(() =>
    valuesFromEvent(event),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify(payloadFrom(values)),
      });
      onSaved();
    } catch (e) {
      setError(apiMessage(e, "Couldn't save this event. Please try again."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit event" onClose={onClose}>
      <div className="mt-4 max-h-[70vh] overflow-y-auto pr-2">
        <EventForm
          values={values}
          onChange={setValues}
          organization={event.host_name}
          submitting={busy}
          submitLabel="Save changes"
          onSubmit={() => void save()}
          onClear={() => setValues(valuesFromEvent(event))}
          error={error}
        />
      </div>
    </Modal>
  );
}
