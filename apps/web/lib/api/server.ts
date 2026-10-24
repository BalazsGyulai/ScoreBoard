// Server-side fetch helper.
// Only import this in Server Components or Route Handlers — it uses next/headers.
// For client-side fetches, use apiFetch / fetchJson from lib/api/client.ts.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

const API = process.env.API_URL ?? "http://localhost:8080";

export type ServerFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/** Non-2xx response from the Rust API. Keeps the status so 401s reach the browser as 401s. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Fetch from the Rust API, forwarding the HttpOnly auth cookie.
 * Throws an ApiError (with message and status from the API) on non-2xx responses.
 */
export async function serverFetch<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;

  const res = await fetch(`${API}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${ACCESS_COOKIE}=${token}` } : {}),
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
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

/** JSON error response for a failed route handler, preserving the API status (e.g. 401). */
export function errorResponse(error: unknown, fallback = "Nem sikerült betölteni") {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof ApiError ? error.status : 500;
  return NextResponse.json({ error: message }, { status });
}
