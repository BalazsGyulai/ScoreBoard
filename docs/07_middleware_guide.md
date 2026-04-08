# Next.js Middleware — How It Works & What Else You Can Do

## What Is Next.js Middleware?

Middleware is a function that runs **before every request is handled** — before the page renders, before the route handler executes, before the rewrite fires. It sits at the very edge of your application, giving you a chance to inspect, redirect, rewrite, or modify any request.

In Next.js, middleware lives in a single file at the root of the `app/` directory:

```
apps/web/
├── middleware.ts       ← runs on every matching request
├── app/
│   ├── (app)/          ← protected routes
│   ├── (auth)/         ← public auth pages
│   └── (viewer)/       ← share token viewer
```

**Key characteristic — it runs on the Edge.**  
Next.js middleware runs in the [Edge Runtime](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes) — a lightweight V8 environment that is *not* full Node.js. This means:
- No `fs`, no `path`, no Node.js built-ins
- No database connections
- Fast and lightweight — designed for routing logic only
- Cannot use most npm packages that rely on Node.js APIs

---

## The Current Middleware

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "hg_access_token";
const PUBLIC_PATHS = ["/login", "/register"];
const VIEWER_PATH_PREFIX = "/live";

export function middleware(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;

    // 1. Public pages — always allow through
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // 2. API routes — always allow, auth is enforced by the Rust API
    if (pathname.startsWith("/api")) {
        return NextResponse.next();
    }

    // 3. Viewer routes — token in query string instead of cookie
    if (pathname.startsWith(VIEWER_PATH_PREFIX)) {
        const viewerToken = searchParams.get("token");
        if (viewerToken) {
            const response = NextResponse.next();
            response.headers.set("x-viewer-token", viewerToken);
            return response;
        }
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // 4. Everything else — requires auth cookie
    const hasToken = request.cookies.has(AUTH_COOKIE);
    if (!hasToken) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

// Which paths this middleware runs on
export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
    ],
};
```

### What Each Part Does

**`NextResponse.next()`** — Let the request through unchanged.

**`NextResponse.redirect(url)`** — Send a 307 redirect to the browser. Execution stops here.

**`NextResponse.next()` with modified headers** — Let the request through, but attach extra headers. The page or route handler can then read them.

**`request.cookies.has("name")`** — Check if a cookie exists. Note: this only checks for existence — it does NOT verify the JWT signature. The Rust API does that.

---

## The Security Boundary: An Important Distinction

> **The middleware only checks whether the cookie EXISTS. It does not verify the JWT.**

This is intentional and correct. Verifying a JWT requires:
- The secret key
- Cryptographic operations
- Potentially checking a database (token revocation)

None of these belong in Edge middleware. Instead:

```
Browser ──[has cookie?]──▶ Middleware ──[yes]──▶ Next.js page renders
                                                        │
                                                        │ serverFetch()
                                                        ▼
                                               Rust API validates JWT ← real security boundary
                                                        │
                                                   [invalid JWT]
                                                        │
                                                   returns 401
```

The page might render briefly, but any actual data fetch will return 401 from Rust and the UI will show an error or redirect. **The real gate is the Rust API, not the middleware.**

---

## The `matcher` Config

Without a `matcher`, middleware would run on every single request — including `/_next/static/...` (CSS, JS bundles), images, fonts, and favicon. This is wasteful.

```typescript
export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
    ],
};
```

This regex means: **run on everything EXCEPT** static Next.js assets, images, favicon, and common image file extensions.

You can also use a simple array of paths:

```typescript
export const config = {
    matcher: ["/dashboard/:path*", "/games/:path*", "/settings"],
};
```

---

## The Route Group Strategy

The project uses Next.js [route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) — directories wrapped in `(parentheses)` — to organise routes without affecting the URL path:

```
app/
├── (app)/            → /dashboard, /games, /settings  (protected)
│   ├── layout.tsx    → renders <Navigation>, <ToastProvider>
│   ├── dashboard/
│   ├── games/
│   └── settings/
│
├── (auth)/           → /login, /register  (public)
│   ├── layout.tsx    → renders centered card layout
│   ├── login/
│   └── register/
│
└── (viewer)/         → /live/:gameCode  (token-based)
    └── live/
