"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api, logout, type Event } from "@/lib/api";
import { whenLabel } from "@/lib/time";
import { EditEventModal } from "@/components/EditEventModal";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";

type View = "list" | "card";
type Cost = "all" | "free" | "paid";

export default function HostDashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [view, setView] = useState<View>("list");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cost, setCost] = useState<Cost>("all");

  const [editing, setEditing] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState<Event | null>(null);

  // The feed is paginated (max 200/page); page through so the dashboard
  // always has every event, not just the first page.
  async function fetchAllEvents(): Promise<Event[]> {
    const PAGE = 200;
    const all: Event[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await api<Event[]>(`/events?limit=${PAGE}&offset=${offset}`);
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  }

  async function load() {
    const [me, evs] = await Promise.all([
      api<{ is_admin: boolean; id: string }>("/auth/me"),
      fetchAllEvents(),
    ]);
    setIsAdmin(me.is_admin);
    setMyId(me.id);
    setEvents(evs);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/host");
      else {
        setLoadError(true);
        setLoading(false);
      }
    });
  }, [router]);

  const canManage = (ev: Event) => isAdmin || ev.host_id === myId;

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) if (ev.category) set.add(ev.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (category !== "all" && ev.category !== category) return false;
      if (cost === "free" && !ev.is_free) return false;
      if (cost === "paid" && ev.is_free) return false;
      if (q) {
        const haystack = [ev.title, ev.description, ev.location, ev.host_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, category, cost]);

  async function doLogout() {
    try {
      await logout();
    } catch {
      /* clear the session client-side regardless */
    }
    router.replace("/host");
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">
            Programs dashboard
          </h1>
          <p className="mt-1 text-muted">
            {isAdmin
              ? "As an admin, you can edit or remove any program."
              : "Manage the programs your organization runs."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/host/events/new"
            className="rounded-xl bg-accent px-5 py-3 font-semibold text-white transition-transform hover:scale-[1.02] focus-visible:scale-[1.02]"
          >
            + Add program
          </Link>
          <button
            onClick={doLogout}
            className="rounded-xl border-2 border-edge px-5 py-3 font-semibold text-muted transition-colors hover:border-pop hover:text-pop"
          >
            Log out
          </button>
        </div>
      </header>

      <Toolbar
        view={view}
        onView={setView}
        search={search}
        onSearch={setSearch}
        category={category}
        onCategory={setCategory}
        categories={categories}
        cost={cost}
        onCost={setCost}
      />

      <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">
        {loading
          ? "Loading programs…"
          : `Showing ${filtered.length} of ${events.length} ${
              events.length === 1 ? "program" : "programs"
            }`}
      </p>

      {loadError ? (
        <p role="alert" className="mt-10 font-semibold text-pop">
          Couldn&apos;t load programs. Please refresh and try again.
        </p>
      ) : loading ? (
        <p className="mt-10 text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <EmptyState
          heading="No programs yet"
          body="Add your first program to see it here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          heading="No matches"
          body="No programs match your filters. Try clearing the search or filters."
        />
      ) : view === "list" ? (
        <ListView
          events={filtered}
          myId={myId}
          canManage={canManage}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
      ) : (
        <CardView
          events={filtered}
          myId={myId}
          canManage={canManage}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
      )}

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
        <DeleteConfirmModal
          event={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void load();
          }}
        />
      )}
    </main>
  );
}

/* ---------------- toolbar ---------------- */

