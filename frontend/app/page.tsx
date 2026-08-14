"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";

// /auth/me never 401s; it returns { authenticated:false } when there's no cookie.
type Session = { authenticated: boolean; role?: string };

export default function LandingPage() {
  const [session, setSession] = useState<Session | null>(null); // null = probing

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api<Session>("/auth/me");
        if (alive) setSession(res);
      } catch {
        if (alive) setSession({ authenticated: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isMember = session?.authenticated && session.role === "user";
  const isHost = session?.authenticated && session.role === "host";

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(120%_80%_at_50%_-10%,#ffffff,#EEEBF5_60%,#E6E1F2)] px-6 py-10">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl text-center"
      >
        <h1 className="font-display text-5xl font-extrabold leading-tight text-ink sm:text-6xl">
          KW Community Compass
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-xl text-muted sm:text-2xl">
          Find community programs that fit you, all in one place.
        </p>

        {/* No loading state: browsing needs no account, so the default answer
            is right for everyone and is in the HTML immediately. Resolving the
            session only ever upgrades it to a more specific destination. */}
        <div className="mt-10 flex min-h-[4.5rem] flex-col items-center">
          {isMember ? (
            <Cta href="/events">Continue to your programs →</Cta>
          ) : isHost ? (
            <Cta href="/host/events">Go to your dashboard →</Cta>
          ) : (
            // Looking comes first. Asking someone to make an account before
            // they have seen a single program puts the hardest step — a name
            // typed in, three icons remembered — in front of the reason they
            // came. Signing in is what saving needs, and it is offered there.
            <>
              <Cta href="/events">See programs →</Cta>
              <Link
                href="/signup"
                className="mt-4 text-lg font-semibold text-accent underline underline-offset-2"
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        {!isHost && (
          <p className="mt-8 text-sm text-muted">
            Are you an organizer?{" "}
            <Link
              href="/host"
              className="font-semibold text-accent underline underline-offset-2"
            >
              Log in as host
            </Link>
          </p>
        )}
      </motion.section>
    </main>
  );
}

function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-2xl bg-accent px-10 py-4 text-2xl font-semibold text-white shadow-card transition-transform hover:scale-[1.02] focus-visible:scale-[1.02]"
    >
      {children}
    </Link>
  );
}
