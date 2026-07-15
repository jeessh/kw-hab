"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";

export default function HostAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const path = mode === "login" ? "/auth/login/host" : "/auth/signup/host";
      const body =
        mode === "login" ? { email, password } : { name, email, password };
      await api(path, { method: "POST", body: JSON.stringify(body) });
      router.push("/host/events");
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setError("Enter a valid email and a password of at least 8 characters.");
      } else {
        setError(
          mode === "login"
            ? "Wrong email or password."
            : "Couldn't create that account.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-card">
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-accent">
          For organizers
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">
          {mode === "login" ? "Host sign in" : "Create a host account"}
        </h1>

        <div className="mt-6 flex flex-col gap-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organization name"
              className="rounded-xl border-2 border-edge px-4 py-3 text-lg outline-none focus:border-accent"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="rounded-xl border-2 border-edge px-4 py-3 text-lg outline-none focus:border-accent"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            className="rounded-xl border-2 border-edge px-4 py-3 text-lg outline-none focus:border-accent"
          />
        </div>

        {error && <p className="mt-3 text-pop">{error}</p>}

        <button
          disabled={busy || !email || !password || (mode === "signup" && !name)}
          onClick={submit}
          className="mt-6 w-full rounded-xl bg-accent px-6 py-3 text-lg font-semibold text-white transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-center text-muted underline"
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have one? Sign in"}
        </button>
      </section>
    </main>
  );
}
