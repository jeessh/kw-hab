"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ApiError,
  api,
  apiMessage,
  createMember,
  deleteMember,
  listMembers,
  updateMember,
  type MemberAccount,
} from "@/lib/api";
import { AdminShell } from "@/components/AdminShell";
import { ConsoleHeader } from "@/components/host/ConsoleHeader";
import { Button, EmptyRow, Field, TableCard, inputClass } from "@/components/AdminTable";
import { Modal } from "@/components/Modal";
import { emojiFor } from "@/lib/icons";
import { CYAN } from "@/components/host/PostedEvents";

/**
 * Everyone with an account, in two tabs.
 *
 * Organizers and community members are different enough that one table would
 * have to hedge on every column — one has an email and an access level, the
 * other has an icon key and no way to be contacted at all.
 */
export default function UsersPage() {
  return (
    <AdminShell title="Users" requireSuperadmin bare>
      {() => <UsersTabs />}
    </AdminShell>
  );
}

function UsersTabs() {
  const [tab, setTab] = useState<"members" | "admins">("members");
  const [organization, setOrganization] = useState("");

  useEffect(() => {
    api<{ name: string }>("/hosts/me")
      .then((h) => setOrganization(h.name))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-dvh bg-white">
    <div className="mx-auto w-full max-w-[1500px] px-8 py-6">
      <ConsoleHeader isSuper organization={organization} />

      <h1 className="mb-6 mt-12 font-display text-5xl font-extrabold text-ink">
        Users
      </h1>
      <div
        role="tablist"
        aria-label="Account type"
        className="inline-flex items-center gap-1 rounded-full bg-[#E7E5EC] p-1"
      >
        {(
          [
            ["members", "Community Members"],
            ["admins", "Organizers"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-full px-5 py-2 text-base font-medium text-ink transition-colors ${
              tab === value ? "bg-white shadow-sm" : "hover:bg-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "members" ? (
          <MembersTab />
        ) : (
          <p className="text-slate-600">
            Organizer accounts live on their own page, where removing one also
            has to say what happens to its programs.{" "}
            <Link
              href="/host/admins"
              className="font-semibold text-accent underline underline-offset-2"
            >
              Open organizers
            </Link>
          </p>
        )}
      </div>
    </div>
    </div>
  );
}

function MembersTab() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MemberAccount | null>(null);
  const [removing, setRemoving] = useState<MemberAccount | null>(null);
  const [newKey, setNewKey] = useState<{ name: string; icons: string[] } | null>(
    null,
  );

  async function load() {
    setLoading(true);
    try {
      setMembers(await listMembers());
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

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(q),
    );
  }, [members, search]);

  async function remove() {
    const m = removing;
    if (!m) return;
    setRemoving(null);
    setError(null);
    try {
      await deleteMember(m.id);
      setNotice(`Removed ${m.first_name} ${m.last_name}.`);
      await load();
    } catch (e) {
      setError(apiMessage(e, "Couldn't remove that account."));
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
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
        <Button
          tone="primary"
          onClick={() => {
            setNotice("");
            setAdding(true);
          }}
        >
          Add member
        </Button>
      </div>

      <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-600">
        {loading
          ? "Loading members…"
          : notice ||
            `${shown.length} of ${members.length} ${
              members.length === 1 ? "member" : "members"
            }`}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="mt-6 font-medium text-red-600">
          Couldn&apos;t load members. Please refresh and try again.
        </p>
      ) : (
        <div className="mt-3">
          <TableCard
            caption="Community member accounts and their sign-in keys."
            head={["Name", "Sign-in key", "Joined", "Actions"]}
          >
            {loading ? (
              <EmptyRow colSpan={4} text="Loading…" />
            ) : shown.length === 0 ? (
              <EmptyRow
                colSpan={4}
                text={
                  members.length === 0
                    ? "No members yet."
                    : "No members match that."
                }
              />
            ) : (
              shown.map((m) => (
                <tr key={m.id} className="align-top hover:bg-slate-50">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-semibold text-slate-900"
                  >
                    {m.first_name} {m.last_name}
                  </th>
                  <td className="px-4 py-3 text-2xl">
                    <span aria-hidden>
                      {m.icons.map((i) => emojiFor(i)).join(" ")}
                    </span>
                    <span className="sr-only">{m.icons.join(", ")}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setEditing(m)}>
                        Edit<span className="sr-only"> {m.first_name}</span>
                      </Button>
                      <Button tone="danger" onClick={() => setRemoving(m)}>
                        Remove<span className="sr-only"> {m.first_name}</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </TableCard>
        </div>
      )}

      {adding && (
        <AddMemberModal
          onClose={() => setAdding(false)}
          onCreated={(name, icons) => {
            setAdding(false);
            setNewKey({ name, icons });
            void load();
          }}
        />
      )}

      {newKey && (
        <Modal title="Write this down" onClose={() => setNewKey(null)}>
          <p className="mt-2 text-lg text-ink">
            {newKey.name} signs in with their name and these three icons, in
            this order.
          </p>
          <p className="mt-4 text-center text-5xl" aria-hidden>
            {newKey.icons.map((i) => emojiFor(i)).join(" ")}
          </p>
          <p className="sr-only">{newKey.icons.join(", ")}</p>
          <p className="mt-4 text-base text-muted">
            There is no way to look these up again — if they&apos;re lost the
            account has to be replaced.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              onClick={() => setNewKey(null)}
              className="rounded-lg px-5 py-2.5 font-display text-lg font-semibold text-ink"
              style={{ background: CYAN }}
            >
              Done
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <EditMemberModal
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setNotice(`Updated ${name}.`);
            void load();
          }}
        />
      )}

      {removing && (
        <Modal title={`Remove ${removing.first_name}?`} onClose={() => setRemoving(null)}>
          <p className="mt-2 text-lg text-ink">
            They won&apos;t be able to sign in. Their saved programs stay
            counted for the organizations that ran them.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button tone="danger" onClick={() => void remove()}>
              Remove
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AddMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string, icons: string[]) => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await createMember({
        first_name: first.trim(),
        last_name: last.trim(),
      });
      onCreated(`${created.first_name} ${created.last_name}`, created.icons);
    } catch (e) {
      setError(apiMessage(e, "Couldn't create that account."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a member" onClose={onClose}>
      <p className="mt-1 text-base text-muted">
        For setting someone up in person. The three-icon key is generated and
        shown once.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Field label="First name" htmlFor="nm-first">
          <input
            id="nm-first"
            autoFocus
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Last name" htmlFor="nm-last">
          <input
            id="nm-last"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={busy || !first.trim() || !last.trim()}
          onClick={() => void submit()}
        >
          {busy ? "Creating…" : "Create"}
        </Button>
      </div>
    </Modal>
  );
}

function EditMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: MemberAccount;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [first, setFirst] = useState(member.first_name);
  const [last, setLast] = useState(member.last_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await updateMember(member.id, {
        first_name: first.trim(),
        last_name: last.trim(),
      });
      onSaved(`${first.trim()} ${last.trim()}`);
    } catch (e) {
      setError(apiMessage(e, "Couldn't save that."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit member" onClose={onClose}>
      <div className="mt-4 flex flex-col gap-4">
        <Field label="First name" htmlFor="em-first">
          <input
            id="em-first"
            autoFocus
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Last name" htmlFor="em-last">
          <input
            id="em-last"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {/* The icon key isn't editable: it IS the password, and changing it here
          would lock the member out with nothing to tell them. */}
      <p className="mt-3 text-sm text-slate-600">
        The sign-in icons can&apos;t be changed — they&apos;re the password.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={busy || !first.trim() || !last.trim()}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