```

The `(app)` layout wraps every authenticated page with the navigation bar and toast notification system. The `(auth)` layout wraps login/register with a plain centered layout. The middleware decides which group a user can access.

---

## What Else You Can Do in Middleware

The current middleware only does route protection. Here are other common patterns you can add:

---

### 1. Redirect Already-Logged-In Users Away from Login

Currently a logged-in user can still visit `/login`. This adds a redirect:

```typescript
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hasToken = request.cookies.has(AUTH_COOKIE);

    // If already logged in and visiting auth pages → go to dashboard
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) && hasToken) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // ... rest of logic
}
```

---

### 2. Role-Based Access Control (RBAC)

You can read a value from a cookie or a request header to restrict routes by role. Since you can't verify the JWT in Edge middleware, one approach is to store the role in a **separate non-HttpOnly cookie** (readable by middleware) alongside the HttpOnly JWT.

```typescript
const ROLE_COOKIE = "hg_role"; // set by Rust on login, not HttpOnly

export function middleware(request: NextRequest) {
    const role = request.cookies.get(ROLE_COOKIE)?.value;

    // Admin-only section
    if (request.nextUrl.pathname.startsWith("/admin")) {
        if (role !== "leader") {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
    }

    // ... rest of logic
}
```

> **Important:** Since this cookie is not HttpOnly, it could be tampered with by JavaScript. Always enforce role checks in the Rust API too. The middleware role check is only for UX (hide inaccessible pages) — not security.

---

### 3. Internationalization (i18n) — Language Detection

If the app ever adds multiple languages, middleware is the right place to detect and redirect:

```typescript
const SUPPORTED_LOCALES = ["hu", "en"];
const DEFAULT_LOCALE = "hu";

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Already has a locale prefix → pass through
    const hasLocale = SUPPORTED_LOCALES.some(
        (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
    );
    if (hasLocale) return NextResponse.next();

    // Detect from Accept-Language header
    const acceptLang = request.headers.get("accept-language") ?? "";
    const preferred = acceptLang.split(",")[0].split("-")[0]; // e.g. "hu" from "hu-HU,hu;q=0.9"
    const locale = SUPPORTED_LOCALES.includes(preferred) ? preferred : DEFAULT_LOCALE;

    return NextResponse.redirect(new URL(`/${locale}${pathname}`, request.url));
}
```

---

### 4. A/B Testing — Assigning Experiment Variants

Middleware can assign users to experiment groups by setting a cookie on their first visit, then consistently routing them to the correct variant:

```typescript
export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // Assign variant if not already set
    if (!request.cookies.has("ab_variant")) {
        const variant = Math.random() < 0.5 ? "a" : "b";
        response.cookies.set("ab_variant", variant, {
            maxAge: 60 * 60 * 24 * 30, // 30 days
            sameSite: "lax",
        });
    }

    return response;
}
```

Then in a page component, read the cookie to decide what to render.

---

### 5. Request Logging

You can log every request's path, method, and duration at the middleware level:

```typescript
export function middleware(request: NextRequest) {
    const start = Date.now();
    const response = NextResponse.next();

    // Note: this logs when the middleware returns, not when the response is sent
    console.log(`[${request.method}] ${request.nextUrl.pathname} — ${Date.now() - start}ms`);

    return response;
}
```

In production this is better handled by your reverse proxy (Apache access logs), but useful for debugging locally.

---

### 6. Custom Request Headers Passed to Pages

You can inject headers that Server Components or Route Handlers can then read:

```typescript
export function middleware(request: NextRequest) {
    const response = NextResponse.next({
        request: {
            headers: new Headers(request.headers),
        },
    });

    // Inject the full URL so server components can know the current domain
    response.headers.set("x-url", request.url);
    response.headers.set("x-pathname", request.nextUrl.pathname);

    return response;
}
```

In a Server Component:
```typescript
import { headers } from "next/headers";

export default async function Page() {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname");
    // ...
}
```

> This is already used in the current project — the viewer token from `?token=` is forwarded as `x-viewer-token` so the page handler can access it server-side.

---

### 7. Maintenance Mode

Redirect all traffic to a maintenance page with one flag:

```typescript
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";

