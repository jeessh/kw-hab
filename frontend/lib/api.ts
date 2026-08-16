export const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * The human-readable part of a failed response.
 *
 * `ApiError.message` is the raw body, and FastAPI sends `{"detail": "..."}` —
 * rendering that straight into the UI shows people JSON. Pull `detail` out when
 * it's there, otherwise fall back to something we wrote.
 */
export function apiMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail) return parsed.detail;
  } catch {
    /* not JSON — fall through */
  }
  return fallback;
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

// Uploads via FormData (not api()) so the browser sets the multipart boundary;
// forcing application/json would break it.
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
  host_logo_url?: string | null;
  title: string;
  description: string;
  /** Extra details, shown under the description in the detail popup. */
  notes?: string | null;
  /** Every topic it's about. `category` is the first of these. */
  categories?: string[];
  category?: string | null;
  /** The shape of the program (Class, Drop-in, Outing) — see lib/activities. */
  activity_type?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  accessibility_tags: string[];
  is_free: boolean;
  capacity?: number | null;
  /** Human-readable id, e.g. 1042. UUIDs are for machines. */
  event_no?: number;
  series_id?: string | null;
  recurrence?: string | null;
  series_index?: number | null;
  series_total?: number | null;
  pricing_model?:
    | "free"
    | "donation"
    | "per_session"
    | "per_group"
    | "series"
    | "custom";
  price_cents?: number | null;
  price_group_size?: number | null;
  price_sessions?: number | null;
  price_note?: string | null;
  /** Built server-side from the structured fields, so every surface agrees. */
  price_label?: string;
  saved_count?: number;
  min_age?: number | null;
  max_age?: number | null;
  /** Virtual or in person; youth or everyone. Both filter the admin list. */
  is_virtual?: boolean;
  is_youth?: boolean;
  requires_signup: boolean;
  /**
   * Where registering happens. Only meaningful when `requires_signup` — a
   * drop-in program is saved the same way either way. "external" means the
   * member leaves for `registration_url`.
   */
  registration_mode: "internal" | "external";
  registration_url?: string | null;
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

/* ---------------- admin console ---------------- */

/** A member account, as the superadmin-only `GET /users` returns it. */
export type MemberAccount = Me & { created_at?: string };

/**
 * An organizer account. Two tiers, both on this record:
 *   • admin      (is_admin false) — manages only its own programs
 *   • superadmin (is_admin true)  — manages any program, members, and admins
 */
export type AdminAccount = {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  /** Organization logo, shown in the member feed's organization stepper. */
  logo_url?: string | null;
  created_at: string;
  /** Programs this account owns — shown before a removal reassigns them. */
  event_count: number;
};

export type Session = {
  authenticated: boolean;
  role?: "user" | "host";
  is_admin?: boolean;
  id?: string;
};

export const getSession = () => api<Session>("/auth/me");

export const listAdmins = () => api<AdminAccount[]>("/hosts");

export const createAdmin = (body: {
  name: string;
  email: string;
  password: string;
  is_admin: boolean;
  logo_url?: string | null;
}) => api<AdminAccount>("/hosts", { method: "POST", body: JSON.stringify(body) });

export const updateAdmin = (
  id: string,
  body: {
    name?: string;
    is_admin?: boolean;
    password?: string;
    /** "" clears the logo; omitting leaves it alone. */
    logo_url?: string;
  },
) =>
  api<AdminAccount>(`/hosts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export type HostInvite = {
  id: string;
  organization: string;
  email: string;
  is_admin: boolean;
  expires_at: string;
  expired: boolean;
};

export const listInvites = () => api<HostInvite[]>("/invites");

/** The token comes back once — it isn't stored in the clear. */
export const createInvite = (body: {
  organization: string;
  email: string;
  is_admin: boolean;
}) =>
  api<{ id: string; token: string; organization: string; email: string }>(
    "/invites",
    { method: "POST", body: JSON.stringify(body) },
  );

export const revokeInvite = (id: string) =>
  api(`/invites/${id}`, { method: "DELETE" });

export const deleteAdmin = (id: string) =>
  api(`/hosts/${id}`, { method: "DELETE" });

export const listMembers = () => api<MemberAccount[]>("/users");

/** Icons come back once — they're the password and can't be read again. */
export const createMember = (body: { first_name: string; last_name: string }) =>
  api<{ id: string; first_name: string; last_name: string; icons: string[] }>(
    "/users",
    { method: "POST", body: JSON.stringify(body) },
  );

export const updateMember = (
  id: string,
  body: { first_name?: string; last_name?: string },
) =>
  api<MemberAccount>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteMember = (id: string) =>
  api(`/users/${id}`, { method: "DELETE" });
