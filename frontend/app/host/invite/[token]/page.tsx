"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, apiMessage } from "@/lib/api";
import { CYAN } from "@/components/host/PostedEvents";

/**
 * Accepting an invitation to join as an organization.
 *
 * The password is set here, by the person who will use it. That's the whole
 * point of inviting rather than creating an account and reading a password out:
 * nobody else ever knows it.
 */
export default function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [invite, setInvite] = useState<
    { organization: string; email: string } | null | undefined
  >(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ organization: string; email: string }>(`/invites/${token}`)
      .then(setInvite)
      .catch((e) => {
        setInvite(null);
        setProblem(
          apiMessage(e, "That invitation link isn't valid any more."),
        );
      });
  }, [token]);

  async function submit() {
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      // Accepting signs them in, so there's nowhere to go but the console.
      router.replace("/host/events");
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 422
          ? "Use at least 8 characters."
          : apiMessage(e, "Couldn't set that up. Please try again."),
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-6 py-10">
      <section className="w-full max-w-[520px]">
        {invite === undefined ? (
          <p className="text-center text-lg text-muted">Checking your invite…</p>
        ) : invite === null ? (
          <>
            <h1 className="font-display text-4xl font-extrabold text-ink">
              This link has expired
            </h1>
            <p className="mt-3 text-lg text-muted">{problem}</p>
            <p className="mt-3 text-lg text-muted">
              Ask whoever invited you to send a new one.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold text-ink">
              Welcome, {invite.organization}
            </h1>
            {/* Showing who they are and who invited them is what separates this
                from a phishing link that just asks for a password. */}
            <p className="mt-3 text-lg text-ink">
              You&apos;ve been invited to post events on KW Community Compass.
              Choose a password and you&apos;re in.
            </p>
            <p className="mt-1 text-base text-muted">
              You&apos;ll sign in with {invite.email}.
            </p>

            <form
              className="mt-7 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void submit();
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-base font-medium text-ink">Password</span>
                <input
                  autoFocus
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl border-2 border-[#B9B7C4] px-4 py-3 text-lg outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-base font-medium text-ink">
                  Password again
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="rounded-xl border-2 border-[#B9B7C4] px-4 py-3 text-lg outline-none focus:border-accent"
                />
              </label>

              {error && (
                <p role="alert" className="font-semibold text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || password.length < 8 || !confirm}
                className="mt-2 rounded-lg px-6 py-3 font-display text-lg font-semibold text-ink transition-transform enabled:hover:scale-[1.02] disabled:opacity-50"
                style={{ background: CYAN }}
              >
                {busy ? "Setting up…" : "Create my account"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
