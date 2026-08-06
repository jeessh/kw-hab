"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, listMembers, type MemberAccount } from "@/lib/api";
import { AdminShell } from "@/components/AdminShell";
import { EmptyRow, Pill, TableCard, inputClass } from "@/components/AdminTable";
import { emojiFor } from "@/lib/icons";

export default function MembersPage() {
  return (
    <AdminShell
      title="Members"
      description="Community members who have signed up. Read-only."
      requireSuperadmin
    >
      {() => <MembersTable />}
    </AdminShell>
  );
}

function MembersTable() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    listMembers()
      .then((rows) => {
        if (alive) setMembers(rows);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/host");
          return;
        }
        setLoadError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.first_name} ${m.last_name} ${m.username}`.toLowerCase().includes(q),
    );
  }, [members, search]);

  return (
    <>
      <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 sm:max-w-sm">
        <label
          htmlFor="m-search"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Search
        </label>
        <input
          id="m-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name…"
          className={inputClass}
        />
      </div>

      <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-600">
        {loading
          ? "Loading members…"
          : `Showing ${filtered.length} of ${members.length} ${
              members.length === 1 ? "member" : "members"
            }`}
      </p>

      {loadError ? (
        <p role="alert" className="mt-6 font-medium text-red-600">
          Couldn&apos;t load members. Please refresh and try again.
        </p>
      ) : (
        <div className="mt-3">
          <TableCard
            caption="Community member accounts, their interests, and accessibility settings."
            head={["Member", "Sign-in key", "Interests", "Accessibility"]}
          >
            {loading ? (
              <EmptyRow colSpan={4} text="Loading…" />
            ) : filtered.length === 0 ? (
              <EmptyRow
                colSpan={4}
                text={
                  members.length === 0
                    ? "No members have signed up yet."
                    : "No members match that search."
                }
              />
            ) : (
              filtered.map((m) => {
                const modes = [
                  m.tts_enabled && "Read aloud",
                  m.voice_commands_enabled && "Voice",
                  m.eye_tracking_enabled && "Head tracking",
                ].filter(Boolean) as string[];
                return (
                  <tr key={m.id} className="align-top hover:bg-slate-50">
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-semibold text-slate-900"
                    >
                      {m.first_name} {m.last_name}
                    </th>
                    <td className="px-4 py-3">
                      {/* The icons ARE the credential, so never render the
                          slugs as text — the emoji alone is enough for staff to
                          help someone recognise their own key. */}
                      <span className="text-lg" aria-hidden>
                        {m.icons.map((s) => emojiFor(s)).join(" ")}
                      </span>
                      <span className="sr-only">
                        {m.icons.length} picture key
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.interest_categories.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {m.interest_categories.map((c) => (
                            <Pill key={c}>{c}</Pill>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {modes.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {modes.map((mode) => (
                            <Pill key={mode} tone="good">
                              {mode}
                            </Pill>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </TableCard>
        </div>
      )}
    </>
  );
}
