"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api, apiMessage } from "@/lib/api";
import { AdminShell } from "@/components/AdminShell";
import {
  EMPTY_FORM,
  EventForm,
  payloadFrom,
  type EventFormValues,
} from "@/components/host/EventForm";

export default function NewProgramPage() {
  return (
    <AdminShell title="Create a new event" bare>
      {() => <NewProgramForm />}
    </AdminShell>
  );
}

function NewProgramForm() {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>(EMPTY_FORM);
  const [organization, setOrganization] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whose name this goes out under. Worth stating plainly on a shared console:
  // a superadmin posting for one agency shouldn't have to infer it.
  useEffect(() => {
    api<{ name: string }>("/hosts/me")
      .then((h) => setOrganization(h.name))
      .catch(() => {});
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/events", {
        method: "POST",
        body: JSON.stringify(payloadFrom(values)),
      });
      router.push(`/host/events?created=${created.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/host");
        return;
      }
      setError(
        apiMessage(e, "Couldn't post that event. Check the fields and retry."),
      );
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-8 py-8">
      <Link
        href="/host/events"
        aria-label="Back to posted events"
        className="inline-block text-3xl text-ink transition-transform hover:-translate-x-1"
      >
        ←
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display text-5xl font-extrabold text-ink">
          Create a new event
        </h1>
        {organization && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
            Posting under {organization}
          </p>
        )}
      </div>

      <div className="mt-4">
        <EventForm
          values={values}
          onChange={setValues}
          organization={organization}
          submitting={busy}
          submitLabel="Post Event"
          onSubmit={() => void submit()}
          onClear={() => setValues(EMPTY_FORM)}
          error={error}
        />
      </div>
    </div>
  );
}
