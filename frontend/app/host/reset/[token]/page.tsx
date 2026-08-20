"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiMessage } from "@/lib/api";
import { CYAN } from "@/components/host/PostedEvents";

/**
 * Choosing a new password from a reset link.
 *
 * Deliberately the same shape as accepting an invitation — same layout, same
 * two fields, same reassurance about which account is being changed. Someone
 * following a link in an email is right to be wary, and a page that names the
 * account is what separates this from a page that just asks for a password.
 */
export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [target, setTarget] = useState<
    { organization: string; email: string } | null | undefined
  >(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ organization: string; email: string }>(`/auth/host/reset/${token}`)
      .then(setTarget)
      .catch((e) => {
        setTarget(null);
        setProblem(apiMessage(e, "That reset link isn't valid any more."));
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
      await api("/auth/host/reset", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      // The endpoint signs them in, so there is no reason to ask for the
      // password they just chose.
      router.replace("/host/events");
    } catch (e) {
      setError(apiMessage(e, "Couldn't set that password. Please try again."));
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-6 py-10">
      <section className="w-full max-w-[520px]">
        {target === undefined ? (
          <p className="text-center text-lg text-muted">Checking your link…</p>
        ) : target === null ? (
          <>
            <h1 className="font-display text-4xl font-extrabold text-ink">
              This link has expired
            </h1>
            <p className="mt-3 text-lg text-muted">{problem}</p>
            <Link
              href="/host/forgot"
              className="mt-4 inline-block text-lg font-semibold text-accent underline underline-offset-2"
            >
              Ask for a new one
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold text-ink">
              Choose a new password
            </h1>
            <p className="mt-3 text-lg text-ink">
              For {target.organization}.
            </p>
            <p className="mt-1 text-base text-muted">
              You&apos;ll sign in with {target.email}.
            </p>

            <form
              className="mt-7 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void submit();
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-base font-medium text-ink">
                  New password
                </span>
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

              <p className="text-base text-muted">
                At least 8 characters. Anyone still signed in to this account
                elsewhere will be signed out.
              </p>

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
                {busy ? "Saving…" : "Save new password"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
