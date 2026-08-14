import type { MetadataRoute } from "next";
import { fetchEvents, siteUrl } from "@/lib/serverApi";

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const events = await fetchEvents();
  return [
    // The feed is the home page now, so this is one entry, not two. /events
    // still resolves, but it 307s here — listing a redirect in a sitemap just
    // asks a crawler to discover the canonical URL the long way round.
    { url: base, changeFrequency: "daily", priority: 1 },
    ...events.map((event) => ({
      url: `${base}/events/${event.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