export function middleware(request: NextRequest) {
    if (MAINTENANCE_MODE && !request.nextUrl.pathname.startsWith("/maintenance")) {
        return NextResponse.redirect(new URL("/maintenance", request.url));
    }
    // ... rest of logic
}
```

Set `MAINTENANCE_MODE=true` in your Docker environment and redeploy to activate it without changing code.

---

### 8. Rate Limiting (Basic)

The Edge runtime has no access to a database or Redis, but you can do very basic rate limiting with a request counter stored in a response cookie. For real rate limiting, use a proper solution like Upstash Redis with their middleware library.

```typescript
// Basic example — NOT production-grade
export function middleware(request: NextRequest) {
    // For real rate limiting, use:
    // import { Ratelimit } from "@upstash/ratelimit"
    // import { Redis } from "@upstash/redis"
    // This requires an Upstash Redis instance
}
```

---

### 9. Geolocation-Based Routing

The `NextRequest` object includes geo information when running on Vercel's edge network (not available when self-hosting without a CDN):

```typescript
export function middleware(request: NextRequest) {
    // Only available on Vercel edge deployments
    const country = request.geo?.country;

    if (country === "US") {
        return NextResponse.redirect(new URL("/en", request.url));
    }
    if (country === "HU") {
        return NextResponse.redirect(new URL("/hu", request.url));
    }
}
```

---

## Things You CANNOT Do in Middleware

Because of the Edge Runtime limitations:

| ❌ Cannot Do | ✅ Alternative |
|---|---|
| Query the database directly | Use a Route Handler or Server Component |
| Use `fs` / `path` | Not applicable at edge |
| Verify JWT with full `jsonwebtoken` library | Use `jose` (Edge-compatible) or trust Rust API |
| Import most Node.js npm packages | Check if the package has Edge support |
| Set HttpOnly cookies with complex logic | Do it in a Route Handler |
| Call slow external APIs | Will slow down every request — avoid |

**JWT verification IS possible** with the `jose` library (which is Edge-compatible), but in this project it's deliberately left to the Rust API. If you wanted to add it:

```typescript
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function middleware(request: NextRequest) {
    const token = request.cookies.get("hg_access_token")?.value;

    if (token) {
        try {
            const { payload } = await jwtVerify(token, secret);
            // payload.sub = user_id, payload.role = "leader" | "member", etc.
        } catch {
            // Token expired or invalid
            return NextResponse.redirect(new URL("/login", request.url));
        }
    }
    // ...
}
```

---

## Response Possibilities Summary

Every middleware function must return one of these:

```typescript
// 1. Let the request through unchanged
return NextResponse.next();

// 2. Let the request through, but add/modify request headers
return NextResponse.next({
    request: { headers: modifiedHeaders }
});

// 3. Let the request through, but add/modify response headers or cookies
const res = NextResponse.next();
res.headers.set("x-custom", "value");
res.cookies.set("name", "value", { maxAge: 3600 });
return res;

// 4. Redirect to a different URL (browser makes a new request)
return NextResponse.redirect(new URL("/login", request.url));

// 5. Rewrite the URL (transparent — browser URL stays the same)
return NextResponse.rewrite(new URL("/dashboard", request.url));

// 6. Return a direct response (no page renders)
return new NextResponse("Unauthorized", { status: 401 });
return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

---

## Summary

| What the middleware does now | Why |
|---|---|
| Checks for `hg_access_token` cookie | Route protection — unauthenticated users → `/login` |
| Passes `/api/*` through | Auth enforced by Rust API, not Next.js |
| Passes `/login` and `/register` through | Public pages need no auth |
| Checks `?token=` on `/live/*` | Viewer access via share token, not cookie |
| Injects `x-viewer-token` header | Passes token to the page server-side |
| Preserves `?redirect=` on redirect | Returns user to original page after login |

| What you could add | When to add it |
|---|---|
| Redirect logged-in users away from `/login` | Better UX, avoid flicker |
| Role-based RBAC (with a readable role cookie) | Admin sections, leader-only pages |
| Maintenance mode flag | Zero-downtime maintenance windows |
| Custom request headers for Server Components | Passing contextual data without prop-drilling |
| JWT verification with `jose` | If you want stricter edge-level enforcement |
| i18n locale detection and routing | If you ever add multi-language support |
