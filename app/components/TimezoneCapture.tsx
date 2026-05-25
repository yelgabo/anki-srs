"use client";

import { useEffect } from "react";

const FLAG_KEY = "tz-posted-once";

// Fires once per browser per session: POSTs the user's IANA timezone so
// streak math runs in their local zone. Server defaults to UTC; this corrects it.
// No-op on the very rare browsers that don't expose `Intl.DateTimeFormat`.
export default function TimezoneCapture() {
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (sessionStorage.getItem(FLAG_KEY)) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      fetch("/api/user/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      }).finally(() => {
        sessionStorage.setItem(FLAG_KEY, "1");
      });
    } catch {
      // Best-effort; non-critical.
    }
  }, []);
  return null;
}
