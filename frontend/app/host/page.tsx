"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";

// Sign-in only. There is no self-serve organizer registration: a superadmin
// creates accounts from Admin console → Admins. Anyone being able to register
// meant anyone could publish programs to the member feed.
export default function HostAuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login/host", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/host/events");
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setError("Enter a valid email and password.");
      } else {
        setError("Wrong email or password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6">
      <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Admin console
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          Sign in
        </h1>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && email && password) void submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="mt-1 rounded-md bg-accent px-4 py-2.5 font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-sm">
          <Link
            href="/host/forgot"
            className="font-semibold text-accent underline underline-offset-2"
          >
            Forgot your password?
          </Link>
        </p>

        <p className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-500">
          Need an account? Ask a superadmin at your organization to create one.
        </p>
      </section>
    </main>
  );
}
