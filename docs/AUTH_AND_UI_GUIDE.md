# Auth & UI Implementation Guide — HomeGame

> Detailed, step-by-step guide for fixing the Card subheading bug,
> adding show/hide password toggling, and wiring up the complete
> Login + Register flow with the Rust API.

---

## Table of Contents

1. [Bug: Card subHeading renders `[object Object]`](#1-bug-card-subheading-renders-object-object)
2. [Feature: Show / Hide Password Toggle](#2-feature-show--hide-password-toggle)
3. [Complete Login & Register Flow (Next.js ↔ Rust)](#3-complete-login--register-flow-nextjs--rust)

---

## 1. Bug: Card subHeading renders `[object Object]`

### What's happening

In `register/page.tsx` you have this:

```tsx
<Card
  heading="Fiók létrehozása"
  subHeading={`Már van fiókod? ${<Link href="#" className={styles["inline-link"]}>Lépj be</Link>}`}
>
```

The problem is the **template literal** (backtick string). When you embed a
JSX element inside `${}` in a template literal, JavaScript calls `.toString()`
on it. A React element is a plain object, and `{}.toString()` returns
`"[object Object]"`. That's why you see the literal text `[object Object]`.

### Why it happens — the full explanation

```
Template literal:  `Hello ${something}`
                          ↓
JavaScript calls:  String(something)
                          ↓
If something is a React element:
  { type: 'a', props: { href: '#', children: 'Lépj be' } }
                          ↓
Object.prototype.toString()  →  "[object Object]"
```

Template literals (`backtick strings`) can only interpolate **primitive values**
(string, number, boolean). JSX elements are **objects** — they need to be
rendered in JSX, not in a string.

### How to fix it

The `subHeading` prop is currently typed as `string`. You have two options:

#### Option A: Change subHeading to accept ReactNode (recommended)

This is the cleanest fix. It lets you pass any combination of text, links,
icons, or other components as the subheading.

**Step 1 — Update the Card component (`components/ui/card.tsx`):**

Change the prop type from `string` to `React.ReactNode`:

```tsx
// BEFORE
export default function Card({children, heading, subHeading}: {
    heading?: string,
    subHeading?: string,        // ← only accepts plain text
    children?: React.ReactNode,
})

// AFTER
export default function Card({children, heading, subHeading}: {
    heading?: string,
    subHeading?: React.ReactNode,  // ← now accepts JSX too
    children?: React.ReactNode,
})
```

That's it — the rendering code (`{subHeading && <p>...`) already works with
ReactNode because JSX can render any ReactNode.

**Step 2 — Update the register page (`register/page.tsx`):**

Pass JSX directly instead of a template literal:

```tsx
// BEFORE (broken)
subHeading={`Már van fiókod? ${<Link href="#">Lépj be</Link>}`}

// AFTER (working)
subHeading={
  <>
    Már van fiókod?{" "}
    <Link href="/login" className={styles["inline-link"]}>
      Lépj be <MoveRight size={8} />
    </Link>
  </>
}
```

The `<>...</>` is a React Fragment — it groups multiple elements without
adding an extra DOM node. The `{" "}` adds a space between the text and the
link (JSX strips whitespace between elements).

#### Option B: Keep subHeading as string, move the link outside

If you want to keep the Card component simple (string-only subheading):

```tsx
<Card heading="Fiók létrehozása" subHeading="Már van fiókod?">
  <Link href="/login" className={styles["inline-link"]}>
    Lépj be <MoveRight size={8} />
  </Link>
  {/* ... rest of form */}
</Card>
```

But Option A is better because the subheading text and link belong together
visually and semantically.

### Key rule to remember

```
Template literal `${...}`  →  Only for strings and numbers
JSX curly braces {...}     →  For everything (strings, numbers, JSX elements)
```

If you're putting JSX inside a string, you're doing it wrong. Put JSX inside
JSX instead.

---

## 2. Feature: Show / Hide Password Toggle

### How it works conceptually

1. The input starts as `type="password"` (dots)
2. User clicks the eye icon → type changes to `"text"` (visible)
3. User clicks again → back to `"password"` (dots)
4. The icon swaps between an open eye and a closed eye

This requires **state** (`useState`) to track whether the password is
visible. Since the Input component currently has no state, you need to add it.

### Step-by-step implementation

#### Step 1 — Add the toggle to the Input component

**File: `components/ui/input.tsx`**

The idea: when `type="password"` is passed, the component renders an eye
button that toggles between `type="password"` and `type="text"`.

```tsx
"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./input.module.css";

export default function Input({ id, title, placeholder, icon, type, autoComplete }: {
    id: string,
    type: string,
    title: string,
    placeholder: string,
    icon?: ReactElement,
    autoComplete?: string,
}) {
    // Only manage visibility state for password fields
    const isPasswordField = type === "password";
    const [showPassword, setShowPassword] = useState(false);

    // If it's a password field and showPassword is true, render as "text"
    // Otherwise use the original type
    const inputType = isPasswordField && showPassword ? "text" : type;

    return (
        <div className={styles.field}>
            <label className={styles.label} htmlFor={id}>{title}</label>
            <div className={styles["input-wrap"]}>
                {icon && <span className={styles.icon}>{icon}</span>}

                <input
                    className={styles.input}
                    type={inputType}
                    id={id}
                    placeholder={placeholder}
                    {...(autoComplete && { autoComplete })}
                />

                {isPasswordField && (
                    <button
                        type="button"
                        className={styles["toggle-pw"]}
                        onClick={() => setShowPassword(prev => !prev)}
                        aria-label={showPassword ? "Jelszó elrejtése" : "Jelszó megjelenítése"}
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                )}
            </div>
        </div>
    );
}
```

**Key details explained:**

| Code | Why |
|------|-----|
| `"use client"` | Required because `useState` is a client-side React hook |
| `useState(false)` | Password starts hidden (dots) |
| `type="button"` | Prevents the toggle from submitting the form |
| `tabIndex={-1}` | Skips the toggle when pressing Tab (keeps focus on inputs) |
| `aria-label` | Screen readers announce what the button does |
| `<Eye>` / `<EyeOff>` | Lucide icons — you already have lucide-react installed |

#### Step 2 — Add the CSS for the toggle button

The CSS is already in your `login.module.css` but it needs to be in
`input.module.css` since the toggle lives inside the Input component.

**File: `components/ui/input.module.css`** — add at the end:

```css
/* ─── Password toggle ─── */
.toggle-pw {
    position: absolute;
    right: 13px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--slate-300);
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    transition: color var(--transition);
}

.toggle-pw:hover {
    color: var(--slate-700);
}
```

You can remove the `.toggle-pw` rules from `login.module.css` since they now
live in the Input component.

#### Step 3 — Install lucide-react (if not already)

```bash
cd apps/web
npm install lucide-react
```

You likely already have this since your login page imports from it.

#### Step 4 — Usage (no changes needed)

Your existing Input usage already works:

```tsx
<Input
    id="password"
    title="Jelszó"
    type="password"          // ← this triggers the eye toggle
    placeholder="Legalább 8 karakter"
    icon={<Shield size={16} />}
/>
```

The toggle appears automatically whenever `type="password"` is passed.
For `type="text"` or `type="email"` inputs, no toggle is rendered.

---

## 3. Complete Login & Register Flow (Next.js ↔ Rust)

### 3.1 The big picture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                                │
│                                                                         │
│  Login page (React)                                                     │
│  ┌──────────────────┐    POST /api/auth/login                           │
│  │ email: [_______] │ ──────────────────────┐                           │
│  │ pass:  [_______] │                       │                           │
│  │ [  Belépés     ] │                       ▼                           │
│  └──────────────────┘        ┌──────────────────────────┐               │
│                              │ Next.js Route Handler    │               │
│                              │ app/api/auth/login/      │               │
│                              │ route.ts                 │               │
│                              │                          │               │
│                              │ 1. Read request body     │               │
│                              │ 2. Forward to Rust API   │───────┐       │
│                              │ 3. Copy Set-Cookie       │       │       │
│                              │    headers to response   │       │       │
│                              │ 4. Strip "Secure" flag   │       │       │
│                              │    in development        │       │       │
│                              │ 5. Return response       │       │       │
│                              └──────────┬───────────────┘       │       │
│                                         │                       │       │
│  Browser receives:                      │              ┌────────▼─────┐ │
│  ┌────────────────────────┐             │              │ Rust API     │ │
│  │ Set-Cookie:            │             │              │ :8080        │ │
│  │   hg_access_token=JWT  │◄────────────┘              │              │ │
│  │   hg_refresh_token=JWT │                            │ 1. Query DB  │ │
│  │                        │                            │ 2. Verify pw │ │
│  │ Browser stores cookies │                            │ 3. Create    │ │
│  │ HttpOnly = JS can't    │                            │    JWTs      │ │
│  │ read them              │                            │ 4. Set-Cookie│ │
│  └────────────────────────┘                            │    headers   │ │
│                                                        │ 5. Return    │ │
│  window.location.href = "/dashboard"                   │    user JSON │ │
│         │                                              └──────────────┘ │
│         ▼                                                               │
│  GET /dashboard                                                         │
│  Cookie: hg_access_token=JWT ───► Middleware checks cookie exists        │
│                                   ───► Server Component fetches API     │
│                                        with cookie forwarded            │
│                                   ───► Dashboard renders                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Why can't the browser talk to Rust directly?

Three reasons:

1. **Cookies**: The Rust API runs on `:8080`, the browser on `:3000`. Setting
   cookies across different ports is a cross-origin operation with `Secure`
   flag issues. The Route Handler runs on the **same origin** as the browser
   (`:3000`) so cookie setting is seamless.

2. **Security**: The Rust API URL is never exposed to the browser. It's an
   internal backend-to-backend call. If you move the API to a different server
   later, the browser never knows or cares.

3. **Cookie manipulation**: In development, you need to strip the `Secure`
   flag from cookies (HTTP doesn't support `Secure` cookies). The Route
   Handler can do this. The browser can't modify `Set-Cookie` headers.

### 3.3 What changes you need in each file

#### Login page: `app/(auth)/login/page.tsx`

Your login page needs:
- **State** for email, password, error message, and loading
- A **submit handler** that calls the Route Handler
- A **redirect** to `/dashboard` on success

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AtSign, Shield } from "lucide-react";
import styles from "./login.module.css";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";

export default function LoginPage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleSubmit() {
        setError(null);

        // Read form values from the DOM (since Input doesn't use controlled state)
        const email = (document.getElementById("email") as HTMLInputElement)?.value;
        const password = (document.getElementById("password") as HTMLInputElement)?.value;

        if (!email || !password) {
            setError("Email és jelszó megadása kötelező");
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });

                if (res.ok) {
                    // Hard navigation — guarantees the browser sends the
                    // newly-stored HttpOnly cookie on the very next request.
                    // router.push() does a client-side navigation that can
                    // race with cookie storage and fail.
                    window.location.href = "/dashboard";
                } else {
                    let message = "Belépés sikertelen";
                    try {
                        const data = await res.json();
                        message = data.error ?? message;
                    } catch {
                        // empty body
                    }
                    setError(message);
                }
            } catch {
                setError("Nem sikerült csatlakozni a szerverhez");
            }
        });
    }

    return (
        <Card heading="Belépés a fiókomba">
            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.fields}>
                <Input
                    id="email"
                    title="Email"
                    type="text"
                    placeholder="e.g. myemail@email.com"
                    icon={<AtSign size={16} />}
                    autoComplete="email"
                />
                <Input
                    id="password"
                    title="Jelszó"
                    type="password"
                    placeholder="Legalább 8 karakter"
                    icon={<Shield size={16} />}
                    autoComplete="current-password"
                />
            </div>

            <div className={styles.actions}>
                <Button
                    text={isPending ? "Belépés..." : "Belépés"}
                    onClick={handleSubmit}
                />
                <p className={styles["login-link"]}>
                    Még nincs fiókod? <Link href="/register">Regisztrálj</Link>
                </p>
            </div>
        </Card>
    );
}
```

**Important things to understand:**

| Pattern | Why |
|---------|-----|
| `document.getElementById("email")` | Your Input component uses uncontrolled inputs (no `value`/`onChange` props). Reading from the DOM is the simplest way to get values from uncontrolled inputs. |
| `window.location.href` instead of `router.push` | `router.push()` does a client-side navigation. The browser may fire the navigation **before** it has committed the `Set-Cookie` response to its cookie jar. A hard navigation (`window.location.href`) always works because the browser processes all response headers before starting a new page load. |
| `startTransition` | Wraps the async work so React can show the pending state. `isPending` becomes `true` while the fetch is in-flight. |
| `try/catch` around `res.json()` | The API might return an empty body on some errors (e.g. 500). Calling `.json()` on an empty body throws `SyntaxError`. |

> **Alternative: Controlled inputs**
>
> If you later add `value` and `onChange` props to your Input component,
> you can use `useState` for each field instead of `document.getElementById`.
> This is the React-recommended approach and enables features like
> real-time validation, disable-button-when-empty, etc.

#### Register page: `app/(auth)/register/page.tsx`

Same pattern but with more fields:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { User, AtSign, Shield, MoveRight } from "lucide-react";
import styles from "../login/login.module.css";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";

export default function RegisterPage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleSubmit() {
        setError(null);

        const username  = (document.getElementById("username") as HTMLInputElement)?.value;
        const email     = (document.getElementById("email") as HTMLInputElement)?.value;
        const password  = (document.getElementById("password") as HTMLInputElement)?.value;
        const password2 = (document.getElementById("password2") as HTMLInputElement)?.value;

        if (!username || !email || !password || !password2) {
            setError("Minden mező kitöltése kötelező");
            return;
        }
        if (password !== password2) {
            setError("A jelszók nem egyeznek");
            return;
        }
        if (password.length < 8) {
            setError("A jelszónak legalább 8 karakter hosszúnak kell lennie");
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, password, password2 }),
                });

                if (res.ok) {
                    window.location.href = "/dashboard";
                } else {
                    let message = "Regisztráció sikertelen";
                    try {
                        const data = await res.json();
                        message = data.error ?? message;
                    } catch {}
                    setError(message);
                }
            } catch {
                setError("Nem sikerült csatlakozni a szerverhez");
            }
        });
    }

    return (
        <Card
            heading="Fiók létrehozása"
            subHeading={<>Már van fiókod?{" "}<Link href="/login">Lépj be <MoveRight size={8} /></Link></>}
        >
            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.fields}>
                <Input
                    id="username"
                    title="Felhasználónév"
                    type="text"
                    placeholder="e.g. kovacs.janos"
                    icon={<User size={16} />}
                    autoComplete="username"
                />
                <Input
                    id="email"
                    title="Email"
                    type="email"
                    placeholder="e.g. myemail@email.com"
                    icon={<AtSign size={16} />}
                    autoComplete="email"
                />
                <Input
                    id="password"
                    title="Jelszó"
                    type="password"
                    placeholder="Legalább 8 karakter"
                    icon={<Shield size={16} />}
                    autoComplete="new-password"
                />
                <Input
                    id="password2"
                    title="Jelszó megerősítése"
                    type="password"
                    placeholder="Ismételd meg"
                    icon={<Shield size={16} />}
                    autoComplete="new-password"
                />
            </div>

            <div className={styles.actions}>
                <Button
                    text={isPending ? "Regisztráció..." : "Regisztráció"}
                    onClick={handleSubmit}
                />
                <p className={styles["login-link"]}>
                    Már van fiókod? <Link href="/login">Jelentkezz be</Link>
                </p>
            </div>
        </Card>
    );
}
```

