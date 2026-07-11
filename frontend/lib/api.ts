export const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include", // send/receive the httpOnly auth cookie
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

/**
 * Upload an image file to the host-only endpoint and return its public URL.
 * Uses FormData directly (not `api()`) so the browser sets the multipart
 * boundary — forcing application/json would break the upload.
 */
export async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API}/events/images`, {
    method: "POST",
    credentials: "include",
    body,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const data = (await res.json()) as { url: string };
  return data.url;
}

export type EventImage = { id: string; url: string; caption?: string | null };

export type Event = {
  id: string;
  host_id: string;
  host_name: string;
  title: string;
  description: string;
  category?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  accessibility_tags: string[];
  is_free: boolean;
  requires_signup: boolean;
  cover_image_url?: string | null;
  images: EventImage[];
};

export type Me = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  icons: string[];
  accessibility_prefs: string[];
  interest_categories: string[];
  tts_enabled: boolean;
  voice_commands_enabled: boolean;
  eye_tracking_enabled: boolean;
};

/** Fields a member can update on themselves via PATCH /users/me. */
export type MePrefs = Partial<
  Pick<
    Me,
    | "accessibility_prefs"
    | "interest_categories"
    | "tts_enabled"
    | "voice_commands_enabled"
    | "eye_tracking_enabled"
  >
>;

export const updateMe = (body: MePrefs) =>
  api<Me>("/users/me", { method: "PATCH", body: JSON.stringify(body) });

export const logout = () => api("/auth/logout", { method: "POST" });
