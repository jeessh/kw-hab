"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/AdminTable";

/**
 * Copies a program's public URL. This is the point of the whole public event
 * page for an organizer: advertising is the job they described as exhausting,
 * and a link they can paste into a social post or an email is the thing the old
 * calendar never gave them.
 *
 * The origin is read in the browser rather than baked in, so a preview
 * deployment copies its own URL rather than production's.
 */
export function CopyLinkButton({
  eventId,
  label = "Copy link",
  title,
}: {
  eventId: string;
  label?: string;
  /** Program name, so the accessible name says which link was copied. */
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    const url = `${window.location.origin}/events/${eventId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be refused (permissions, insecure origin). Falling
      // back to a prompt keeps the URL reachable — the host can still select it.
      window.prompt("Copy this link:", url);
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button onClick={() => void copy()}>
        {copied ? "Copied" : label}
        {title && <span className="sr-only"> for {title}</span>}
      </Button>
      {/* Always mounted, text pushed in afterwards. A live region inserted with
          its content already inside is unreliably announced; one that already
          exists and then changes is not. The visible label flipping to "Copied"
          is not itself an announcement. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `Link copied${title ? ` for ${title}` : ""}` : ""}
      </span>
    </>
  );
}
