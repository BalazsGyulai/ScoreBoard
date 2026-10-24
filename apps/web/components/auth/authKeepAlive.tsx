"use client";

import { useEffect } from "react";
import { lastKnownExpiresIn, redirectToLogin, refreshSession } from "@/lib/api/client";

// Keeps the session alive while the app is open — also on a phone left on the score
// table for an hour. Refreshes shortly before the access token expires, and right away
// when the tab becomes visible again (timers are frozen while a phone sleeps).
// Navigation and API calls are covered separately by middleware.ts and apiFetch.

const EARLY_SECONDS = 60;
const MIN_DELAY_SECONDS = 30;
const RETRY_SECONDS = 60;

export default function AuthKeepAlive() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function tick(force: boolean) {
      clearTimeout(timer);
      const status = await refreshSession(force);
      if (stopped) return;
      if (status === "expired") {
        redirectToLogin();
        return;
      }
      if (status === "error") {
        // Offline or API restarting — keep the session and try again soon.
        timer = setTimeout(() => void tick(false), RETRY_SECONDS * 1000);
        return;
      }
      const expiresIn = lastKnownExpiresIn() ?? 0;
      const delay = Math.max(MIN_DELAY_SECONDS, expiresIn - EARLY_SECONDS);
      timer = setTimeout(() => void tick(true), delay * 1000);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick(false);
    };
    const onOnline = () => void tick(false);

    void tick(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
