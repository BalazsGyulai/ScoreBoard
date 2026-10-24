// Edge-safe auth cookie helpers shared by middleware.ts and the /api/auth/* route handlers.
// No next/headers or Node APIs here — middleware runs in the Edge runtime.

export const ACCESS_COOKIE = "hg_access_token";
export const REFRESH_COOKIE = "hg_refresh_token";

/** Refresh this many seconds before the access token expires. */
export const REFRESH_BEFORE_EXPIRY_SECONDS = 120;

const API = process.env.API_URL ?? "http://localhost:8080";

/** Decode a JWT payload without verifying it — only for reading `exp`/`sub`. The API verifies. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Seconds until the access token expires (negative if expired, -Infinity if unreadable). */
export function secondsUntilExpiry(token: string | undefined, now = Date.now()): number {
  if (!token) return -Infinity;
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" ? exp - now / 1000 : -Infinity;
}

export function needsRefresh(accessToken: string | undefined): boolean {
  return secondsUntilExpiry(accessToken) <= REFRESH_BEFORE_EXPIRY_SECONDS;
}

/**
 * Prepare a Set-Cookie header from the Rust API for the browser.
 * In dev the site runs on plain http, where browsers drop `Secure` cookies.
 */
export function forBrowser(setCookie: string): string {
  return process.env.NODE_ENV === "production" ? setCookie : setCookie.replace(/;\s*Secure/gi, "");
}

/** Copy every Set-Cookie header of an upstream API response onto our response. */
export function copySetCookies(from: Response, to: { headers: Headers }) {
  for (const cookie of from.headers.getSetCookie()) {
    to.headers.append("Set-Cookie", forBrowser(cookie));
  }
}

/** Set-Cookie values that delete both auth cookies. */
export function clearedAuthCookies(): string[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) =>
    forBrowser(`${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`),
  );
}

function cookieFromSetCookie(setCookies: string[], name: string): string | undefined {
  for (const c of setCookies) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return undefined;
}

/** Replace (or add) cookies inside a request `Cookie` header. */
export function withCookies(cookieHeader: string | null, values: Record<string, string>): string {
  const kept = (cookieHeader ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !(p.slice(0, p.indexOf("=")) in values));
  return [...kept, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)].join("; ");
}

export type RefreshResult =
  | { kind: "ok"; accessToken: string; refreshToken: string; setCookies: string[]; expiresIn: number }
  | { kind: "rejected" } // refresh token invalid/expired/revoked — the session is over
  | { kind: "unavailable" }; // API not reachable — keep the session, try again later

/** Exchange the refresh token for a new token pair (rotation happens in the API). */
export async function refreshWithApi(refreshToken: string): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `${REFRESH_COOKIE}=${refreshToken}` },
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (res.status === 401) return { kind: "rejected" };
  if (!res.ok) return { kind: "unavailable" };

  const setCookies = res.headers.getSetCookie();
  const accessToken = cookieFromSetCookie(setCookies, ACCESS_COOKIE);
  const newRefresh = cookieFromSetCookie(setCookies, REFRESH_COOKIE);
  if (!accessToken || !newRefresh) return { kind: "unavailable" };

  let expiresIn = 0;
  try {
    expiresIn = Number((await res.json()).access_expires_in) || 0;
  } catch {
    // body is optional for our purposes
  }
  return { kind: "ok", accessToken, refreshToken: newRefresh, setCookies, expiresIn };
}
