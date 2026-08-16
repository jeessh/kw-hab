/**
 * Is the posting link actually a link to the posting?
 *
 * Organizers reach for the address they know by heart, which is their front
 * page. A member who taps "Sign up on their site" then lands on a homepage and
 * has to find the program again — through a menu, on a site they've never seen,
 * having already been told they were being taken to the thing they wanted. For
 * someone this platform exists to help, that is where the trail goes cold.
 *
 * A warning rather than a block: some agencies genuinely have one page, and
 * refusing to accept it would mean they post no link at all, which is worse.
 */

export type LinkHint = { tone: "warn" | "error"; message: string } | null;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Parse the way the API will, which forgives a missing https://. */
function parse(value: string): URL | null {
  try {
    return new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

export function checkPostingLink(raw: string): LinkHint {
  const value = raw.trim();
  if (!value) return null; // optional field
  // Neither takes a path, so the "point deeper" advice is nonsense for them.
  if (/^(mailto|tel):/i.test(value)) return null;

  const url = parse(value);
  if (!url || !url.hostname.includes(".") || /\s/.test(value)) {
    return {
      tone: "error",
      message: "That doesn't look like a web address.",
    };
  }

  // A query or fragment identifies a specific thing just as a path does —
  // "?id=482" is somebody's event page even though the path is empty.
  const hasPath = url.pathname.replace(/\/+$/, "") !== "";
  const hasQuery = url.search.length > 1 || url.hash.length > 1;
  if (hasPath || hasQuery) return null;

  return {
    tone: "warn",
    message:
      `This points at your whole site, so people land on ${url.hostname} and ` +
      `have to find this program themselves. Link straight to its page — ` +
      `something like ${url.hostname}/events/summer-baking.`,
  };
}
