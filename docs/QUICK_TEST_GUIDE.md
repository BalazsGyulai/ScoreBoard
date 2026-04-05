# Quick Test Guide — One Backend, One Frontend

A minimal, copy-paste guide: one Rust integration test and one Next.js component test.

---

## 1. Backend — Rust Integration Test (Login endpoint)

### Where it lives

```
apps/api/
  tests/
    integration/
      auth_test.rs    <-- your test file
    common/
      mod.rs          <-- shared test helpers
```

### Step 1 — Create a test database

Tests need their own database so they don't mess with your dev data.

```bash
# one-time setup (run from anywhere, just need psql access)
createdb homegame_test
```

Copy your migrations to it:

```bash
cd apps/api
DATABASE_URL="postgres://localhost/homegame_test" sqlx migrate run
```

### Step 2 — Write the shared helper (`tests/common/mod.rs`)

This builds your real app router but points it at the test database.

```rust
use api::{config::Config, router, AppState};
use axum_test::TestServer;
use sqlx::PgPool;

/// Spins up a TestServer backed by the test database.
/// Each test should call this at the top.
pub async fn test_server() -> TestServer {
    // Load from .env.test or hardcode for now
    dotenvy::from_filename(".env.test").ok();

    let config = Config::from_env();
    let db = PgPool::connect(&config.database_url)
        .await
        .expect("Failed to connect to test DB");

    let state = AppState { db, config };
    let app = router::build(state);

    TestServer::new(app).expect("Failed to build TestServer")
}
```

Create a `.env.test` file in `apps/api/`:

```env
DATABASE_URL=postgres://localhost/homegame_test
JWT_SECRET=test-secret-at-least-32-characters-long!!
JWT_ACCESS_EXPIRY_MINUTES=15
JWT_REFRESH_EXPIRY_DAYS=7
PORT=3001
```

### Step 3 — Make your lib public

For tests to import `api::config::Config`, `api::router`, etc., your `main.rs` needs a matching `lib.rs`. Create `apps/api/src/lib.rs`:

```rust
pub mod auth;
pub mod config;
pub mod games;
pub mod players;
pub mod router;
pub mod scores;
pub mod stats;

use config::Config;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
}
```

Then simplify `main.rs` to reuse it:

```rust
use api::{config::Config, router, AppState};
// ... rest stays the same, just import from the lib crate
```

### Step 4 — Write the test (`tests/integration/auth_test.rs`)

```rust
mod common;

use axum_test::TestServer;
use serde_json::json;

/// Helper: register a fresh user and return the server
async fn register_user(server: &TestServer, email: &str) {
    server
        .post("/auth/register")
        .json(&json!({
            "email": email,
            "username": "testuser",
            "password": "password123",
            "password2": "password123"
        }))
        .await
        .assert_status(axum::http::StatusCode::CREATED);
}

// ─── The actual test ───

#[tokio::test]
async fn login_returns_200_and_sets_both_cookies() {
    let server = common::test_server().await;

    // 1. Register first (so the user exists)
    let email = format!("login-test-{}@test.com", uuid::Uuid::new_v4());
    register_user(&server, &email).await;

    // 2. Login with the same credentials
    let response = server
        .post("/auth/login")
        .json(&json!({
            "email": email,
            "password": "password123"
        }))
        .await;

    // 3. Assert status
    response.assert_status(axum::http::StatusCode::OK);

    // 4. Assert both cookies are set (this was the bug we fixed!)
    let cookies: Vec<String> = response
        .iter_headers_by_name("set-cookie")
        .map(|v| v.to_str().unwrap().to_string())
        .collect();

    assert!(
        cookies.iter().any(|c| c.starts_with("hg_access_token=")),
        "Missing hg_access_token cookie. Got: {cookies:?}"
    );
    assert!(
        cookies.iter().any(|c| c.starts_with("hg_refresh_token=")),
        "Missing hg_refresh_token cookie. Got: {cookies:?}"
    );

    // 5. Assert JSON body has the right shape
    let body: serde_json::Value = response.json();
    assert_eq!(body["username"], "testuser");
    assert_eq!(body["role"], "leader");
    assert!(body["user_id"].is_string());
    assert!(body["group_id"].is_string());
}

#[tokio::test]
async fn login_with_wrong_password_returns_401() {
    let server = common::test_server().await;

    let email = format!("wrong-pw-{}@test.com", uuid::Uuid::new_v4());
    register_user(&server, &email).await;

    let response = server
        .post("/auth/login")
        .json(&json!({
            "email": email,
            "password": "wrong_password"
        }))
        .await;

    response.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}
```

### How to run it

```bash
cd apps/api

# Run all integration tests
cargo test

# Run only the auth tests (filter by name)
cargo test login

# Run with output visible (println!, dbg!, etc.)
cargo test login -- --nocapture
```

### What happens when you run it

```
running 2 tests
test login_returns_200_and_sets_both_cookies ... ok
test login_with_wrong_password_returns_401 ... ok

test result: ok. 2 passed; 0 failed; 0 ignored
```

### Clean up test data

