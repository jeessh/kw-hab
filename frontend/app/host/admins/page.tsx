"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  apiMessage,
  createAdmin,
  deleteAdmin,
  listAdmins,
  updateAdmin,
  type AdminAccount,
  type Session,
} from "@/lib/api";
import { AdminShell } from "@/components/AdminShell";
import {
  Button,
  EmptyRow,
  Field,
  Pill,
  TableCard,
  inputClass,
} from "@/components/AdminTable";
import { Modal } from "@/components/Modal";

export default function AdminsPage() {
  return (
    <AdminShell
      title="Admins"
      description="Organizer accounts. Only superadmins can manage this list."
      requireSuperadmin
    >
      {(session) => <AdminsTable session={session} />}
    </AdminShell>
  );
}

function AdminsTable({ session }: { session: Session }) {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const myId = session.id ?? null;

  async function load() {
    setLoading(true);
    try {
      setAdmins(await listAdmins());
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

  async function setAccess(admin: AdminAccount, makeSuper: boolean) {
    setBusyId(admin.id);
    setError(null);
    try {
      await updateAdmin(admin.id, { is_admin: makeSuper });
      setNotice(
        `${admin.name} is now ${makeSuper ? "a superadmin" : "an admin"}.`,
      );
      await load();
    } catch (e) {
      setError(
        apiMessage(e, "Couldn't change that account. Please try again."),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-sm text-slate-600">
          {loading
            ? "Loading admins…"
            : notice ||
              `${admins.length} ${admins.length === 1 ? "account" : "accounts"}`}
        </p>
        <Button tone="primary" onClick={() => setAdding(true)}>
          Add admin
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="mt-6 font-medium text-red-600">
          Couldn&apos;t load admins. Please refresh and try again.
        </p>
      ) : (
        <div className="mt-3">
          <TableCard
            caption="Organizer accounts, their access level, and how many programs each owns."
            head={["Name", "Email", "Access", "Programs", "Actions"]}
          >
            {loading ? (
              <EmptyRow colSpan={5} text="Loading…" />
            ) : admins.length === 0 ? (
              <EmptyRow colSpan={5} text="No admin accounts yet." />
            ) : (
              admins.map((a) => {
                const isMe = a.id === myId;
                const busy = busyId === a.id;
                return (
                  <tr key={a.id} className="align-top hover:bg-slate-50">
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-semibold text-slate-900"
                    >
                      {a.name}
                      {isMe && (
                        <span className="ml-2">
                          <Pill tone="good">You</Pill>
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3 text-slate-600">{a.email}</td>
                    <td className="px-4 py-3">
                      {a.is_admin ? (
                        <Pill tone="warn">Superadmin</Pill>
                      ) : (
                        <Pill>Admin</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.event_count}
                    </td>
                    <td className="px-4 py-3">
                      {isMe ? (
                        // The API refuses self-demotion and self-deletion —
                        // that refusal is what guarantees at least one
                        // superadmin always remains. Say so instead of
                        // offering buttons that will fail.
                        <span className="text-xs text-slate-500">
                          You can&apos;t change your own account
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={busy}
                            onClick={() => void setAccess(a, !a.is_admin)}
                          >
                            {a.is_admin ? "Make admin" : "Make superadmin"}
                            <span className="sr-only"> — {a.name}</span>
                          </Button>
                          <Button
                            tone="danger"
                            disabled={busy}
                            onClick={() => setRemoving(a)}
                          >
                            Remove<span className="sr-only"> {a.name}</span>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </TableCard>
        </div>
      )}

      {adding && (
        <AddAdminModal
          onClose={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice(`Added ${name}.`);
            void load();
          }}
        />
      )}
      {removing && (
        <RemoveAdminModal
          admin={removing}
          onClose={() => setRemoving(null)}
          onRemoved={(name, moved) => {
            setRemoving(null);
            setNotice(
              moved > 0
                ? `Removed ${name}. ${moved} ${
                    moved === 1 ? "program" : "programs"
                  } moved to you.`
                : `Removed ${name}.`,
            );
            void load();
          }}
        />
      )}
    </>
  );
}

function AddAdminModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSuper, setIsSuper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim() && email.trim() && password.length >= 8;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await createAdmin({
        name: name.trim(),
        email: email.trim(),
        password,
        is_admin: isSuper,
      });
      onCreated(name.trim());
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("That email already has an account.");
      } else if (e instanceof ApiError && e.status === 422) {
        setError("Check the email address and use at least 8 characters.");
      } else {
        setError("Couldn't create that account. Please try again.");
      }
      setBusy(false);
    }
  }

  return (
    <Modal title="Add an admin" onClose={onClose}>
      <p className="mt-1 text-sm text-slate-600">
        They sign in with this email and password. Share the password with them
        directly and ask them to change it.
      </p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void submit();
        }}
      >
        <Field label="Organization or person" htmlFor="a-name">
          <input
            id="a-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email" htmlFor="a-email">
          <input
            id="a-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Temporary password"
          htmlFor="a-password"
          hint="At least 8 characters."
        >
          <input
            id="a-password"
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>

        <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={isSuper}
            onChange={(e) => setIsSuper(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm">
            <span className="font-semibold text-slate-900">
              Can manage other admins
            </span>
            <span className="block text-slate-600">
              Superadmins can add and remove admins, and edit any program — not
              just their own.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" tone="primary" disabled={!valid || busy}>
            {busy ? "Adding…" : "Add admin"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RemoveAdminModal({
  admin,
  onClose,
  onRemoved,
}: {
  admin: AdminAccount;
  onClose: () => void;
  onRemoved: (name: string, moved: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await deleteAdmin(admin.id);
      onRemoved(admin.name, admin.event_count);
    } catch (e) {
      setError(
        apiMessage(e, "Couldn't remove that account. Please try again."),
      );
      setBusy(false);
    }
  }

  return (
    <Modal title={`Remove ${admin.name}?`} onClose={onClose}>
      <p className="mt-2 text-sm text-slate-700">
        This account will no longer be able to sign in.
      </p>
      {admin.event_count > 0 ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Their{" "}
          <strong>
            {admin.event_count}{" "}
            {admin.event_count === 1 ? "program" : "programs"}
          </strong>{" "}
          will move to your account and stay visible to members. Nothing is
          deleted from the feed.
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          They don&apos;t own any programs.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button tone="danger" disabled={busy} onClick={() => void submit()}>
          {busy ? "Removing…" : "Remove account"}
        </Button>
      </div>
    </Modal>
  );
}
