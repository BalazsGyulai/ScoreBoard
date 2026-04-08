# Next.js Routing & API Calls — How & Why

## The Problem: Two Servers, One Domain

The app has two backend processes:
- **Rust API** (Axum) — business logic, database, auth, SSE
- **Next.js** — UI rendering, static assets

The browser only knows about one URL (`https://games.gyulaibalazs.hu`). All requests from the browser must go through that single domain. Next.js acts as the **public-facing layer** — it either handles requests itself (auth cookie forwarding) or proxies them to the Rust API transparently.

```
Browser
   │
   │  everything goes to games.gyulaibalazs.hu
   ▼
Apache2  (reverse proxy, TLS termination)
   ├── /live/*  →  Rust API :8080  (SSE, bypasses Next.js)
   └── /*       →  Next.js :3000
                        │
                        ├── /api/auth/*    →  Route Handlers (cookie forwarding)
                        ├── /api/games/*   →  Rewrite → Rust API :8080
                        ├── /api/players/* →  Rewrite → Rust API :8080
                        └── /api/stats/*   →  Rewrite → Rust API :8080
```

---

## Two Mechanisms: Rewrites vs Route Handlers

Next.js provides two ways to forward requests to the Rust API:

### 1. Rewrites (`next.config.ts`)

A rewrite is a **transparent URL proxy** — the browser calls `/api/games`, Next.js silently forwards it to `http://api:8080/games`, and returns the response. The browser never knows the Rust API exists.

```typescript
// apps/web/next.config.ts
async rewrites() {
    const API_URL = process.env.API_URL ?? "http://localhost:8080";
    return [
        { source: "/api/games",              destination: `${API_URL}/games` },
        { source: "/api/games/:id",          destination: `${API_URL}/games/:id` },
        { source: "/api/games/:id/scores",   destination: `${API_URL}/games/:id/scores` },
        { source: "/api/players",            destination: `${API_URL}/players` },
        { source: "/api/stats",              destination: `${API_URL}/stats` },
        { source: "/api/stats/history",      destination: `${API_URL}/stats/history` },
        { source: "/api/games/:id/share",    destination: `${API_URL}/games/:id/share` },
        { source: "/api/live/:token/stream", destination: `${API_URL}/live/:token/stream` },
    ];
},
```

**When to use rewrites:**
- The response is a simple JSON payload
- No cookie manipulation needed
- The browser just needs the data

**Limitation:** Rewrites buffer the full response body before forwarding. This is fine for JSON but **breaks SSE** (streaming). That's why `/live/` is bypassed via Apache directly to the Rust API.

### 2. Route Handlers (`app/api/*/route.ts`)

A route handler is a **real Next.js API function** — you write code that runs on the Next.js server. This gives full control over headers, cookies, and response transformation.

```typescript
// apps/web/app/api/auth/login/route.ts
export async function POST(req: NextRequest) {
    const body = await req.json();

    // Forward to Rust API
    const rustRes = await fetch(`${process.env.API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    const data = await rustRes.json();

    // Build our response
    const response = NextResponse.json(data, { status: rustRes.status });

    // Critical: copy Set-Cookie headers from Rust → browser
    rustRes.headers.getSetCookie().forEach((cookie) => {
        const cleaned = isProduction
            ? cookie
            : cookie.replace(/;\s*Secure/gi, ""); // strip Secure for localhost HTTP
        response.headers.append("Set-Cookie", cleaned);
    });

    return response;
}
```

**When to use route handlers:**
- You need to read or write response headers (like cookies)
- You need to transform the response
- The request needs middleware logic before hitting the Rust API

---

## Authentication: Cookie-Based JWT

### Why Cookies Instead of `localStorage`?

Tokens stored in `localStorage` are accessible by any JavaScript on the page — including injected scripts (XSS attacks). **HttpOnly cookies are not accessible to JavaScript at all** — only the browser sends them automatically.

The app uses two cookies:
- `hg_access_token` — short-lived JWT (15 minutes), sent with every API request
- `hg_refresh_token` — long-lived token (7 days), used only to get a new access token

Both are `HttpOnly` (no JavaScript access) and `SameSite=Lax` (not sent on cross-site requests).

### The Cookie Forwarding Problem

When the Rust API sets a cookie:
```
Set-Cookie: hg_access_token=eyJ...; HttpOnly; Secure; Path=/; SameSite=Lax
```

The browser will only store this cookie if the `Set-Cookie` header comes from **the origin the browser is talking to** (i.e., `games.gyulaibalazs.hu`). If Next.js simply proxied the Rust API response as a rewrite, the `Set-Cookie` from `http://api:8080` (an internal Docker hostname) would be ignored.

**Solution:** Route handlers explicitly copy the `Set-Cookie` headers from the Rust response and attach them to the Next.js response. The browser sees cookies from `games.gyulaibalazs.hu` and stores them correctly.

```
Browser          Next.js Route Handler         Rust API
   │                      │                       │
   │── POST /api/login ──▶│                       │
   │                      │── POST /auth/login ──▶│
   │                      │◀── 200 + Set-Cookie ──│
   │                      │   (copies cookies)    │
   │◀── 200 + Set-Cookie ─│                       │
   │   (from Next.js)     │                       │
   │ stores cookies ✓     │                       │
```