Each test creates a random email (`uuid@test.com`), so tests don't conflict. But over time your test DB accumulates rows. Quick cleanup:

```bash
psql homegame_test -c "TRUNCATE users, groups CASCADE;"
```

Or add a cleanup helper in `common/mod.rs`:

```rust
pub async fn cleanup(pool: &PgPool) {
    sqlx::query!("TRUNCATE users, groups CASCADE")
        .execute(pool)
        .await
        .unwrap();
}
```

---

## 2. Frontend — Next.js Component Test (Input component)

### Install dependencies first

```bash
cd apps/web
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

### Where it lives

```
apps/web/
  vitest.config.ts        <-- vitest config (create this)
  vitest.setup.ts         <-- extends matchers (create this)
  __tests__/
    components/
      input.test.tsx      <-- your test file
```

### Step 1 — Create `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",           // simulates a browser DOM
    setupFiles: ["./vitest.setup.ts"],
    globals: true,                  // no need to import describe/it/expect
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname), // matches your tsconfig "@/*" alias
    },
  },
});
```

### Step 2 — Create `vitest.setup.ts`

```ts
import "@testing-library/jest-dom";
// This adds matchers like .toBeInTheDocument(), .toHaveValue(), etc.
```

### Step 3 — Add test script to `package.json`

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

- `npm test` — watch mode (re-runs on file save, great during development)
- `npm run test:run` — single run (for CI)

### Step 4 — Write the test (`__tests__/components/input.test.tsx`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Input from "@/components/ui/input";

describe("Input component", () => {
  // ── Basic rendering ──

  it("renders with label and placeholder", () => {
    render(
      <Input
        id="email"
        title="Email"
        type="text"
        placeholder="you@example.com"
      />
    );

    // Check the label text exists
    expect(screen.getByLabelText("Email")).toBeInTheDocument();

    // Check the placeholder
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  // ── Controlled value + onChange ──

  it("calls onChange when user types", () => {
    const handleChange = vi.fn(); // vi.fn() = mock function

    render(
      <Input
        id="name"
        title="Name"
        type="text"
        placeholder="Your name"
        value=""
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "John" } });

    expect(handleChange).toHaveBeenCalledOnce();
  });

  // ── Password toggle ──

  it("toggles password visibility when eye icon is clicked", () => {
    render(
      <Input
        id="password"
        title="Password"
        type="password"
        placeholder="Enter password"
      />
    );

    const input = screen.getByLabelText("Password");

    // Initially the type should be "password" (hidden)
    expect(input).toHaveAttribute("type", "password");

    // Find the toggle button by its aria-label
    const toggleBtn = screen.getByRole("button", { name: /jelszó/i });
    fireEvent.click(toggleBtn);

    // After click, type should be "text" (visible)
    expect(input).toHaveAttribute("type", "text");

    // Click again to hide
    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute("type", "password");
  });

  // ── Non-password fields should NOT show the toggle ──

  it("does not show toggle button for non-password fields", () => {
    render(
      <Input
        id="email"
        title="Email"
        type="text"
        placeholder="you@example.com"
      />
    );

    // queryByRole returns null if not found (vs getByRole which throws)
    const toggleBtn = screen.queryByRole("button");
    expect(toggleBtn).not.toBeInTheDocument();
  });
});
```

### How to run it

```bash
cd apps/web

# Watch mode — re-runs when you save files
npm test

# Single run — for CI or quick check
npm run test:run

# Run only input tests (filter by filename)
npx vitest run input

# Run with verbose output
npx vitest run --reporter=verbose
```

### What happens when you run it

```
 ✓ __tests__/components/input.test.tsx (4)
   ✓ Input component
     ✓ renders with label and placeholder
     ✓ calls onChange when user types
     ✓ toggles password visibility when eye icon is clicked
     ✓ does not show toggle button for non-password fields

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  14:32:01
   Duration  1.24s
```

---

## Cheat Sheet

| What | Backend (Rust) | Frontend (Next.js) |
|---|---|---|
| **Framework** | `cargo test` + `axum-test` | `vitest` + `@testing-library/react` |
| **Test location** | `apps/api/tests/integration/` | `apps/web/__tests__/` |
| **Run all** | `cargo test` | `npm test` (watch) / `npm run test:run` (once) |
| **Run filtered** | `cargo test login` | `npx vitest run input` |
| **Mock/spy** | Not needed for integration tests | `vi.fn()`, `vi.mock()` |
| **Assertions** | `assert!()`, `assert_eq!()`, `response.assert_status()` | `expect().toBe()`, `.toBeInTheDocument()` |
| **Needs DB?** | Yes (`homegame_test`) | No (just DOM simulation) |

---

## Key concepts (in 30 seconds)

- **Backend integration test**: Boots your real app in memory (no network), sends HTTP requests, checks responses. Catches real bugs like the `AppendHeaders` cookie issue.
- **Frontend component test**: Renders a component in a fake DOM (jsdom), simulates clicks/typing, checks what appears on screen. Catches UI bugs like the password toggle not working.
- **You don't need both to start**: Pick whichever side you're actively changing. One test is infinitely better than zero tests.
