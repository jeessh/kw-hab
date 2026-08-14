"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Superseded by /host/users, which can actually edit. */
export default function MembersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/host/users");
  }, [router]);
  return null;
}
