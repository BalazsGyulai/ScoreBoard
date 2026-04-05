# Testing Guide — HomeGame

> How senior engineers think about testing, what tools they use, and how to
> apply it to this project (Rust API + Next.js frontend + PostgreSQL).

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [The Testing Pyramid](#2-the-testing-pyramid)
3. [Should You Use Libraries or Write Your Own?](#3-should-you-use-libraries-or-write-your-own)
4. [Rust API Testing](#4-rust-api-testing)
5. [Next.js Frontend Testing](#5-nextjs-frontend-testing)
6. [Database Testing Strategy](#6-database-testing-strategy)
7. [What to Test First](#7-what-to-test-first)
8. [Recommended Tool Stack](#8-recommended-tool-stack)

---

## 1. Testing Philosophy

Senior engineers don't test everything — they test **the right things**.

### The core questions before writing any test:

| Question | Why it matters |
|----------|---------------|
| **If this breaks, does the user notice?** | Test it. |
| **Is this pure logic with clear inputs/outputs?** | Easy to unit test — do it. |
| **Is this just gluing two libraries together?** | Integration test, maybe. Don't unit test glue code. |
| **Will this catch a real regression?** | If yes, test it. If it just tests the framework, skip it. |

### What seniors DON'T do:
- Chase 100% code coverage (80% of value comes from 20% of tests)
- Test framework internals (don't test that axum routes work — axum already tests that)
- Test trivial getters/setters
- Write tests that break every time you refactor (brittle tests)

### What seniors DO:
- Test **business logic** (win calculation, score aggregation, auth rules)
- Test **API contracts** (does this endpoint return the right shape?)
- Test **edge cases** (what if someone submits 0 scores? empty name?)
- Test **the things that burned them before** (past bugs → regression tests)

---

## 2. The Testing Pyramid

```
        ╱  E2E  ╲             Few, slow, expensive (Playwright)
       ╱─────────╲            Real browser, full stack
      ╱Integration╲           Moderate count (axum-test, supertest)
     ╱─────────────╲          API handlers + database
    ╱   Unit Tests   ╲        Many, fast, cheap
   ╱───────────────────╲      Pure functions, logic, utilities
```

**For HomeGame, the sweet spot is the middle layer** — integration tests that
hit your API handlers with a real (test) database. Here's why:

- Your Rust handlers are thin — they query the DB and return JSON. Unit testing
  them without a DB means mocking everything, which tests nothing real.
- Your frontend is mostly server components that call the API. Testing the API
  contract gives you confidence the whole stack works.

---

## 3. Should You Use Libraries or Write Your Own?

**Short answer: Always use existing libraries.** Here's why:

### What testing libraries give you:

| Capability | DIY cost | Library |
|-----------|----------|---------|
| Test runner (find tests, run them, report results) | Weeks | `cargo test` / Vitest |
| Assertion library (`expect(x).toBe(y)`) | Days | Built into every framework |
| HTTP test client (send requests to your API) | Days | `axum-test` / `supertest` |
| DOM testing (render React, click buttons) | Months | `@testing-library/react` |
| Mocking (replace a function with a fake) | Days | Vitest built-in |
| Snapshot testing (detect UI changes) | Weeks | Vitest built-in |
| Coverage reporting | Weeks | `cargo-tarpaulin` / `v8` |
| Parallel execution | Weeks | Built into test runners |

### The rule of thumb:

```
"Use a library" unless you are literally building a testing framework.
```

No senior engineer writes their own test runner or assertion library. It's not
about being lazy — it's about spending time on **your product** instead of
reinventing solved problems.

### What you MIGHT write yourself:

- **Test helpers** — factory functions that create test data:
  ```rust
  // This is worth writing yourself:
  async fn create_test_user(db: &PgPool) -> (Uuid, String) { ... }
  async fn create_test_game(db: &PgPool, group_id: Uuid) -> Uuid { ... }
  ```
- **Custom assertions** for your domain:
  ```typescript
  // This is worth writing yourself:
  function expectLeaderboard(stats: PlayerStat[], expected: string[]) { ... }
  ```

---

## 4. Rust API Testing

### 4.1 Tools

| Tool | Purpose | You already have it? |
|------|---------|---------------------|
| `cargo test` | Built-in test runner | Yes (comes with Rust) |
| `axum-test` | HTTP client for axum handlers | Yes (in Cargo.toml) |
| `sqlx` | Test database management | Yes |
| `tokio::test` | Async test runtime | Yes (via tokio) |

### 4.2 Project structure

```
apps/api/
├── src/
│   ├── auth/
│   │   ├── handlers.rs      ← we test these
│   │   └── ...
│   ├── games/handlers.rs    ← we test these
│   ├── players/handlers.rs  ← we test these
│   ├── scores/handlers.rs   ← we test these
│   └── stats/handlers.rs    ← we test these
└── tests/
    ├── common/
    │   └── mod.rs            ← shared test helpers (create user, create game, etc.)
    └── integration/
        ├── auth_test.rs      ← test register → login → logout flow
        ├── games_test.rs     ← test CRUD + permissions
        ├── players_test.rs   ← test CRUD + leader-only rules
        ├── scores_test.rs    ← test round submission + advancement
        └── stats_test.rs     ← test leaderboard calculation
```

### 4.3 The test database pattern

Every test run uses an **isolated database**. The pattern seniors use:

```rust
// tests/common/mod.rs

use sqlx::PgPool;
use uuid::Uuid;

/// Creates a fresh database for this test, runs migrations, returns the pool.
/// The database is dropped when the pool is closed.
pub async fn setup_test_db() -> PgPool {
    let db_name = format!("homegame_test_{}", Uuid::new_v4().simple());
    let admin_url = "postgres://homegame_user:yourpass@localhost:5432/postgres";

    // Create a throwaway database
    let admin = PgPool::connect(admin_url).await.unwrap();
    sqlx::query(&format!("CREATE DATABASE \"{db_name}\""))
        .execute(&admin)
        .await
        .unwrap();
    admin.close().await;

    // Connect to it and run migrations
    let test_url = format!("postgres://homegame_user:yourpass@localhost:5432/{db_name}");
    let pool = PgPool::connect(&test_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    pool
}
```

### 4.4 Example: Integration test for auth

```rust
// tests/integration/auth_test.rs

use axum_test::TestServer;

mod common;
use common::setup_test_db;

#[tokio::test]
async fn register_login_flow() {
    let db = setup_test_db().await;
    let state = api::AppState { db, config: test_config() };
    let server = TestServer::new(api::router::build(state)).unwrap();

    // 1. Register
    let res = server
        .post("/auth/register")
        .json(&serde_json::json!({
            "username": "Alice",
            "email": "alice@test.com",
            "password": "password123",
            "password2": "password123"
        }))
        .await;

    res.assert_status(axum::http::StatusCode::CREATED);
    let body: serde_json::Value = res.json();
    assert_eq!(body["username"], "Alice");
    assert_eq!(body["role"], "leader");

    // 2. Login with same credentials
    let res = server
        .post("/auth/login")
        .json(&serde_json::json!({
            "email": "alice@test.com",
            "password": "password123"
        }))
        .await;

    res.assert_status_ok();

    // 3. Cookie should be set
    let cookie = res.header("set-cookie");
    assert!(cookie.to_str().unwrap().contains("hg_access_token="));
}

#[tokio::test]
async fn login_wrong_password_returns_401() {
    let db = setup_test_db().await;
    let state = api::AppState { db, config: test_config() };
    let server = TestServer::new(api::router::build(state)).unwrap();

    // Register first
    server.post("/auth/register")
        .json(&serde_json::json!({
            "username": "Bob",
            "email": "bob@test.com",
            "password": "password123",
            "password2": "password123"
        }))
        .await;

    // Login with wrong password
    let res = server
        .post("/auth/login")
        .json(&serde_json::json!({
            "email": "bob@test.com",
            "password": "wrong"
        }))
        .await;

    res.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}
```

### 4.5 Example: Testing business logic (leaderboard)

```rust
#[tokio::test]
async fn leaderboard_respects_winner_rule() {
    let db = setup_test_db().await;
    let state = api::AppState { db, config: test_config() };
    let server = TestServer::new(api::router::build(state)).unwrap();

    // Setup: register leader, add a player, create a "min" game
    let cookie = register_and_get_cookie(&server, "leader@test.com").await;
    add_player(&server, &cookie, "Player2", "p2@test.com").await;
    let game_id = create_game(&server, &cookie, "Skipbo", "min").await;

    let players = get_players(&server, &cookie).await;
    let leader_id = players[0]["id"].as_str().unwrap();
    let player2_id = players[1]["id"].as_str().unwrap();

    // Round 1: Leader scores 50, Player2 scores 30
    // With "min" rule, Player2 should win this round
    submit_round(&server, &cookie, &game_id, &[
        (leader_id, 50),
        (player2_id, 30),
    ]).await;

    // Check leaderboard
    let stats = get_leaderboard(&server, &cookie).await;
    assert_eq!(stats[0]["username"], "Player2");  // winner (lower score)
    assert_eq!(stats[0]["wins"], 1);
    assert_eq!(stats[1]["username"], "leader");
    assert_eq!(stats[1]["wins"], 0);
}
```

### 4.6 What NOT to test in Rust

- Don't test that `serde` serializes correctly (it does)
- Don't test that `axum` routes to the right handler (it does)
- Don't test that `bcrypt` hashes passwords (it does)
- Don't test that `sqlx` connects to postgres (it does)

---

## 5. Next.js Frontend Testing

### 5.1 Tools to install

```bash
cd apps/web
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner (fast, native ESM, Vite-based) |
| **@testing-library/react** | Render components, query by text/role |
| **@testing-library/jest-dom** | Extra matchers like `toBeInTheDocument()` |
| **jsdom** | Fake browser environment for tests |

> **Why Vitest over Jest?** Vitest is the modern choice for Next.js projects.
> Native TypeScript and ESM support, no babel config, 10x faster with Vite's
> transform pipeline. Jest works too, but needs more config for Next.js 15.

### 5.2 Config

```typescript
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

```typescript
// apps/web/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

### 5.3 What to test on the frontend

| Test type | Example | Tool |
|-----------|---------|------|
| Component renders | "Add player form shows all fields" | Vitest + Testing Library |
| User interactions | "Clicking submit calls fetch with correct body" | Vitest + Testing Library |
| Error states | "Shows error message on 409 Conflict" | Vitest + Testing Library |
| API helpers | "serverFetch adds cookie header" | Vitest (unit) |
| Full user flows | "Login → dashboard → create game" | Playwright (E2E) |

### 5.4 Example: Testing AddPlayerForm

```tsx
// app/(app)/players/AddPlayerForm.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddPlayerForm from "./AddPlayerForm";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("AddPlayerForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the add button initially", () => {
    render(<AddPlayerForm />);
    expect(screen.getByText("+ Játékos hozzáadása")).toBeInTheDocument();
  });

  it("opens the form when button is clicked", async () => {
    render(<AddPlayerForm />);
    await userEvent.click(screen.getByText("+ Játékos hozzáadása"));
    expect(screen.getByLabelText("Felhasználónév")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Jelszó")).toBeInTheDocument();
  });

  it("submits the form with correct data", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "123", username: "Test" }),
    });
    global.fetch = mockFetch;

    render(<AddPlayerForm />);
    await userEvent.click(screen.getByText("+ Játékos hozzáadása"));

    await userEvent.type(screen.getByLabelText("Felhasználónév"), "TestPlayer");
    await userEvent.type(screen.getByLabelText("Email"), "test@example.com");
    await userEvent.type(screen.getByLabelText("Jelszó"), "secret123");
    await userEvent.click(screen.getByText("Hozzáadás"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "TestPlayer",
          email: "test@example.com",
          password: "secret123",
        }),
      });
    });
  });

  it("shows error on conflict", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Email already taken" }),
    });

    render(<AddPlayerForm />);
    await userEvent.click(screen.getByText("+ Játékos hozzáadása"));

    await userEvent.type(screen.getByLabelText("Felhasználónév"), "Test");
    await userEvent.type(screen.getByLabelText("Email"), "taken@test.com");
    await userEvent.type(screen.getByLabelText("Jelszó"), "password1");
    await userEvent.click(screen.getByText("Hozzáadás"));

    await waitFor(() => {
      expect(screen.getByText("Email already taken")).toBeInTheDocument();
    });
  });
});
```

### 5.5 What NOT to test on the frontend

- Don't test that `<Link>` navigates (that's Next.js's job)
- Don't test that CSS looks right (use your eyes or Playwright screenshots)
- Don't test server components that just fetch and render (test the API instead)
- Don't test third-party component libraries

---

## 6. Database Testing Strategy

### The golden rule:

**Every test gets its own database (or transaction that rolls back).**

Two approaches:

### Approach A: Throwaway database per test (recommended for this project)

```
Test starts → CREATE DATABASE test_abc123
            → Run migrations
            → Run test
            → DROP DATABASE test_abc123
