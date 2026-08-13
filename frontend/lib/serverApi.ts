import type { Event } from "@/lib/api";

/**
 * Base URL for fetches made on the server (Server Components, metadata,
 * sitemap).
 *
 * The browser talks to the API through a relative `/api`, which a server-side
 * fetch can't use — it has no origin to resolve against. So:
 *
 *   INTERNAL_API_URL  explicit, and the one to set in production. Point it at
 *                     the custom domain (`https://…/api`): Vercel's deployment
 *                     protection blocks requests to a *.vercel.app origin, and
 *                     the Next.js server fetching its own /api is exactly such
 *                     a request — SSR 401s until protection is off or a custom
 *                     domain is attached.
 *   VERCEL_URL        preview deployments, where the above caveat applies.
 *   localhost:8000    dev, where the backend runs on its own port.
 */
export function serverApiBase(): string {
  const explicit = process.env.INTERNAL_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api`;
  return "http://localhost:8000";
}

/** Absolute origin for canonical URLs, OG tags, and the sitemap. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * One event, or null if it doesn't exist or the API is unreachable.
 *
 * Null rather than throwing: a missing event is a 404 page and an unreachable
 * API shouldn't turn a shared link into a stack trace.
 */
export async function fetchEvent(id: string): Promise<Event | null> {
  try {
    const res = await fetch(`${serverApiBase()}/events/${id}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Event;
  } catch {
    return null;
  }
}

/** Every live event, for the sitemap. Empty on failure — never a broken build. */
export async function fetchEvents(): Promise<Event[]> {
  try {
    const res = await fetch(`${serverApiBase()}/events?limit=200`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return (await res.json()) as Event[];
  } catch {
    return [];
  }
}
