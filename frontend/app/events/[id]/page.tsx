import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventActions } from "@/components/EventActions";
import { categoryStyle } from "@/lib/categories";
import { fetchEvent, siteUrl } from "@/lib/serverApi";
import type { Event } from "@/lib/api";

// Server-rendered on purpose. This is the page nonprofits paste into a Facebook
// post and the only thing a search engine can index — both need the content in
// the HTML, not behind a client fetch that runs after a cookie check.
export const revalidate = 300;

type Params = { params: Promise<{ id: string }> };

function summarize(event: Event): string {
  const when = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const facts = [when, event.location, event.host_name].filter(Boolean);
  const lead = event.description?.trim();
  return lead ? `${facts.join(" · ")} — ${lead}`.slice(0, 300) : facts.join(" · ");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) return { title: "Program not found" };

  const description = summarize(event);
  const url = `${siteUrl()}/events/${event.id}`;
  const images = event.cover_image_url ? [event.cover_image_url] : undefined;

  return {
    title: event.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: event.title,
      description,
      url,
      type: "article",
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: event.title,
      description,
      images,
    },
  };
}

export default async function EventPage({ params }: Params) {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) notFound();

  const cat = categoryStyle(event.category);
  const when = event.starts_at ? new Date(event.starts_at) : null;

  // Search engines get the structured version; people get the page below.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || undefined,
    startDate: event.starts_at ?? undefined,
    endDate: event.ends_at ?? undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: event.location
      ? { "@type": "Place", name: event.location }
      : undefined,
    image: event.cover_image_url ?? undefined,
    organizer: event.host_name
      ? { "@type": "Organization", name: event.host_name }
      : undefined,
    isAccessibleForFree: event.is_free,
    url: `${siteUrl()}/events/${event.id}`,
  };

  return (
    <main className="min-h-dvh bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff,#EEEBF5_60%,#E6E1F2)] px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto w-full max-w-2xl">
        <div
          className="flex items-center justify-between rounded-t-3xl px-6 py-3 text-white"
          style={{ background: cat.color }}
        >
          <span className="font-semibold">
            {event.category || "Community program"}
          </span>
          <span aria-hidden className="text-2xl">
            {cat.emoji}
          </span>
        </div>

        <div className="rounded-b-3xl bg-card p-6 shadow-card">
          {event.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image_url}
              alt=""
              className="mb-6 h-56 w-full rounded-2xl object-cover"
            />
          )}

          <h1 className="font-display text-4xl font-extrabold leading-tight text-ink">
            {event.title}
          </h1>

          <dl className="mt-4 flex flex-col gap-1 text-lg text-ink">
            {when && (
              <div className="flex gap-2">
                <dt className="sr-only">When</dt>
                <dd>
                  <time dateTime={event.starts_at ?? undefined}>
                    {when.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                    {", "}
                    {when.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </dd>
              </div>
            )}
            {event.location && (
              <div className="flex gap-2">
                <dt className="sr-only">Where</dt>
                <dd>{event.location}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="sr-only">Cost</dt>
              <dd>{event.is_free ? "Free" : "Paid"}</dd>
            </div>
            {event.host_name && (
              <div className="flex gap-2">
                <dt className="sr-only">Who runs it</dt>
                <dd className="text-muted">{event.host_name}</dd>
              </div>
            )}
          </dl>

          {event.description && (
            <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-ink">
              {event.description}
            </p>
          )}

          {/* useSearchParams needs a boundary, and the actions are the only
              client-side thing on the page. */}
          <Suspense fallback={null}>
            <EventActions event={event} />
          </Suspense>

          <p className="mt-8 text-center">
            <Link
              href="/events"
              className="font-semibold text-accent underline underline-offset-2"
            >
              See more programs
            </Link>
          </p>
        </div>
      </article>
    </main>
  );
}