function Toolbar({
  view,
  onView,
  search,
  onSearch,
  category,
  onCategory,
  categories,
  cost,
  onCost,
}: {
  view: View;
  onView: (v: View) => void;
  search: string;
  onSearch: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  categories: string[];
  cost: Cost;
  onCost: (v: Cost) => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-card">
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <label htmlFor="dash-search" className="text-sm font-semibold text-muted">
          Search
        </label>
        <input
          id="dash-search"
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Title, place, organization…"
          className="rounded-xl border-2 border-edge bg-white px-4 py-2.5 text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="dash-category"
          className="text-sm font-semibold text-muted"
        >
          Category
        </label>
        <select
          id="dash-category"
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          className="rounded-xl border-2 border-edge bg-white px-4 py-2.5 text-ink outline-none focus:border-accent"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="dash-cost" className="text-sm font-semibold text-muted">
          Cost
        </label>
        <select
          id="dash-cost"
          value={cost}
          onChange={(e) => onCost(e.target.value as Cost)}
          className="rounded-xl border-2 border-edge bg-white px-4 py-2.5 text-ink outline-none focus:border-accent"
        >
          <option value="all">Free &amp; paid</option>
          <option value="free">Free only</option>
          <option value="paid">Paid only</option>
        </select>
      </div>

      <div
        role="group"
        aria-label="Choose how to view programs"
        className="flex flex-col gap-1.5"
      >
        <span className="text-sm font-semibold text-muted">View</span>
        <div className="flex rounded-xl border-2 border-edge p-1">
          <ViewButton
            active={view === "list"}
            onClick={() => onView("list")}
            label="List view"
          >
            List
          </ViewButton>
          <ViewButton
            active={view === "card"}
            onClick={() => onView("card")}
            label="Card view"
          >
            Cards
          </ViewButton>
        </div>
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`rounded-lg px-4 py-1.5 font-semibold transition-colors ${
        active ? "bg-accent text-white" : "text-muted hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- shared bits ---------------- */

function YouBadge() {
  return (
    <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
      You
    </span>
  );
}

function CostPill({ free }: { free: boolean }) {
  return free ? (
    <span className="rounded-full bg-attend/15 px-2.5 py-0.5 text-sm font-semibold text-attend">
      Free
    </span>
  ) : (
    <span className="rounded-full bg-edge px-2.5 py-0.5 text-sm font-semibold text-ink">
      Paid
    </span>
  );
}

function RowActions({
  ev,
  canManage,
  onEdit,
  onDelete,
}: {
  ev: Event;
  canManage: boolean;
  onEdit: (e: Event) => void;
  onDelete: (e: Event) => void;
}) {
  if (!canManage) {
    return <span className="text-sm text-muted">View only</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onEdit(ev)}
        className="rounded-lg border-2 border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent hover:text-white"
      >
        Edit
        <span className="sr-only"> {ev.title}</span>
      </button>
      <button
        onClick={() => onDelete(ev)}
        className="rounded-lg border-2 border-pop px-3 py-1.5 text-sm font-semibold text-pop hover:bg-pop hover:text-white"
      >
        Delete
        <span className="sr-only"> {ev.title}</span>
      </button>
    </div>
  );
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="mt-10 rounded-2xl bg-white p-10 text-center shadow-card">
      <h2 className="font-display text-2xl font-bold text-ink">{heading}</h2>
      <p className="mt-2 text-muted">{body}</p>
    </div>
  );
}

/* ---------------- list view ---------------- */

function ListView({
  events,
  myId,
  canManage,
  onEdit,
  onDelete,
}: {
  events: Event[];
  myId: string | null;
  canManage: (e: Event) => boolean;
  onEdit: (e: Event) => void;
  onDelete: (e: Event) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-card">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Community programs, with owner and management actions.
        </caption>
        <thead>
          <tr className="border-b-2 border-edge text-sm text-muted">
            <th scope="col" className="px-4 py-3 font-semibold">
              Program
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              When
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Category
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Owner
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Cost
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const mine = ev.host_id === myId;
            return (
              <tr
                key={ev.id}
                className="border-b border-edge align-top last:border-0"
              >
                <th scope="row" className="px-4 py-3 font-semibold text-ink">
                  {ev.title}
                  {ev.location && (
                    <span className="block text-sm font-normal text-muted">
                      {ev.location}
                    </span>
                  )}
                </th>
                <td className="px-4 py-3 text-muted">
                  {whenLabel(ev.starts_at) || "Date to be announced"}
                </td>
                <td className="px-4 py-3 text-muted">{ev.category || "—"}</td>
                <td className="px-4 py-3 text-ink">
                  {ev.host_name || "—"}
                  {mine && <YouBadge />}
                </td>
                <td className="px-4 py-3">
                  <CostPill free={ev.is_free} />
                </td>
                <td className="px-4 py-3">
                  <RowActions
                    ev={ev}
                    canManage={canManage(ev)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- card view ---------------- */

function CardView({
  events,
  myId,
  canManage,
  onEdit,
  onDelete,
}: {
  events: Event[];
  myId: string | null;
  canManage: (e: Event) => boolean;
  onEdit: (e: Event) => void;
  onDelete: (e: Event) => void;
}) {
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((ev) => {
        const mine = ev.host_id === myId;
        return (
          <li
            key={ev.id}
            className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-card"
          >
            {ev.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ev.cover_image_url}
                alt=""
                className="h-32 w-full object-cover"
              />
            )}
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-xl font-bold text-ink">
                  {ev.title}
                </h2>
                <CostPill free={ev.is_free} />
              </div>
              <p className="text-sm text-muted">
                {whenLabel(ev.starts_at) || "Date to be announced"}
                {ev.location ? ` · ${ev.location}` : ""}
              </p>
              <p className="text-sm text-ink">
                {ev.category && (
                  <span className="mr-2 rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-muted">
                    {ev.category}
                  </span>
                )}
                <span className="text-muted">{ev.host_name || "—"}</span>
                {mine && <YouBadge />}
              </p>
              <div className="mt-auto pt-2">
                <RowActions
                  ev={ev}
                  canManage={canManage(ev)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