### The `Secure` Flag Problem in Development

The `Secure` flag on a cookie means the browser will only send it over HTTPS. In development, the app runs on `http://localhost:3000` (no HTTPS). If `Secure` is present, the browser silently discards the cookie and you're never logged in.

```typescript
const isProduction = process.env.NODE_ENV === "production";
const cleaned = isProduction
    ? cookie
    : cookie.replace(/;\s*Secure/gi, ""); // remove "Secure" in dev
response.headers.append("Set-Cookie", cleaned);
```

In production (HTTPS), the full cookie including `Secure` is forwarded unchanged.

### How Subsequent Requests Are Authenticated

After login, the browser automatically sends `hg_access_token` with every request to `games.gyulaibalazs.hu`. For server-side data fetches, Next.js reads this from the incoming request and forwards it to the Rust API:

```typescript
// apps/web/lib/api/server-fetch.ts
export async function serverFetch(req: NextRequest, path: string) {
    const cookie = req.headers.get("cookie") ?? "";
    const res = await fetch(`${process.env.API_URL}${path}`, {
        headers: { cookie },  // forward the browser's cookies to Rust
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
    }
    return res.json();
}
```

The Rust API's `AuthUser` extractor reads `hg_access_token` from the `Cookie` header and validates the JWT. If it's valid, the request proceeds. If not, it returns 401.

---

## Environment Variables: `API_URL` vs `NEXT_PUBLIC_API_URL`

These two variables look similar but serve completely different purposes:

| Variable | Used by | Evaluated at | Value in prod |
|---|---|---|---|
| `API_URL` | Next.js server (rewrites, route handlers, `serverFetch`) | Runtime | `http://api:8080` (internal Docker) |
| `NEXT_PUBLIC_API_URL` | Browser JavaScript (`EventSource` for SSE) | Build time | `https://games.gyulaibalazs.hu` |

`API_URL` is the **internal Docker network address** — `http://api:8080`. The Next.js container can reach the Rust API container at this address because they're on the same Docker network. The browser cannot use this address — it's not exposed to the internet.

`NEXT_PUBLIC_API_URL` is the **public HTTPS address** of the API endpoint. The browser uses this for SSE connections. It must be reachable from the outside world.

**Why is `NEXT_PUBLIC_API_URL` set to the same domain as the web app (`games.gyulaibalazs.hu`) instead of a separate subdomain?**  
Because Apache proxies `/live/*` on that domain directly to the Rust API. The browser connects to `games.gyulaibalazs.hu/live/...`, and Apache routes it to the Rust container — all without needing a separate API domain.

---

## The `env` Block in `next.config.ts`

```typescript
env: {
    API_URL: process.env.API_URL ?? "http://localhost:8080",
},
```

This exposes `API_URL` to Next.js server-side code as `process.env.API_URL`. Without this block, environment variables set in Docker are not automatically available to the Next.js runtime. This is a Next.js-specific requirement — not a general Node.js behavior.

---

## Request Flow: Dashboard Page Example

Here's a complete trace of what happens when a user visits the dashboard:

```
1. Browser requests GET /dashboard

2. Next.js renders the Dashboard React Server Component

3. The component calls serverFetch(req, "/stats") which:
   a. Reads "Cookie: hg_access_token=eyJ..." from the incoming request
   b. Calls fetch("http://api:8080/stats", { headers: { cookie } })
   c. Rust validates the JWT, queries the database, returns JSON
   d. Next.js receives JSON, passes it as props to the component

4. Next.js renders the full HTML (with data) and sends it to the browser

5. The browser renders the page — data is already there, no client-side fetch needed
```

This is **Server-Side Rendering (SSR)** — data is fetched on the server during render, not by the browser after page load. This means:
- Faster initial page load (no loading spinner for data)
- Works even if JavaScript is disabled
- The Rust API URL never appears in browser network requests (except for SSE)

---

## Route Handler vs Rewrite Decision Tree

```
Does the browser need to set/read a cookie?
├── YES → Use a Route Handler
│         (auth/login, auth/register, auth/logout, auth/me)
│
└── NO → Is it a streaming response (SSE)?
         ├── YES → Use Apache ProxyPass with flushpackets=on
         │         (bypasses Next.js entirely)
         │
         └── NO → Use a Rewrite in next.config.ts
                   (games, scores, players, stats)
```

---

## Summary

| Mechanism | Location | Use case |
|---|---|---|
| `rewrites()` in `next.config.ts` | Server config | Transparent proxy for JSON endpoints |
| Route Handlers (`app/api/*/route.ts`) | TypeScript files | Cookie forwarding, auth |
| `serverFetch` utility | `lib/api/server-fetch.ts` | Server-side data fetching with cookie forwarding |
| `NEXT_PUBLIC_API_URL` | Browser JS bundle | SSE EventSource direct connection |
| Apache `ProxyPass /live/` | Apache config | SSE bypass (no Next.js buffering) |
