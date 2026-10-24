"use client";

// Browser-side fetch helpers. Every authenticated request from a client component goes
// through apiFetch: when the API answers 401 (access token expired while the tab was
// idle or the phone was asleep), it refreshes the session once and retries the request.
// Only if the refresh itself fails is the user sent to the login page.

export type RefreshStatus = "ok" | "expired" | "error";

let inFlight: { promise: Promise<RefreshStatus>; force: boolean } | null = null;
let lastExpiresIn: number | null = null;

async function doRefresh(force: boolean): Promise<RefreshStatus> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ force }),
    });
    if (res.status === 401) return "expired";
    if (!res.ok) return "error";
    const body = (await res.json().catch(() => ({}))) as { expires_in?: number };
    lastExpiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
    return "ok";
  } catch {
    return "error";
  }
}

/**
 * Refresh the session. Concurrent callers share one request (one rotation).
 * `force` always rotates; without it a still-fresh access token is kept (keep-alive check).
 * A forced caller never settles for an in-flight non-forced check — after a 401 the
 * token must really be replaced.
 * "expired" = the session is over (log in again); "error" = network/API problem.
 */
export function refreshSession(force = true): Promise<RefreshStatus> {
  if (inFlight && (inFlight.force || !force)) return inFlight.promise;

  const previous = inFlight?.promise;
  const promise = (previous ? previous.then(() => doRefresh(force)) : doRefresh(force)).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { promise, force };
  return promise;
}

/** Seconds the access token had left after the last refresh call (for the keep-alive timer). */
export function lastKnownExpiresIn() {
  return lastExpiresIn;
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  window.location.href = `/login?redirect=${encodeURIComponent(here)}`;
}

/** fetch() with credentials and a single refresh + retry on 401. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const request = (): Promise<Response> =>
    fetch(input, { credentials: "include", cache: "no-store", ...init });

  const res = await request();
  if (res.status !== 401 || input.startsWith("/api/auth/")) return res;

  const refreshed = await refreshSession(true);
  if (refreshed === "ok") {
    const retried = await request();
    if (retried.status !== 401) return retried;
  }
  if (refreshed !== "error") redirectToLogin();
  return res;
}

/** Error message from a failed response body (`{ error }`) or the status code. */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // ignore parse errors
  }
  return `Hiba (${res.status})`;
}

/** SWR fetcher: GET JSON through apiFetch, throw with the API message on failure. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<T>;
}
