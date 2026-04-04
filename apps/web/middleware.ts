// Next.js Edge Middleware — runs before every request, on the CDN edge.
// Handles route protection and auth cookie forwarding.
//
// ┌───────────────────────────────────────────────────────────┐
// │  Route                │  Who can access                    │
// ├───────────────────────┼───────────────────────────────────┤
// │  /login, /register    │  Anyone (public)                  │
// │  /live/*              │  Viewer token in query string     │
// │  /api/*               │  Proxied to Rust — handled there  │
// │  Everything else      │  Authenticated users only         │
// └───────────────────────────────────────────────────────────┘
//
// NOTE: The middleware only checks whether the auth cookie EXISTS.
// The actual JWT signature verification happens inside the Rust API
// on every protected request. That is the security boundary.
// Do NOT rely on middleware alone for authorization — it's just routing.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie name set by the Rust API on login (HttpOnly, Secure, SameSite=Lax)
const AUTH_COOKIE = "hg_access_token";

// Routes that don't need an auth cookie
const PUBLIC_PATHS = ["/login", "/register"];

// Viewer route — accessible with a ?token= query param instead of a cookie
const VIEWER_PATH_PREFIX = "/live";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 1. Always allow public auth pages
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. Always allow API proxy calls — auth is handled by the Rust backend
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // 3. Viewer routes — accept a ?token= query param (issued by the leader)
  if (pathname.startsWith(VIEWER_PATH_PREFIX)) {
    const viewerToken = searchParams.get("token");
    if (viewerToken) {
      // Forward the viewer token as a header so the Rust SSE endpoint can verify it
      const response = NextResponse.next();
      response.headers.set("x-viewer-token", viewerToken);
      return response;
    }
    // No token → redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 4. All other routes require the auth cookie
  const hasToken = request.cookies.has(AUTH_COOKIE);
  if (!hasToken) {
    // Preserve the original destination so we can redirect back after login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Tell Next.js which paths this middleware should run on.
// Exclude static files and Next.js internals to avoid unnecessary overhead.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
  ],
};
