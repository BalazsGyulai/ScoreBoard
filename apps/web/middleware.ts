// Next.js Middleware — runs before every page and /api request.
// Handles route protection and keeps the session alive.
//
// ┌───────────────────────────────────────────────────────────┐
// │  Route                │  Who can access                    │
// ├───────────────────────┼───────────────────────────────────┤
// │  /login, /register    │  Anyone (public)                  │
// │  /live/*, /api/live/* │  Share token (read-only)          │
// │  /api/auth/*          │  Route handlers decide            │
// │  /api/*               │  Proxied to Rust — verified there │
// │  Everything else      │  Authenticated users only         │
// └───────────────────────────────────────────────────────────┘
//
// Session lifetime: the access token lives ~15 minutes, the refresh token ~30 days
// (sliding). When the access token is missing or about to expire and a refresh token
// is present, the middleware refreshes it *before* the request continues: the new
// cookies go to the browser, and the same request is forwarded with the new access
// token, so pages, route handlers and the /api proxy never see an expired one.
//
// NOTE: The middleware does not verify JWT signatures. The Rust API verifies the
// token on every protected request — that is the security boundary.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearedAuthCookies,
  forBrowser,
  needsRefresh,
  refreshWithApi,
  withCookies,
} from "@/lib/auth/cookies";

// Routes that don't need an auth cookie
const PUBLIC_PATHS = ["/login", "/register"];

// Next.js metadata routes are fetched by the browser without auth.
// If we protect them, tabs/home-screen icons fail to load.
const PUBLIC_METADATA_PATHS = [
  "/favicon.ico",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
];

// Viewer route — accessible with a ?token= query param instead of a cookie
const VIEWER_PATH_PREFIX = "/live";

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") loginUrl.searchParams.set("redirect", pathname + search);
  const response = NextResponse.redirect(loginUrl);
  for (const c of clearedAuthCookies()) response.headers.append("Set-Cookie", c);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 1. Always allow public auth pages
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 1.5 Always allow metadata/static SEO files
  if (PUBLIC_METADATA_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // 2. Auth route handlers manage cookies themselves; live data uses the share token
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/live/")) {
    return NextResponse.next();
  }

  // 3. Viewer routes — accept a ?token= query param (issued by the leader)
  if (pathname === VIEWER_PATH_PREFIX || pathname.startsWith(`${VIEWER_PATH_PREFIX}/`)) {
    if (searchParams.get("token")) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isApi = pathname.startsWith("/api/");
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // 4. Fresh access token — nothing to do
  if (accessToken && !needsRefresh(accessToken)) {
    return pathname === "/" ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }

  // 5. Missing / expiring access token — refresh silently
  if (refreshToken) {
    const result = await refreshWithApi(refreshToken);

    if (result.kind === "ok") {
      const headers = new Headers(request.headers);
      headers.set(
        "cookie",
        withCookies(request.headers.get("cookie"), {
          [ACCESS_COOKIE]: result.accessToken,
          [REFRESH_COOKIE]: result.refreshToken,
        }),
      );
      const response =
        pathname === "/"
          ? NextResponse.redirect(new URL("/dashboard", request.url))
          : NextResponse.next({ request: { headers } });
      for (const c of result.setCookies) response.headers.append("Set-Cookie", forBrowser(c));
      return response;
    }

    if (result.kind === "rejected") {
      if (isApi) {
        const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
        for (const c of clearedAuthCookies()) response.headers.append("Set-Cookie", c);
        return response;
      }
      return loginRedirect(request);
    }

    // API unreachable: do not log the user out over a network blip.
    return NextResponse.next();
  }

  // 6. A (nearly expired) access token without refresh token — let it be used up
  if (accessToken) return NextResponse.next();

  // 7. Not logged in. API calls get a 401 from Rust; pages go to the login screen.
  if (isApi) return NextResponse.next();
  return loginRedirect(request);
}

// Tell Next.js which paths this middleware should run on.
// Exclude static files and Next.js internals to avoid unnecessary overhead.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
  ],
};
