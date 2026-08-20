"use client";

import { useState } from "react";
import Link from "next/link";
import { api, apiMessage } from "@/lib/api";
import { Button, Field, inputClass } from "@/components/AdminTable";

/**
 * Ask for a reset link.
 *
 * Confirms in the same words whether or not the address has an account —
 * the endpoint answers identically for the same reason, so that asking here
 * can't be used to find out which agencies are on the platform.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/host/forgot", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setSent(true);
    } catch (e) {
      setError(apiMessage(e, "Couldn't send a reset link. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Admin console
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          Reset your password
        </h1>

        {sent ? (
          <>
            <p className="mt-4 text-sm text-slate-700">
              If <strong>{email.trim().toLowerCase()}</strong> has an account,
              a reset link is on its way. It works once and expires in an hour.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Nothing arrived? Check the spam folder, then try again — the
              address has to match the one the account was set up with.
            </p>
            <Link
              href="/host"
              className="mt-5 inline-block text-sm font-semibold text-accent underline underline-offset-2"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              We&apos;ll email you a link to choose a new one.
            </p>
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && email.trim()) void submit();
              }}
            >
              <Field label="Email" htmlFor="fp-email">
                <input
                  id="fp-email"
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                tone="primary"
                disabled={busy || !email.trim()}
              >
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <Link
              href="/host"
              className="mt-5 inline-block text-sm font-semibold text-accent underline underline-offset-2"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