**Note:** The two password fields need **different `id` values** (`"password"`
and `"password2"`). Your current code has both as `id="password"` which means
`document.getElementById("password")` would always return the first one.

#### Route Handler: `app/api/auth/login/route.ts`

This is the "proxy" that sits between the browser and Rust. Its jobs:

1. Forward the request body to Rust
2. Forward the cookies from Rust back to the browser
3. **Strip the `Secure` flag** in development (HTTP doesn't support it)

```typescript
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const body = await request.json();

    // 1. Forward to Rust
    let rustRes: Response;
    try {
        rustRes = await fetch(`${process.env.API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ error: "API not reachable" }, { status: 502 });
    }

    // 2. Safely parse the body (might be empty on 500 errors)
    let data: unknown = {};
    const text = await rustRes.text();
    if (text) {
        try { data = JSON.parse(text); } catch { data = { error: text }; }
    }

    // 3. Create response and forward cookies
    const response = NextResponse.json(data, { status: rustRes.status });
    const isProduction = process.env.NODE_ENV === "production";

    for (const cookie of rustRes.headers.getSetCookie()) {
        // In development: strip "Secure" flag because localhost is HTTP.
        // Browsers refuse to store Secure cookies over HTTP.
        const cleaned = isProduction ? cookie : cookie.replace(/;\s*Secure/gi, "");
        response.headers.append("Set-Cookie", cleaned);
    }

    return response;
}
```

**The register route handler (`app/api/auth/register/route.ts`) is identical**
except the Rust URL is `/auth/register` instead of `/auth/login`.

**The logout route handler (`app/api/auth/logout/route.ts`):**

```typescript
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const cookie = request.headers.get("cookie") ?? "";

    let rustRes: Response;
    try {
        rustRes = await fetch(`${process.env.API_URL}/auth/logout`, {
            method: "POST",
            headers: { Cookie: cookie },   // forward auth cookie to Rust
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ error: "API not reachable" }, { status: 502 });
    }

    const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
    const isProduction = process.env.NODE_ENV === "production";

    for (const c of rustRes.headers.getSetCookie()) {
        const cleaned = isProduction ? c : c.replace(/;\s*Secure/gi, "");
        response.headers.append("Set-Cookie", cleaned);
    }

    return response;
}
```

### 3.4 The Rust side — what it does and the critical `AppendHeaders` bug

The Rust API handles auth at three endpoints. Here's what each does:

#### `POST /auth/register`

1. Validates input (email not empty, passwords match, length >= 8)
2. Hashes the password with bcrypt
3. Creates a new `groups` row + `users` row in a transaction
4. Creates two JWTs (access token: 15 min, refresh token: 7 days)
5. Sets both as `HttpOnly` cookies via `Set-Cookie` headers
6. Returns `{ user_id, group_id, username, role }` as JSON

#### `POST /auth/login`

1. Looks up the user by email
2. Verifies the password hash with bcrypt
3. Creates two JWTs
4. Sets both as cookies
5. Returns user info JSON

#### `POST /auth/logout`

1. Sets both cookies to empty values with `Max-Age=0` (tells the browser to
   delete them)
2. Returns `{ message: "Logged out" }`

#### The critical bug: `AppendHeaders`

When returning multiple `Set-Cookie` headers, you **must** use
`AppendHeaders` instead of a plain array:

```rust
// ❌ BROKEN — only the LAST cookie survives
(
    StatusCode::OK,
    [
        (header::SET_COOKIE, make_cookie("hg_access_token",  ...)),
        (header::SET_COOKIE, make_cookie("hg_refresh_token", ...)),
    ],
    Json(body),
)