```

- Pros: Complete isolation, tests can run in parallel
- Cons: Slightly slower (~200ms per test for DB setup)

### Approach B: Transaction rollback

```
Test starts → BEGIN
            → Insert test data
            → Run assertions
            → ROLLBACK
```

- Pros: Fastest (no schema setup)
- Cons: Can't test things that require COMMIT (like constraint violations)

### For HomeGame:

Use Approach A. Your tests need to verify constraint behavior (unique emails,
foreign keys, cascading deletes). A 200ms overhead per test is negligible.

---

## 7. What to Test First

Priority order for HomeGame (highest value first):

| Priority | What | Why | Type |
|----------|------|-----|------|
| 1 | **Auth flow** (register → login → access protected route) | If auth breaks, nothing works | Integration |
| 2 | **Leaderboard calculation** | Complex SQL, easy to break, core feature | Integration |
| 3 | **Score submission** (round insert + counter increment) | Transaction logic, data integrity | Integration |
| 4 | **Permission checks** (leader-only routes) | Security boundary | Integration |
| 5 | **Edge cases** (empty scores, duplicate names, self-delete) | Past/future bugs | Integration |
| 6 | **AddPlayerForm** | Most complex client component | Component |
| 7 | **RoundForm** | Score entry UX | Component |
| 8 | **Full login flow** | Catch cookie/redirect regressions | E2E (later) |

### Start with #1 and #2. You'll learn the patterns, and the rest becomes mechanical.

---

## 8. Recommended Tool Stack

### Final recommendation for HomeGame:

```
┌─────────────────────────────────────────────────────┐
│  RUST API                                           │
│                                                     │
│  cargo test              ← built-in test runner     │
│  axum-test               ← HTTP client (you have it)│
│  sqlx::migrate!          ← test DB setup            │
│  cargo-tarpaulin         ← coverage (optional)      │
│                                                     │
├─────────────────────────────────────────────────────┤
│  NEXT.JS FRONTEND                                   │
│                                                     │
│  vitest                  ← test runner              │
│  @testing-library/react  ← component testing        │
│  jsdom                   ← browser environment      │
│  playwright (later)      ← E2E tests                │
│                                                     │
├─────────────────────────────────────────────────────┤
│  CI/CD (see CI_CD_GUIDE.md)                         │
│                                                     │
│  GitHub Actions          ← run tests on every PR    │
│  Docker Compose          ← PostgreSQL in CI         │
└─────────────────────────────────────────────────────┘
```

### Cost: $0

Every tool listed above is free and open-source. GitHub Actions gives you
2,000 free minutes/month on private repos.
