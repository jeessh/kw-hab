"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  api,
  apiMessage,
  createAdmin,
  createInvite,
  listInvites,
  revokeInvite,
  type HostInvite,
  deleteAdmin,
  listAdmins,
  updateAdmin,
  type AdminAccount,
  type Session,
} from "@/lib/api";
import { AdminShell } from "@/components/AdminShell";
import { ConsoleHeader } from "@/components/host/ConsoleHeader";
import { CYAN } from "@/components/host/PostedEvents";
import { ImageDrop } from "@/components/ImageDrop";
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
    <AdminShell title="Organizations" requireSuperadmin bare>
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
  const [logoFor, setLogoFor] = useState<AdminAccount | null>(null);
  const [invites, setInvites] = useState<HostInvite[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<{ org: string; url: string } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const myId = session.id ?? null;
  const [organization, setOrganization] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [rows, pending] = await Promise.all([
        listAdmins(),
        listInvites().catch(() => [] as HostInvite[]),
      ]);
      setAdmins(rows);
      setInvites(pending);
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

  async function setAccess(admin: AdminAccount, makeSuper: boolean) {
    setBusyId(admin.id);
    setError(null);
    // Clear the previous action's message first, so the live region announces
    // this action rather than sitting on a stale one.
    setNotice("");
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
    <div className="min-h-dvh bg-white">
    <div className="mx-auto w-full max-w-[1500px] px-8 py-6">
      <ConsoleHeader isSuper organization={organization} />

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-5xl font-extrabold text-ink">
          Organizations
        </h1>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              setNotice("");
              setInviting(true);
            }}
            className="rounded-lg px-5 py-3 font-display text-lg font-semibold text-ink transition-transform hover:scale-[1.02]"
            style={{ background: CYAN }}
          >
            + Invite an organization
          </button>
          <button
            onClick={() => {
              setNotice("");
              setAdding(true);
            }}
            className="rounded-lg bg-[#D9D9D9] px-5 py-3 font-display text-lg font-semibold text-ink transition-colors hover:bg-[#CDCDCD]"
          >
            Create directly
          </button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="mt-3 text-base text-muted">
        {loading
          ? "Loading organizations…"
          : notice ||
            `${admins.length} ${admins.length === 1 ? "account" : "accounts"}`}
      </p>

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
                            disabled={busy}
                            onClick={() => {
                              setNotice("");
                              setLogoFor(a);
                            }}
                          >
                            Logo<span className="sr-only"> for {a.name}</span>
                          </Button>
                          <Button
                            tone="danger"
                            disabled={busy}
                            onClick={() => {
                              setNotice("");
                              setRemoving(a);
                            }}
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

      {invites.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Invitations waiting
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-2.5"
              >
                <span className="font-semibold text-slate-900">
                  {inv.organization}
                </span>
                <span className="text-slate-600">{inv.email}</span>
                {inv.expired ? (
                  <Pill tone="warn">Expired</Pill>
                ) : (
                  <Pill>Pending</Pill>
                )}
                <span className="ml-auto">
                  <Button
                    tone="danger"
                    onClick={() => {
                      void revokeInvite(inv.id).then(() => {
                        setNotice(`Revoked the invite for ${inv.organization}.`);
                        void load();
                      });
                    }}
                  >
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inviting && (
        <InviteModal
          onClose={() => setInviting(false)}
          onCreated={(org, url) => {
            setInviting(false);
            setInviteLink({ org, url });
            void load();
          }}
        />
      )}

      {inviteLink && (
        <Modal title="Send them this link" onClose={() => setInviteLink(null)}>
          <p className="mt-2 text-slate-700">
            {inviteLink.org} sets their own password when they open it. It works
            once, and expires in two weeks.
          </p>
          <p className="mt-3 break-all rounded-md bg-slate-100 p-3 font-mono text-sm text-slate-900">
            {inviteLink.url}
          </p>
          {/* Shown once — only a hash is stored, so it can't be looked up. */}
          <p className="mt-2 text-sm text-slate-600">
            Copy it now; it isn&apos;t stored and can&apos;t be shown again.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(inviteLink.url);
              }}
            >
              Copy link
            </Button>
            <Button tone="primary" onClick={() => setInviteLink(null)}>
              Done
            </Button>
          </div>
        </Modal>
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
      {logoFor && (
        <LogoModal
          admin={logoFor}
          onClose={() => setLogoFor(null)}
          onSaved={(name) => {
            setLogoFor(null);
            setNotice(`Updated the logo for ${name}.`);
            void load();
          }}
        />
      )}
      {removing && (
        <RemoveAdminModal
          admin={removing}
          onClose={() => setRemoving(null)}
          onRemoved={(name, retired) => {
            setRemoving(null);
            setNotice(
              retired > 0
                ? `Removed ${name}. ${retired} ${
                    retired === 1 ? "program" : "programs"
                  } retired with the account.`
                : `Removed ${name}.`,
            );
            void load();
          }}
        />
      )}
    </div>
    </div>
  );
}

/**
 * An organization's logo is how members recognise it in the feed's stepper, so
 * it has to be changeable after the account exists — most will be created
 * before anyone has the file to hand.
 */
function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (organization: string, url: string) => void;
}) {
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [isSuper, setIsSuper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const inv = await createInvite({
        organization: organization.trim(),
        email: email.trim(),
        is_admin: isSuper,
      });
      onCreated(
        inv.organization,
        `${window.location.origin}/host/invite/${inv.token}`,
      );
    } catch (e) {
      setError(apiMessage(e, "Couldn't create that invitation."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Invite an organization" onClose={onClose}>
      <p className="mt-1 text-sm text-slate-600">
        They choose their own password, so nobody has to read one out or
        remember to change it later.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Organization" htmlFor="inv-org">
          <input
            id="inv-org"
            autoFocus
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Extend-A-Family"
            className={inputClass}
          />
        </Field>
        <Field label="Email" htmlFor="inv-email">
          <input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <input
          type="checkbox"
          checked={isSuper}
          onChange={(e) => setIsSuper(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-semibold text-slate-900">
            Can manage other organizations
          </span>
          <span className="block text-slate-600">
            Leave this off unless they&apos;re KW Hab staff.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={busy || !organization.trim() || !email.trim()}
          onClick={() => void submit()}
        >
          {busy ? "Creating…" : "Create invite"}
        </Button>
      </div>
    </Modal>
  );
}

function LogoModal({
  admin,
  onClose,
  onSaved,
}: {
  admin: AdminAccount;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [logoUrl, setLogoUrl] = useState(admin.logo_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // "" clears it — the API reads null as "leave alone".
      await updateAdmin(admin.id, { logo_url: logoUrl });
      onSaved(admin.name);
    } catch (e) {
      setError(apiMessage(e, "Couldn't save that logo. Please try again."));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Logo for ${admin.name}`} onClose={onClose}>
      <div className="mt-4">
        <ImageDrop
          label="Organization logo"
          sizing="logo"
          value={logoUrl}
          onChange={setLogoUrl}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button tone="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
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
  const [logoUrl, setLogoUrl] = useState("");
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
        logo_url: logoUrl || null,
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

        {/* Members identify organizations by their logo in the feed's stepper,
            so this is the organization's face, not decoration. */}
        <ImageDrop
          label="Organization logo"
          sizing="logo"
          value={logoUrl}
          onChange={setLogoUrl}
        />

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
  onRemoved: (name: string, retired: number) => void;
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
          will leave the member feed. Nothing is deleted — the programs stay
          filed under {admin.name}, and attendance already recorded still
          counts.
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