// ✅ CORRECT — both cookies are sent
use axum::response::AppendHeaders;

(
    StatusCode::OK,
    AppendHeaders([
        (header::SET_COOKIE, make_cookie("hg_access_token",  ...)),
        (header::SET_COOKIE, make_cookie("hg_refresh_token", ...)),
    ]),
    Json(body),
)
```

**Why:** Axum's `IntoResponseParts` implementation for arrays `[(K, V); N]`
calls `headers.insert()` for each pair. `insert()` **replaces** any existing
value for the same key. So the second `SET_COOKIE` overwrites the first.

`AppendHeaders` calls `headers.append()` which **adds** the value alongside
the existing one. HTTP allows (and requires) multiple `Set-Cookie` headers.

**This must be done in all three handlers** (register, login, logout).

### 3.5 The cookie — what each flag means

The Rust API creates cookies like this:

```
hg_access_token=eyJ...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900
```

| Flag | Meaning | Why |
|------|---------|-----|
| `HttpOnly` | JavaScript (`document.cookie`) cannot read this cookie | Prevents XSS attacks from stealing the token |
| `Secure` | Only sent over HTTPS | Prevents token leaking over unencrypted HTTP. **Must be stripped in dev** because `localhost` is HTTP |
| `SameSite=Lax` | Cookie is sent on same-site requests + top-level navigations | Prevents CSRF attacks while still allowing normal link clicks |
| `Path=/` | Cookie is sent for all paths on this domain | The API needs it on `/players`, `/games`, etc. |
| `Max-Age=900` | Cookie expires after 900 seconds (15 minutes) | Access token is short-lived for security |

### 3.6 The middleware — route protection

**File: `middleware.ts`**

The middleware runs before every request. It doesn't verify the JWT (Rust does
that) — it only checks whether the cookie **exists**:

```
Request comes in
  ├── Path is /login or /register?     → Allow through (public)
  ├── Path starts with /api?           → Allow through (Rust handles auth)
  ├── Has hg_access_token cookie?      → Allow through (authenticated)
  └── No cookie?                       → Redirect to /login
