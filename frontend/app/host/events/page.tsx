"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, api, apiMessage, type Event, type Session } from "@/lib/api";
import { AdminShell } from "@/components/AdminShell";
import { EditEventModal } from "@/components/EditEventModal";
import { SearchBox } from "@/components/member/GridFeed";
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
  undo: () => Promise<void>;
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

  const shown = useMemo(
    () => applyHostFilters(events, filters, query),
    [events, filters, query],
  );

  async function confirmDelete() {
    const ev = deleting;
    if (!ev) return;
    setDeleting(null);
    setError(null);
    try {
      await api(`/events/${ev.id}`, { method: "DELETE" });
      await load();
      setToast({
        message: `'${ev.title}' was successfully deleted.`,
        tone: "deleted",
        undo: async () => {
          await api(`/events/${ev.id}/restore`, { method: "POST" });
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
          undo: async () => {},
        }),
      )
      .catch(() => window.prompt("Copy this link:", url));
  }

  return (
    <div className="min-h-dvh bg-white">
    <div className="mx-auto w-full max-w-[1500px] px-8 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SearchBox value={query} onChange={setQuery} />
        <div className="text-right">
          <p className="text-sm font-medium uppercase tracking-wide text-muted">
            {isSuper ? "KWHab administrative access" : "Administrative access"}
          </p>
          <p className="mt-1 inline-flex items-center gap-2 text-lg text-ink">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-[#E8318A] text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="9" r="3.4" fill="currentColor" />
                <path
                  d="M5.5 19c1.4-3 4-4.4 6.5-4.4S17.1 16 18.5 19"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            {organization || "Signed in"}
          </p>
        </div>
      </div>

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
                  // Editing stays with whoever owns the program; removal is a
                  // KW Hab decision once anyone has saved it.
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
          onSaved={() => {
            setEditing(null);
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
          onUndo={() => {
            const t = toast;
            setToast(null);
            void t.undo().catch(() =>
              setError("Couldn't undo that. Please refresh."),
            );
          }}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
    </div>
  );
}
