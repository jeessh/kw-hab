"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
        {tabs.length > 1 && (
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
  );
}
