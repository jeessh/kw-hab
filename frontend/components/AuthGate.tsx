"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, type Me } from "@/lib/api";

// Gates member routes: resolves /users/me before rendering children, so an
// unauthenticated visitor is redirected out before any child data fetch runs.
export function AuthGate({
  children,
}: {
  children: (me: Me) => ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    (async () => {
      try {
        const meRes = await api<Me>("/users/me");
        if (alive) setMe(meRes);
      } catch (e) {
        if (!alive) return;
        // Only a real 401 means "not a member" → front door. A network/5xx blip
        // shouldn't eject a signed-in member, so offer a retry instead.
        if (e instanceof ApiError && e.status === 401) router.replace("/");
        else setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, attempt]);

  if (failed) {
    return (
      <main className="grid h-dvh place-items-center bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff,#EEEBF5_60%,#E6E1F2)] px-6 text-center">
        <div>
          <p className="font-display text-2xl text-ink">
            Couldn’t reach the server.
          </p>
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-5 rounded-2xl bg-accent px-8 py-3 text-lg font-semibold text-white shadow-card transition-transform hover:scale-[1.02]"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="grid h-dvh place-items-center bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff,#EEEBF5_60%,#E6E1F2)] text-muted">
        <p className="font-display text-2xl">Checking you in…</p>
      </main>
    );
  }

  return <>{children(me)}</>;
}
