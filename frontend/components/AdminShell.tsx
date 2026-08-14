"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, getSession, logout, type Session } from "@/lib/api";

/**
 * Chrome for the admin console.
 *
 * The member app is deliberately soft and one-thing-at-a-time; this is the
 * opposite surface — staff doing repetitive administrative work want density,
 * structure, and everything reachable in one click. Hence square corners, a
 * persistent sidebar, and tables rather than cards.
 *
 * Resolves the session before rendering children so a page never flashes
 * superadmin-only content at a plain admin.
 */

type Nav = { href: string; label: string; superadminOnly?: boolean };

const NAV: Nav[] = [
  { href: "/host/events", label: "Programs" },
  { href: "/host/admins", label: "Admins", superadminOnly: true },
  { href: "/host/members", label: "Members", superadminOnly: true },
];

export function AdminShell({
  title,
  description,
  actions,
  requireSuperadmin = false,
  bare = false,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Gate the whole page, not just the nav entry. */
  requireSuperadmin?: boolean;
  /** Resolve the session, then get out of the way — for pages that own their
      whole layout, like the create form. */
  bare?: boolean;
  children: (session: Session) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    getSession()
      .then((s) => {
        if (!alive) return;
        if (!s.authenticated || s.role !== "host") {
          router.replace("/host");
          return;
        }
        setSession(s);
      })
      .catch((e) => {
        if (!alive) return;
        // A 401 means "not signed in" → front door. A network blip shouldn't
        // eject someone mid-task, so offer a retry instead.
        if (e instanceof ApiError && e.status === 401) router.replace("/host");
        else setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [router, attempt]);

  if (failed) {
    return (
      <Centered>
        <p className="text-lg font-medium text-slate-900">
          Couldn&apos;t reach the server.
        </p>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-4 rounded-md bg-accent px-4 py-2 font-semibold text-white"
        >
          Try again
        </button>
      </Centered>
    );
  }

  if (!session) {
    return (
      <Centered>
        <p className="text-slate-500">Loading…</p>
      </Centered>
    );
  }

  const isSuper = !!session.is_admin;

  if (requireSuperadmin && !isSuper) {
    return (
      <Frame session={session} pathname={pathname}>
        <Header
          title="Not available"
          description="Only a superadmin can open this page."
        />
        <p className="mt-6 text-slate-600">
          Ask a superadmin at your organization if you need access.
        </p>
      </Frame>
    );
  }

  if (bare) return <>{children(session)}</>;

  return (
    <Frame session={session} pathname={pathname}>
      <Header title={title} description={description} actions={actions} />
      <div className="mt-6">{children(session)}</div>
    </Frame>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 text-center">
      <div>{children}</div>
    </main>
  );
}

function Header({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function Frame({
  session,
  pathname,
  children,
}: {
  session: Session;
  pathname: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const isSuper = !!session.is_admin;

  async function doLogout() {
    try {
      await logout();
    } catch {
      /* clear the session client-side regardless */
    }
    router.replace("/host");
  }

  const items = NAV.filter((n) => isSuper || !n.superadminOnly);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col md:flex-row">
        <aside className="shrink-0 border-slate-200 md:min-h-dvh md:w-56 md:border-r md:bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-4 md:block">
            <div>
              <p className="font-display text-sm font-bold text-slate-900">
                KW Community Compass
              </p>
              <p className="text-xs text-slate-500">
                {isSuper ? "Superadmin" : "Admin"}
              </p>
            </div>
            <button
              onClick={doLogout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 md:hidden"
            >
              Sign out
            </button>
          </div>

          <nav aria-label="Admin sections" className="px-2 pb-4">
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-accent text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden px-4 md:block">
            <button
              onClick={doLogout}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
