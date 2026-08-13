import type { MetadataRoute } from "next";
import { fetchEvents, siteUrl } from "@/lib/serverApi";

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const events = await fetchEvents();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/events`, changeFrequency: "daily", priority: 0.9 },
    ...events.map((event) => ({
      url: `${base}/events/${event.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