```

This is a **routing guard**, not a security boundary. The real security
happens in Rust's `AuthUser` extractor, which verifies the JWT signature
on every protected API call.

### 3.7 Server-side data fetching — how cookies flow

When a Server Component (like the dashboard page) fetches data:

```
Browser request: GET /dashboard
  Cookie: hg_access_token=eyJ...
            │
            ▼
  Next.js middleware: cookie exists? ✅ allow
            │
            ▼
  Server Component runs:
    serverFetch("/stats")
      → fetch("http://localhost:8080/stats", {
          headers: { Cookie: "hg_access_token=eyJ..." }
        })
            │
            ▼
  Rust API:
    AuthUser extractor reads Cookie header
    → parses hg_access_token
    → verifies JWT signature
    → extracts { user_id, group_id, role }
    → handler runs with this context
            │
            ▼
  Response: JSON data → rendered into HTML
```

The `serverFetch` helper (`lib/api/server.ts`) reads the cookie from the
incoming request using `cookies()` from `next/headers` and forwards it to Rust.

### 3.8 Client-side mutations — how the rewrite proxy works

When a client component (like AddPlayerForm) calls `fetch("/api/players")`:

```
Browser: fetch("/api/players", { method: "POST", body: ... })
  Cookie: hg_access_token=eyJ...    (automatically sent, same origin)
            │
            ▼
  Next.js rewrite rule (next.config.ts):
    source: "/api/((?!auth/).*)"     matches "/api/players"
    destination: "http://localhost:8080/$1"  →  "http://localhost:8080/players"
            │
            ▼
  Rust API receives POST /players
    with Cookie header forwarded by the rewrite
