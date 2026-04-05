// Server-side fetch helper.
// Only import this in Server Components or Route Handlers — it uses next/headers.
// For client-side fetches, use the /api/* proxy rewrites instead.

import { cookies } from "next/headers";

const API = process.env.API_URL ?? "http://localhost:8080";
const AUTH_COOKIE = "hg_access_token";

export type ServerFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/**
 * Fetch from the Rust API, forwarding the HttpOnly auth cookie.
 * Throws an error (with message from the API) on non-2xx responses.
 */
export async function serverFetch<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;

  const res = await fetch(`${API}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${AUTH_COOKIE}=${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
