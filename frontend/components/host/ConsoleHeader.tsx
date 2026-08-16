"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { api, apiMessage, logout, updateMyOrg, type AdminAccount } from "@/lib/api";
import { ImageDrop } from "@/components/ImageDrop";
import { Modal } from "@/components/Modal";
import { SearchBox } from "@/components/member/GridFeed";
import { CYAN } from "@/components/host/PostedEvents";

/**
 * The chrome every console page shares: search, who you are, and — for
 * superadmins — the way between events and the account panels.
 *
 * The links are here rather than in a sidebar because there are three of them.
 * A whole navigation column for three destinations is furniture.
 */
export function ConsoleHeader({
  isSuper,
  organization,
  query,
  onQuery,
}: {
  isSuper: boolean;
  organization: string;
  /** Omit both to hide the search box on pages that have nothing to search. */
  query?: string;
  onQuery?: (v: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [editingLogo, setEditingLogo] = useState(false);
  const [logo, setLogo] = useState("");

  // Fetched here rather than threaded through every console page — the header
  // is the only thing that needs it, and /hosts/me already returns it.
  useEffect(() => {
    let alive = true;
    api<AdminAccount>("/hosts/me")
      .then((me) => {
        if (alive) setLogo(me.logo_url ?? "");
      })
      .catch(() => {
        /* the header still works without it */
      });
    return () => {
      alive = false;
    };
  }, []);

  const tabs = [
    { href: "/host/events", label: "Events", superOnly: false },
    { href: "/host/users", label: "Users", superOnly: true },
    { href: "/host/admins", label: "Organizations", superOnly: true },
  ].filter((t) => isSuper || !t.superOnly);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-[280px] flex-1 flex-col gap-4">
        {query !== undefined && onQuery && (
          <SearchBox value={query} onChange={onQuery} />
        )}
        {tabs.length > 0 && (
          <nav aria-label="Console sections" className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-base font-medium text-ink transition-colors ${
                    active ? "text-ink" : "hover:bg-[#EDECF1]"
                  }`}
                  style={active ? { background: CYAN } : undefined}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      <div className="text-right">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          {isSuper ? "KWHab administrative access" : "Administrative access"}
        </p>
        {/* The logo is the organization's own to set — members recognise them
            by it in the feed, and having to ask KW Hab to upload a file was a
            strange place to need permission. */}
        <button
          onClick={() => setEditingLogo(true)}
          className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-full pl-1 pr-3 text-lg text-ink transition-colors hover:bg-[#EDECF1]"
          title="Change your organization's logo"
        >
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#E8318A] text-white"
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="9" r="3.4" fill="currentColor" />
                <path
                  d="M5.5 19c1.4-3 4-4.4 6.5-4.4S17.1 16 18.5 19"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
          {organization || "Signed in"}
        </button>
        <button
          onClick={() => {
            void logout()
              .catch(() => {})
              .then(() => router.replace("/host"));
          }}
          // 20px tall as a bare text link. Right-aligned padding keeps the
          // dense header looking the same while giving it a real target.
          className="mt-0.5 block w-full py-2 text-right text-sm font-medium text-muted underline underline-offset-2 hover:text-ink"
        >
          Sign out
        </button>
      </div>

      {editingLogo && (
        <LogoModal
          value={logo}
          organization={organization}
          onSaved={(url) => {
            setLogo(url);
            setEditingLogo(false);
          }}
          onClose={() => setEditingLogo(false)}
        />
      )}
    </div>
  );
}

/**
 * Setting your own organization's logo.
 *
 * Same uploader the rest of the console uses, so the file is checked and
 * resized in the browser before it goes anywhere.
 */
function LogoModal({
  value,
  organization,
  onSaved,
  onClose,
}: {
  value: string;
  organization: string;
  onSaved: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateMyOrg({ logo_url: url || null });
      onSaved(url);
    } catch (e) {
      setError(apiMessage(e, "Couldn't save that logo. Please try again."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Your organization's logo" onClose={onClose}>
      <p className="mt-2 text-base text-muted">
        This is how members pick {organization || "you"} out in the feed. A
        square image works best.
      </p>
      <div className="mt-4">
        <ImageDrop label="" sizing="logo" value={url} onChange={setUrl} />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-base font-semibold text-red-600">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={() => void save()}
          disabled={busy}
          className="rounded-lg px-6 py-3 font-display text-lg font-semibold text-ink transition-transform enabled:hover:scale-[1.02] disabled:opacity-50"
          style={{ background: CYAN }}
        >
          {busy ? "Saving…" : "Save logo"}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-[#D9D9D9] px-6 py-3 font-display text-lg font-semibold text-ink transition-colors hover:bg-[#CDCDCD]"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