```

The rewrite transparently proxies the request. The browser thinks it's
talking to `:3000/api/players`, but it's actually hitting `:8080/players`.

**Exception:** `/api/auth/*` routes are NOT rewritten — they're handled by
Next.js Route Handlers instead (because they need to manipulate cookies).

### 3.9 The .env file

**`apps/web/.env`:**
```
API_URL=http://localhost:8080
```

**`apps/api/.env`:**
```
DATABASE_URL=postgres://homegame_user:yourpassword@localhost:5432/homegame
JWT_SECRET=some-long-random-secret-change-in-production
PORT=8080
```

### 3.10 Complete file checklist

When you're implementing the login/register flow, these are all the files
that need to work together:

| File | Role |
|------|------|
| `app/(auth)/login/page.tsx` | Login form UI + submit handler |
| `app/(auth)/register/page.tsx` | Register form UI + submit handler |
| `app/api/auth/login/route.ts` | Proxy to Rust, forward cookies |
| `app/api/auth/register/route.ts` | Proxy to Rust, forward cookies |
| `app/api/auth/logout/route.ts` | Proxy to Rust, clear cookies |
| `middleware.ts` | Redirect unauthenticated users to /login |
| `lib/api/server.ts` | Server-side fetch helper (forwards cookie) |
| `components/ui/input.tsx` | Input with optional password toggle |
| `components/ui/card.tsx` | Card with ReactNode subHeading |
| `next.config.ts` | Rewrite rules (proxy /api/* to Rust) |
| **Rust:** `auth/handlers.rs` | Register, login, logout handlers |
| **Rust:** `auth/middleware.rs` | AuthUser extractor (JWT verification) |
| **Rust:** `auth/tokens.rs` | JWT create/verify functions |
| **Rust:** `router.rs` | Route definitions |

### 3.11 Debugging checklist

If login doesn't work, check these in order:

```
□ 1. Is the Rust API running?
     curl http://localhost:8080/auth/login -X POST -d '{}' -H 'Content-Type: application/json'
     → Should return 400 or 401, NOT "connection refused"

□ 2. Does Rust return BOTH cookies?
     curl -s -D - -o /dev/null http://localhost:8080/auth/login \
       -X POST -H 'Content-Type: application/json' \
       -d '{"email":"your@email.com","password":"yourpassword"}' \
       | grep -i set-cookie
     → Should show TWO set-cookie lines (access + refresh)
     → If only ONE: you forgot AppendHeaders (see section 3.4)

□ 3. Does the Route Handler forward cookies?
     Open browser DevTools → Network tab → click the login request
     → Response Headers should show set-cookie: hg_access_token=...
     → If missing: check app/api/auth/login/route.ts

□ 4. Does the browser store the cookie?
     DevTools → Application → Cookies → localhost:3000
     → Should show hg_access_token
     → If missing: the Secure flag is blocking it (see section 3.5)

□ 5. Does the middleware let you through?
     DevTools → Network tab → click the /dashboard request
     → Status should be 200, NOT 307 (redirect)
     → If 307: the cookie wasn't stored (back to step 4)

□ 6. Does the server-side fetch forward the cookie?
     Check the Rust API logs for incoming requests to /stats
     → Should show the Cookie header
     → If missing: check lib/api/server.ts
```
