"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, api, apiMessage, type Event, type Session } from "@/lib/api";
import { oneCardPerProgram } from "@/lib/feed";
import { AdminShell } from "@/components/AdminShell";
import { EditEventModal } from "@/components/EditEventModal";
import { ConsoleHeader } from "@/components/host/ConsoleHeader";
import {
  ConfirmDelete,
  CYAN,
  FilterPanel,
  NO_HOST_FILTERS,
  PostedEventCard,
  UndoToast,
  applyHostFilters,
  type HostFilters,
} from "@/components/host/PostedEvents";

export default function ProgramsPage() {
  return (
    <AdminShell title="Posted Events" bare>
      {(session) => (
        <Suspense fallback={null}>
          <PostedEventsPage session={session} />
        </Suspense>
      )}
    </AdminShell>
  );
}

type Toast = {
  message: string;
  tone: "posted" | "deleted";
  /** Absent when there is nothing to undo — a copied link, a saved edit. */
  undo?: () => Promise<void>;
};

function PostedEventsPage({ session }: { session: Session }) {
  const router = useRouter();
  const params = useSearchParams();
  const [justCreated] = useState<string | null>(() => params.get("created"));

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<HostFilters>(NO_HOST_FILTERS);
  const [editing, setEditing] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState<Event | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState("");

  const isSuper = !!session.is_admin;

  async function load() {
    setLoading(true);
    try {
      const PAGE = 200;
      const all: Event[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await api<Event[]>(`/events?limit=${PAGE}&offset=${offset}`);
        all.push(...page);
        if (page.length < PAGE) break;
      }
      setEvents(all);
      setLoadError(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/host");
        return;
      }
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    api<{ name: string }>("/hosts/me")
      .then((h) => setOrganization(h.name))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving from the create form: confirm it, and offer the way back.
  useEffect(() => {
    if (!justCreated) return;
    const rest = new URLSearchParams(params);
    rest.delete("created");
    const q = rest.toString();
    router.replace(q ? `/host/events?${q}` : "/host/events");
    api<Event>(`/events/${justCreated}`)
      .then((ev) => {
        setToast({
          message: `'${ev.title}' was successfully posted.`,
          tone: "posted",
          undo: async () => {
            await api(`/events/${ev.id}`, { method: "DELETE" });
            await load();
          },
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCreated]);

  const orgs = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) if (ev.host_name) set.add(ev.host_name);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [events]);

  // One row per program, not one per date.
  //
  // A weekly program is stored as a dated row per occurrence, so a console
  // listing every row showed "Open Space: Coffee & Chats" sixteen times in a
  // column and buried every other program under it. Staff manage the program;
  // the dates are how it runs. Filters and search apply first, so a filter that
  // matches only some dates still surfaces the program.
  const shown = useMemo(
    () => oneCardPerProgram(applyHostFilters(events, filters, query)),
    [events, filters, query],
  );

  // How many live dates each program has, for the count on its card.
  const datesBySeries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of events) {
      const key = ev.series_id ?? ev.id;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  async function confirmDelete() {
    const ev = deleting;
    if (!ev) return;
    setDeleting(null);
    setError(null);
    try {
      // series=true: the card is the program, so removing it removes the run.
      // Archiving only the date that happened to be on the card would leave
      // the other fifteen live with nothing on screen to say so.
      await api(`/events/${ev.id}?series=true`, { method: "DELETE" });
      await load();
      setToast({
        message: `'${ev.title}' was successfully deleted.`,
        tone: "deleted",
        undo: async () => {
          await api(`/events/${ev.id}/restore?series=true`, { method: "POST" });
          await load();
        },
      });
    } catch (e) {
      setError(apiMessage(e, "Couldn't remove that event."));
    }
  }

  function share(ev: Event) {
    const url = `${window.location.origin}/events/${ev.id}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() =>
        setToast({
          message: "Link copied. Paste it wherever you're sharing.",
          tone: "posted",
        }),
      )
      .catch(() => window.prompt("Copy this link:", url));
  }

  return (
    <div className="min-h-dvh bg-white">
    <div className="mx-auto w-full max-w-[1500px] px-8 py-6">
      <ConsoleHeader
        isSuper={isSuper}
        organization={organization}
        query={query}
        onQuery={setQuery}
      />

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-5xl font-extrabold text-ink">
          Posted Events
        </h1>
        <Link
          href="/host/events/new"
          className="rounded-lg px-5 py-3 font-display text-lg font-semibold text-ink transition-transform hover:scale-[1.02]"
          style={{ background: CYAN }}
        >
          + Create new event
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-4 font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-start gap-8">
        <FilterPanel orgs={orgs} filters={filters} onChange={setFilters} />

        <div className="min-w-[380px] flex-1">
          <p role="status" aria-live="polite" className="sr-only">
            {loading
              ? "Loading events"
              : `${shown.length} of ${events.length} events shown`}
          </p>

          {loadError ? (
            <p role="alert" className="font-medium text-red-600">
              Couldn&apos;t load events. Please refresh and try again.
            </p>
          ) : loading ? (
            <p className="text-muted">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-lg text-muted">
              {events.length === 0
                ? "Nothing posted yet. Create your first event."
                : "Nothing matches those filters."}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {shown.map((ev) => (
                <PostedEventCard
                  key={ev.id}
                  event={ev}
                  dateCount={datesBySeries.get(ev.series_id ?? ev.id)}
                  // Editing stays with whoever owns the program; removal is a
                  // KW Hab decision once anyone has saved it.
                  // Admins manage their own programming; superadmins manage
                  // anyone's. The API enforces both — this keeps the console
                  // from offering buttons that would be refused.
                  canEdit={isSuper || ev.host_id === session.id}
                  canDelete={isSuper || ev.host_id === session.id}
                  onEdit={setEditing}
                  onShare={share}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditEventModal
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={(title: string) => {
            setEditing(null);
            // Editing was the one action here that confirmed nothing. Staff
            // pressed Save and the table simply redrew, which reads the same
            // as a save that silently failed.
            setToast({
              message: `'${title}' was successfully updated.`,
              tone: "posted",
            });
            void load();
          }}
        />
      )}

      {deleting && (
        <ConfirmDelete
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}

      {toast && (
        <UndoToast
          message={toast.message}
          tone={toast.tone}
          onUndo={
            toast.undo &&
            (() => {
              const undo = toast.undo;
              setToast(null);
              void undo?.().catch(() =>
                setError("Couldn't undo that. Please refresh."),
              );
            })
          }
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
    </div>
  );
}
