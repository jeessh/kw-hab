"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, api, type Event, type Session } from "@/lib/api";
import { whenLabel } from "@/lib/time";
import { AdminShell } from "@/components/AdminShell";
import {
  Button,
  EmptyRow,
  Pill,
  TableCard,
  inputClass,
} from "@/components/AdminTable";
import { EditEventModal } from "@/components/EditEventModal";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { CopyLinkButton } from "@/components/CopyLinkButton";

type Cost = "all" | "free" | "paid";
type Owner = "all" | "mine";

export default function ProgramsPage() {
  return (
    <AdminShell
      title="Programs"
      description="Everything published to the member feed."
      actions={
        <Link
          href="/host/events/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Add program
        </Link>
      }
    >
      {(session) => (
        // useSearchParams needs a boundary; without one this page opts out of
        // static rendering entirely.
        <Suspense fallback={null}>
          <ProgramsTable session={session} />
        </Suspense>
      )}
    </AdminShell>
  );
}

function ProgramsTable({ session }: { session: Session }) {
  const router = useRouter();
  const params = useSearchParams();
  // Set once, on arrival from the create form. Held in state rather than read
  // from the URL each render so the confirmation survives clearing the param.
  const [justCreated] = useState<string | null>(() => params.get("created"));
  const [announcement, setAnnouncement] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cost, setCost] = useState<Cost>("all");
  const [owner, setOwner] = useState<Owner>("all");

  const [editing, setEditing] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState<Event | null>(null);

  const isSuper = !!session.is_admin;
  const myId = session.id ?? null;

  // The feed is paginated (max 200/page); page through so the console always
  // shows every program, not just the first page.
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
    setLoading(true);
    try {
      setEvents(await fetchAllEvents());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop ?created= once it's been read, so a refresh or a back-navigation
  // doesn't re-announce a program published minutes ago. Everything else on the
  // URL is preserved — stripping one param shouldn't discard the rest.
  useEffect(() => {
    if (!justCreated) return;
    setAnnouncement("Program published. A link to share it is at the top.");
    const rest = new URLSearchParams(params);
    rest.delete("created");
    const query = rest.toString();
    router.replace(query ? `/host/events?${query}` : "/host/events");
    // params is a fresh object each render; justCreated is captured once and is
    // the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCreated, router]);

  const canManage = (ev: Event) => isSuper || ev.host_id === myId;

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
      if (owner === "mine" && ev.host_id !== myId) return false;
      if (q) {
        const haystack = [ev.title, ev.description, ev.location, ev.host_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, category, cost, owner, myId]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label
            htmlFor="p-search"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Search
          </label>
          <input
            id="p-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, place, organization…"
            className={inputClass}
          />
        </div>
        <Select
          id="p-category"
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: "all", label: "All categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
        <Select
          id="p-cost"
          label="Cost"
          value={cost}
          onChange={(v) => setCost(v as Cost)}
          options={[
            { value: "all", label: "Free & paid" },
            { value: "free", label: "Free only" },
            { value: "paid", label: "Paid only" },
          ]}
        />
        <Select
          id="p-owner"
          label="Owner"
          value={owner}
          onChange={(v) => setOwner(v as Owner)}
          options={[
            { value: "all", label: "All organizations" },
            { value: "mine", label: "Mine only" },
          ]}
        />
      </div>

      {/* Announced through the always-present region below rather than by
          giving this box role="status" — a live region that appears with its
          content already in it often isn't read out. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {justCreated && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-semibold text-emerald-900">
            Published. Share it:
          </span>
          <CopyLinkButton eventId={justCreated} label="Copy link" />
          <Link
            href={`/events/${justCreated}`}
            className="text-sm font-semibold text-accent underline underline-offset-2"
          >
            View the page
          </Link>
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-600">
        {loading
          ? "Loading programs…"
          : `Showing ${filtered.length} of ${events.length} ${
              events.length === 1 ? "program" : "programs"
            }`}
      </p>

      {loadError ? (
        <p role="alert" className="mt-6 font-medium text-red-600">
          Couldn&apos;t load programs. Please refresh and try again.
        </p>
      ) : (
        <div className="mt-3">
          <TableCard
            caption="Community programs, with owner and management actions."
            head={[
              "Program",
              "When",
              "Category",
              "Organization",
              "Cost",
              "Actions",
            ]}
          >
            {loading ? (
              <EmptyRow colSpan={6} text="Loading…" />
            ) : filtered.length === 0 ? (
              <EmptyRow
                colSpan={6}
                text={
                  events.length === 0
                    ? "No programs yet. Add your first one."
                    : "No programs match these filters."
                }
              />
            ) : (
              filtered.map((ev) => {
                const mine = ev.host_id === myId;
                return (
                  <tr key={ev.id} className="align-top hover:bg-slate-50">
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-semibold text-slate-900"
                    >
                      {ev.title}
                      {ev.location && (
                        <span className="block text-xs font-normal text-slate-500">
                          {ev.location}
                        </span>
                      )}
                    </th>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {whenLabel(ev.starts_at) || "Date to be announced"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {ev.category || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {ev.host_name || "—"}
                      {mine && (
                        <span className="ml-2">
                          <Pill tone="good">You</Pill>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ev.is_free ? (
                        <Pill tone="good">Free</Pill>
                      ) : (
                        <Pill>Paid</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* Copy is offered for every program, not just your own:
                          the page is public either way, and cross-posting
                          another agency's program is the directory working. */}
                      <div className="flex flex-wrap gap-2">
                        <CopyLinkButton eventId={ev.id} title={ev.title} />
                        {canManage(ev) && (
                          <>
                            <Button onClick={() => setEditing(ev)}>
                              Edit<span className="sr-only"> {ev.title}</span>
                            </Button>
                            <Button
                              tone="danger"
                              onClick={() => setDeleting(ev)}
                            >
                              Delete<span className="sr-only"> {ev.title}</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </TableCard>
        </div>
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
    </>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
