# Auth Guide — Login & Register (Rust + Next.js + PostgreSQL)

This guide walks you through building the complete authentication flow from scratch.
By the end you will have:
- A running PostgreSQL database with the schema applied
- A Rust API that handles `/auth/register` and `/auth/login`
- A Next.js login and register page that talks to that API
- JWT tokens stored in HttpOnly cookies (secure, no sessionStorage)

---

## Table of Contents

1. [Concepts you need to understand first](#1-concepts)
2. [Prerequisites — what to install](#2-prerequisites)
3. [Database setup](#3-database-setup)
4. [Rust backend — step by step](#4-rust-backend)
5. [Next.js frontend — step by step](#5-nextjs-frontend)
6. [Running everything together](#6-running-everything)
7. [Unit tests](#7-unit-tests)
8. [What to do when something breaks](#8-debugging)

---

## 1. Concepts

### Why not sessionStorage like the old app?

The old app stored `userID`, `gameID` and a `loginsha` in the browser's sessionStorage.
Problems with that:
- Any JavaScript on the page can read sessionStorage → XSS attack steals the token
- It disappears when you close the tab → bad UX
- The `loginsha` was never actually validated server-side → it was fake security

### The new approach: HttpOnly cookies + JWT

```
Browser                           Rust API
  │                                   │
  │── POST /auth/login ──────────────►│
  │   { username, password }          │  1. Find user in DB
  │                                   │  2. Verify bcrypt hash
  │                                   │  3. Create JWT access token  (15 min)
  │                                   │  4. Create JWT refresh token (7 days)
  │◄─ 200 OK ─────────────────────────│
  │   Set-Cookie: hg_access_token=... │     HttpOnly; Secure; SameSite=Lax
  │   Set-Cookie: hg_refresh_token=...|     HttpOnly; Secure; SameSite=Lax
  │                                   │
  │── GET /games (later) ────────────►│
  │   Cookie: hg_access_token=...     │  5. Read cookie automatically
  │                                   │  6. Verify JWT signature
  │◄─ 200 { games: [...] } ───────────│
```

**HttpOnly** means JavaScript CANNOT read the cookie. Only the browser sends it automatically.
This eliminates the XSS risk of sessionStorage entirely.

### What is a JWT?

JWT = JSON Web Token. It is a signed string that looks like this:
```
eyJhbGci....   .   eyJ1c2VyX2lk....   .   SflKxwRJSMeKKF...
   header            payload                 signature
```

The payload contains your claims — who the user is, their role, when it expires:
```json
{
  "sub": "user-uuid-here",
  "group_id": "group-uuid-here",
  "role": "leader",
  "scope": ["read", "write"],
  "exp": 1712345678
}
```

The signature is created with a secret key only the server knows.
When the server receives a token, it re-verifies the signature. If someone tampers with
the payload, the signature won't match and the token is rejected.

**Two tokens:**
- `access_token` — short-lived (15 min). Used for every API request.
- `refresh_token` — long-lived (7 days). Only used to get a new access_token when the old one expires.

### What is bcrypt?

The old PHP app already used bcrypt — same idea in Rust.
You never store a plain password. You store a hash:
```
password "hunter2"  →  bcrypt  →  "$2b$10$KIX..."
```
bcrypt is intentionally slow (the `10` is the cost factor — 2^10 rounds).
Verifying takes ~100ms on purpose to slow down brute-force attacks.

---

## 2. Prerequisites

### Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable
rustc --version   # should be >= 1.85 for edition 2024
```

### Install PostgreSQL (macOS)
```bash
brew install postgresql@16
brew services start postgresql@16
# Add to your shell profile:
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
psql --version
```

### Install sqlx-cli (runs your migrations)
```bash
cargo install sqlx-cli --no-default-features --features postgres
sqlx --version
```

### Install cargo-watch (hot reload for Rust during development)
```bash
cargo install cargo-watch
```

---

## 3. Database Setup

### Create the database
```bash
# Connect as your system user (no password needed locally)
psql postgres

# Inside psql:
CREATE DATABASE homegame;
CREATE USER homegame_user WITH PASSWORD 'localpassword';
GRANT ALL PRIVILEGES ON DATABASE homegame TO homegame_user;
\q
```

### Create the .env file for the Rust API

Create `apps/api/.env` with:
```
DATABASE_URL=postgres://homegame_user:localpassword@localhost/homegame
JWT_SECRET=some-long-random-secret-change-in-production
JWT_ACCESS_EXPIRY_MINUTES=15
JWT_REFRESH_EXPIRY_DAYS=7
PORT=8080
```

> ⚠️ Never commit .env to git. It is already in .gitignore.

### Run the migration

From inside `apps/api/`:
```bash
cd apps/api

# This reads DATABASE_URL from .env and runs migrations/0001_init.sql
sqlx migrate run

# Verify the tables were created:
psql postgres://homegame_user:localpassword@localhost/homegame -c "\dt"
```

You should see:
```
          List of relations
 Schema │      Name       │ Type
────────┼─────────────────┼──────
 public │ games           │ table
 public │ groups          │ table
 public │ refresh_tokens  │ table
 public │ scores          │ table
 public │ users           │ table
```

---

## 4. Rust Backend

Work through these files in order. Each file is small and focused.

### Step 4.1 — config.rs

Reads environment variables once at startup.
Everything else in the app reads from this struct — no `std::env::var` scattered everywhere.

```rust
// src/config.rs
use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url:              String,
    pub jwt_secret:                String,
    pub jwt_access_expiry_minutes: i64,
    pub jwt_refresh_expiry_days:   i64,
    pub port:                      u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            jwt_secret: env::var("JWT_SECRET")
                .expect("JWT_SECRET must be set"),
            jwt_access_expiry_minutes: env::var("JWT_ACCESS_EXPIRY_MINUTES")
                .unwrap_or("15".into())
                .parse()
                .expect("JWT_ACCESS_EXPIRY_MINUTES must be a number"),
            jwt_refresh_expiry_days: env::var("JWT_REFRESH_EXPIRY_DAYS")
                .unwrap_or("7".into())
                .parse()
                .expect("JWT_REFRESH_EXPIRY_DAYS must be a number"),
            port: env::var("PORT")
                .unwrap_or("8080".into())
                .parse()
                .expect("PORT must be a number"),
        }
    }
}
```

### Step 4.2 — db/pool.rs

Creates the database connection pool.
A pool keeps several connections open so requests don't wait for a new connection every time.

```rust
// src/db/pool.rs
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(10)          // max 10 simultaneous DB connections
        .connect(database_url)
        .await
        .expect("Failed to connect to PostgreSQL")
}
```

```rust
// src/db/mod.rs
pub mod pool;
```

### Step 4.3 — The AppState

Every axum handler needs access to the database pool, config, and (later) the SSE broadcaster.
In axum, shared state is passed with `State<T>`. Define it once:

```rust
// src/main.rs  (add this, replace the println stub)
mod auth;
mod config;
mod db;
mod games;
mod players;
mod router;
mod scores;
mod sse;
mod stats;

use config::Config;
use db::pool::create_pool;

// AppState is cloned cheaply — each field is an Arc internally
#[derive(Clone)]
pub struct AppState {
    pub db:     sqlx::PgPool,
    pub config: Config,
}

#[tokio::main]
async fn main() {
    // Load .env file in development
    dotenvy::dotenv().ok();

    // Set up logging: RUST_LOG=debug cargo run
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::from_env();
    let db     = create_pool(&config.database_url).await;

    // Run any pending migrations automatically on startup
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("Failed to run migrations");

    let state  = AppState { db, config: config.clone() };
    let app    = router::build(state);
    let addr   = format!("0.0.0.0:{}", config.port);

    tracing::info!("API listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

Add `dotenvy` to Cargo.toml dependencies:
```toml
dotenvy = "0.15"
```

### Step 4.4 — auth/models.rs

The User struct maps directly to the `users` table row.

```rust
// src/auth/models.rs
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id:         Uuid,
    pub group_id:   Uuid,
    pub username:   String,
    pub pass_hash:  String,
    pub role:       String,         // "leader" | "member" | "viewer"
    pub email:      Option<String>,
    pub created_at: DateTime<Utc>,
}

// What comes IN from the HTTP request body for registration
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username:  String,
    pub password:  String,
    pub password2: String,
}

// What comes IN from the HTTP request body for login
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

// What goes OUT in the JSON response
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user_id:  Uuid,
    pub group_id: Uuid,
    pub username: String,
    pub role:     String,
}
```

### Step 4.5 — auth/tokens.rs

JWT creation and verification.

```rust
// src/auth/tokens.rs
use crate::AppState;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// These are the fields that go INSIDE the JWT payload
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub:      String,         // user UUID
    pub group_id: String,         // group UUID
    pub role:     String,
    pub scope:    Vec<String>,    // ["read", "write"] or ["read"] for viewer
    pub exp:      i64,            // unix timestamp — when the token expires
    pub iat:      i64,            // unix timestamp — when it was issued
}

pub fn create_access_token(
    state: &AppState,
    user_id: Uuid,
    group_id: Uuid,
    role: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now     = Utc::now();
    let expires = now + Duration::minutes(state.config.jwt_access_expiry_minutes);

    let scope = if role == "viewer" {
        vec!["read".to_string()]
    } else {
        vec!["read".to_string(), "write".to_string()]
    };

    let claims = Claims {
        sub:      user_id.to_string(),
        group_id: group_id.to_string(),
        role:     role.to_string(),
        scope,
        exp:      expires.timestamp(),
        iat:      now.timestamp(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
}

pub fn create_refresh_token(
    state: &AppState,
    user_id: Uuid,
    group_id: Uuid,
    role: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now     = Utc::now();
    let expires = now + Duration::days(state.config.jwt_refresh_expiry_days);

    let claims = Claims {
        sub:      user_id.to_string(),
        group_id: group_id.to_string(),
        role:     role.to_string(),
        scope:    vec![],         // refresh tokens don't carry scope
        exp:      expires.timestamp(),
        iat:      now.timestamp(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
}

pub fn verify_token(
    state: &AppState,
    token: &str,
) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}
```

### Step 4.6 — auth/handlers.rs

The actual register and login logic.

```rust
// src/auth/handlers.rs
use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use axum_extra::extract::cookie::{Cookie, SameSite};
use uuid::Uuid;

use crate::AppState;
use super::models::{AuthResponse, LoginRequest, RegisterRequest, User};
use super::tokens::{create_access_token, create_refresh_token};

// ─── Helper: build the Set-Cookie header value ──────────────────────────────

fn make_cookie(name: &str, value: String, max_age_secs: i64) -> String {
    format!(
        "{name}={value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={max_age_secs}"
    )
}

// ─── POST /auth/register ─────────────────────────────────────────────────────

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Response {
    // 1. Validate input
    if body.username.trim().is_empty() || body.password.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Username and password are required"
        }))).into_response();
    }
    if body.password != body.password2 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Passwords do not match"
        }))).into_response();
    }
    if body.password.len() < 8 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Password must be at least 8 characters"
        }))).into_response();
    }

    // 2. Hash the password (bcrypt, cost = 10)
    let pass_hash = match bcrypt::hash(&body.password, 10) {
        Ok(h)  => h,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // 3. Create a new group + user in a transaction
    //    If either INSERT fails, both are rolled back automatically.
    let mut tx = match state.db.begin().await {
        Ok(tx)  => tx,
        Err(_)  => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let group_id = Uuid::new_v4();
    let user_id  = Uuid::new_v4();

    // Insert the group
    let group_result = sqlx::query!(
        "INSERT INTO groups (id) VALUES ($1)",
        group_id
    )
    .execute(&mut *tx)
    .await;

    if group_result.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Insert the user as leader of the new group
    let user_result = sqlx::query!(
        r#"
        INSERT INTO users (id, group_id, username, pass_hash, role)
        VALUES ($1, $2, $3, $4, 'leader')
        "#,
        user_id,
        group_id,
        body.username.trim(),
        pass_hash,
    )
    .execute(&mut *tx)
    .await;

    match user_result {
        Ok(_) => {}
        Err(e) => {
            // Unique constraint violation = username already taken in this group
            if e.to_string().contains("unique") {
                return (StatusCode::CONFLICT, Json(serde_json::json!({
                    "error": "Username already taken"
                }))).into_response();
            }
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    if tx.commit().await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // 4. Issue tokens
    let access_token = match create_access_token(&state, user_id, group_id, "leader") {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let refresh_token = match create_refresh_token(&state, user_id, group_id, "leader") {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let access_max_age  = state.config.jwt_access_expiry_minutes  * 60;
    let refresh_max_age = state.config.jwt_refresh_expiry_days     * 86_400;

    // 5. Return tokens as HttpOnly cookies + user info in body
    (
        StatusCode::CREATED,
        [
            (header::SET_COOKIE, make_cookie("hg_access_token",  access_token,  access_max_age)),
            (header::SET_COOKIE, make_cookie("hg_refresh_token", refresh_token, refresh_max_age)),
        ],
        Json(AuthResponse {
            user_id,
            group_id,
            username: body.username.trim().to_string(),
            role: "leader".to_string(),
        }),
    )
        .into_response()
}

// ─── POST /auth/login ────────────────────────────────────────────────────────

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Response {
    // 1. Find user by username
    //    NOTE: usernames are unique per group, but a username can exist in multiple groups.
    //    For now we find by username globally. Later: the user supplies their group code.
    let user = sqlx::query_as!(
        User,
        "SELECT * FROM users WHERE username = $1 LIMIT 1",
        body.username,
    )
    .fetch_optional(&state.db)
    .await;

    let user = match user {
        Ok(Some(u)) => u,
        Ok(None) => {
            // Return the same error as wrong password — don't leak whether the username exists
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                "error": "Invalid username or password"
            }))).into_response();
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // 2. Verify password
    let valid = bcrypt::verify(&body.password, &user.pass_hash).unwrap_or(false);
    if !valid {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "error": "Invalid username or password"
        }))).into_response();
    }

    // 3. Issue tokens
    let access_token = match create_access_token(&state, user.id, user.group_id, &user.role) {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let refresh_token = match create_refresh_token(&state, user.id, user.group_id, &user.role) {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let access_max_age  = state.config.jwt_access_expiry_minutes  * 60;
    let refresh_max_age = state.config.jwt_refresh_expiry_days     * 86_400;

    // 4. Return tokens as HttpOnly cookies + user info in body
    (
        StatusCode::OK,
        [
            (header::SET_COOKIE, make_cookie("hg_access_token",  access_token,  access_max_age)),
            (header::SET_COOKIE, make_cookie("hg_refresh_token", refresh_token, refresh_max_age)),
        ],
        Json(AuthResponse {
            user_id:  user.id,
            group_id: user.group_id,
            username: user.username,
            role:     user.role,
        }),
    )
        .into_response()
}

// ─── POST /auth/logout ───────────────────────────────────────────────────────

pub async fn logout() -> Response {
    // Expire both cookies immediately by setting Max-Age=0
    (
        StatusCode::OK,
        [
            (header::SET_COOKIE, "hg_access_token=;  HttpOnly; Path=/; Max-Age=0".to_string()),
            (header::SET_COOKIE, "hg_refresh_token=; HttpOnly; Path=/; Max-Age=0".to_string()),
        ],
        Json(serde_json::json!({ "message": "Logged out" })),
    )
        .into_response()
}
```

```rust
// src/auth/mod.rs
pub mod handlers;
pub mod models;
pub mod tokens;
```

### Step 4.7 — router.rs

Wire everything together.

```rust
// src/router.rs
use axum::{routing::post, Router};
use tower_http::cors::{Any, CorsLayer};
use crate::{auth::handlers, AppState};

pub fn build(state: AppState) -> Router {
    // CORS: in development allow the Next.js dev server (port 3000)
    // In production, only allow your actual domain
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:3000".parse().unwrap(),
        ])
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_credentials(true);   // required for cookies to be sent cross-origin

    Router::new()
        // Auth routes
        .route("/auth/register", post(handlers::register))
        .route("/auth/login",    post(handlers::login))
        .route("/auth/logout",   post(handlers::logout))
        // State is available to every handler via State<AppState>
        .with_state(state)
        .layer(cors)
}
```

### Step 4.8 — Run the Rust API

```bash
cd apps/api

# First time: sqlx needs the DB to be running to check queries at compile time
export DATABASE_URL=postgres://homegame_user:localpassword@localhost/homegame

# Run with hot reload (recompiles on file save)
cargo watch -x run

# You should see:
# INFO api: API listening on 0.0.0.0:8080
```

### Step 4.9 — Test the API with curl (before building the frontend)

**Register:**
```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"Bali","password":"mypassword","password2":"mypassword"}' \
  -c cookies.txt -v
```

You should see `Set-Cookie: hg_access_token=...` in the response headers.

**Login:**
```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Bali","password":"mypassword"}' \
  -c cookies.txt -v
```

**Logout:**
```bash
curl -X POST http://localhost:8080/auth/logout \
  -b cookies.txt -v
```

---

## 5. Next.js Frontend

### Step 5.1 — Environment variables for Next.js

Create `apps/web/.env.local`:
```
# Internal URL — only the Next.js SERVER uses this (Server Components, route handlers)
# Never exposed to the browser
API_URL=http://localhost:8080

# This is set in next.config.ts already — no need to repeat
```

### Step 5.2 — lib/api/auth.ts

This file contains the typed fetch wrappers for auth endpoints.
These run on the SERVER (inside Server Actions or Route Handlers) — not in the browser.

```typescript
// lib/api/auth.ts
import type { RegisterRequest, LoginRequest, LoginResponse } from "@/types/api";

const API = process.env.API_URL!;

// Helper: throws if the response is not OK, returns parsed JSON
async function apiCall<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Don't cache auth calls — always hit the server
    cache: "no-store",
  });

  const data = await res.json();

  if (!res.ok) {
    // data.error comes from the Rust API's JSON error response
    throw new Error(data.error ?? "Unknown error");
  }

  return data as T;
}

export async function apiRegister(body: RegisterRequest) {
  return apiCall<LoginResponse>(`${API}/auth/register`, body);
}

export async function apiLogin(body: LoginRequest) {
  return apiCall<LoginResponse>(`${API}/auth/login`, body);
}
```

### Step 5.3 — lib/auth/session.ts

Reading and writing the auth cookie on the server side.

```typescript
// lib/auth/session.ts
import { cookies } from "next/headers";
import type { Session } from "@/types/domain";

const ACCESS_COOKIE  = "hg_access_token";
const REFRESH_COOKIE = "hg_refresh_token";

// Read the access token from the incoming request's cookies.
// Call this inside Server Components or Route Handlers.
export async function getAccessToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value;
}

// Write both tokens into the response cookies (called after login/register).
// The Rust API already sets them via Set-Cookie headers, but if you ever
// need to set them from a Next.js Server Action, use this.
export async function setAuthCookies(
  accessToken:  string,
  refreshToken: string,
  accessMaxAge:  number = 15 * 60,       // 15 minutes in seconds
  refreshMaxAge: number = 7 * 24 * 3600, // 7 days in seconds
) {
  const jar = await cookies();

  jar.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   accessMaxAge,
  });

  jar.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   refreshMaxAge,
  });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
```

### Step 5.4 — The Login page

```typescript
// app/(auth)/login/page.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      // Call our Next.js Route Handler (not the Rust API directly)
      // The route handler proxies the request and handles the cookies
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh(); // re-run server components to pick up the new cookie
      } else {
        const data = await res.json();
        setError(data.error ?? "Belépés sikertelen");
      }
    });
  };

  return (
    <div className={styles.page}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Belépés</h1>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.field}>
          <label htmlFor="username">Felhasználónév</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Jelszó</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isPending || !username || !password}
          >
            {isPending ? "..." : "Belépés"}
          </button>
          <Link href="/register" className={styles.secondaryBtn}>
            Regisztráció
          </Link>
        </div>
      </form>
    </div>
  );
}
```

CSS module for it:
```css
/* app/(auth)/login/login.module.css */
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: 380px;
  padding: var(--space-8);
}

.title {
  font-size: 1.75rem;
  font-weight: bold;
  color: var(--color-primary);
}

.error {
  color: var(--color-error);
  font-size: 0.9rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field label {
  font-weight: 600;
  font-size: 1rem;
}

.field input {
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.field input:focus {
  border-color: var(--color-secondary);
}

.actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.primaryBtn {
  flex: 1;
  padding: var(--space-3);
  background: var(--color-secondary);
  color: #fff;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 1rem;
}

.primaryBtn:disabled {
  background: var(--color-disabled);
  cursor: not-allowed;
}

.secondaryBtn {
  flex: 1;
  padding: var(--space-3);
  border: 2px solid var(--color-secondary);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 1rem;
  text-align: center;
  color: var(--color-secondary);
}
```

### Step 5.5 — The Route Handler (proxy between browser and Rust)

The browser calls `/api/auth/login` (a Next.js Route Handler).
The Route Handler calls the Rust API server-side and forwards the Set-Cookie headers back.

```typescript
// app/api/auth/login/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  // Call the Rust API from the server side
  const rustRes = await fetch(`${process.env.API_URL}/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    cache:   "no-store",
  });

  const data = await rustRes.json();

  // Forward the status code from Rust
  const response = NextResponse.json(data, { status: rustRes.status });

  // Forward the Set-Cookie headers from the Rust API to the browser
  // This is what actually puts the HttpOnly cookies in the browser
  const cookies = rustRes.headers.getSetCookie();
  cookies.forEach((cookie) => {
    response.headers.append("Set-Cookie", cookie);
  });

  return response;
}
```

Do the same for `/api/auth/register/route.ts` and `/api/auth/logout/route.ts`.

### Step 5.6 — Register page

Same pattern as login, slightly different fields:

```typescript
// app/(auth)/register/page.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./register.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [password2, setPassword2] = useState("");
  const [error,     setError]     = useState<string | null>(null);

  const passwordsMatch = password === password2 || password2 === "";
  const canSubmit = username && password.length >= 8 && password === password2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, password2 }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Regisztráció sikertelen");
      }
    });
  };

  return (
    <div className={styles.page}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Regisztráció</h1>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.field}>
          <label htmlFor="username">Felhasználónév</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Jelszó</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <span className={styles.hint}>Legalább 8 karakter</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="password2">Jelszó újra</label>
          <input
            id="password2"
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
            autoComplete="new-password"
            className={!passwordsMatch ? styles.inputError : ""}
          />
          {!passwordsMatch && (
            <span className={styles.errorHint}>A jelszók nem egyeznek</span>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isPending || !canSubmit}
          >
            {isPending ? "..." : "Regisztráció"}
          </button>
          <Link href="/login" className={styles.secondaryBtn}>
            Belépés
          </Link>
        </div>
      </form>
    </div>
  );
}
```

---

## 6. Running Everything Together

### Terminal 1 — PostgreSQL (if not running as a service)
```bash
brew services start postgresql@16
# or if you prefer to run it manually:
pg_ctl -D /opt/homebrew/var/postgresql@16 start
```

### Terminal 2 — Rust API
```bash
cd apps/api
export DATABASE_URL=postgres://homegame_user:localpassword@localhost/homegame
cargo watch -x run
```

### Terminal 3 — Next.js
```bash
cd apps/web
npm run dev
# or from monorepo root:
npm run dev
```

Open `http://localhost:3000` — you should be redirected to `/login`.

### Full flow to verify:
1. Go to `http://localhost:3000/register`
2. Register with a username and password
3. You are redirected to `/dashboard`
4. Open DevTools → Application → Cookies → you should see `hg_access_token` with HttpOnly checked
5. Try to manually read it in the console: `document.cookie` — it will NOT contain the token (HttpOnly working)
6. Logout → cookie is cleared → redirected to `/login`

---

## 7. Unit Tests

### Why test?

You write a function. It works today. Three weeks later you change something unrelated
and it silently breaks. Tests catch this before the user does.

### Rust tests

Rust has testing built into the language. You add a `#[test]` function in the same file.

```rust
// In src/auth/tokens.rs, add at the bottom:

#[cfg(test)]
mod tests {
    use super::*;

    // Fake AppState for tests — doesn't need a real DB
    fn test_state() -> crate::AppState {
        crate::AppState {
            db: todo!(), // we don't need DB for token tests
            config: crate::config::Config {
                database_url:              "unused".into(),
                jwt_secret:                "test-secret-key".into(),
                jwt_access_expiry_minutes: 15,
                jwt_refresh_expiry_days:   7,
                port:                      8080,
            },
        }
    }

    #[test]
    fn access_token_can_be_verified() {
        let state    = test_state();
        let user_id  = uuid::Uuid::new_v4();
        let group_id = uuid::Uuid::new_v4();

        let token  = create_access_token(&state, user_id, group_id, "leader").unwrap();
        let claims = verify_token(&state, &token).unwrap();

        assert_eq!(claims.sub,      user_id.to_string());
        assert_eq!(claims.group_id, group_id.to_string());
        assert_eq!(claims.role,     "leader");
        assert!(claims.scope.contains(&"write".to_string()));
    }

    #[test]
    fn viewer_token_has_no_write_scope() {
        let state    = test_state();
        let user_id  = uuid::Uuid::new_v4();
        let group_id = uuid::Uuid::new_v4();

        let token  = create_access_token(&state, user_id, group_id, "viewer").unwrap();
        let claims = verify_token(&state, &token).unwrap();

        assert!(!claims.scope.contains(&"write".to_string()));
        assert!(claims.scope.contains(&"read".to_string()));
    }

    #[test]
    fn tampered_token_fails_verification() {
        let state    = test_state();
        let user_id  = uuid::Uuid::new_v4();
        let group_id = uuid::Uuid::new_v4();

        let token   = create_access_token(&state, user_id, group_id, "leader").unwrap();
        let tampered = format!("{}x", token);   // append a character to corrupt it

        assert!(verify_token(&state, &tampered).is_err());
    }
}
```

Run them:
```bash
cd apps/api
cargo test
```

### Next.js tests (Vitest)

Install first:
```bash
cd apps/web
npm install --save-dev vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

Add to `apps/web/package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles:  ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

Create `apps/web/vitest.setup.ts`:
```typescript
import "@testing-library/jest-dom";
```

Example test for the login form:
```typescript
// __tests__/login.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// We can't test the full page easily (it needs a router)
// but we CAN test that our validation logic works.

describe("Login form validation", () => {
  it("submit is disabled when fields are empty", () => {
    // Render a minimal version
    const { getByRole } = render(
      <form>
        <input data-testid="user" value="" readOnly />
        <input data-testid="pass" value="" readOnly />
        <button type="submit" disabled={true}>Belépés</button>
      </form>
    );
    expect(getByRole("button")).toBeDisabled();
  });
});
```

Run:
```bash
npm run test
```

---

## 8. Debugging

### "Connection refused" when Next.js calls the API
- Check that the Rust API is running: `curl http://localhost:8080/auth/login`
- Check `API_URL` in `apps/web/.env.local` is correct
- Check `next.config.ts` rewrite is pointing to the right port

### "relation does not exist" from Rust
- Migrations haven't run: `sqlx migrate run` inside `apps/api/`
- Wrong `DATABASE_URL` — verify with `echo $DATABASE_URL`

### Cookie not being set
- Open DevTools → Network → look at the `/api/auth/login` response headers
- Check for `Set-Cookie` header
- Make sure CORS `allow_credentials(true)` is set in `router.rs`
- In development: cookies work on `localhost` without HTTPS

### cargo: "error: package `api` cannot be built because it requires rustc 1.85"
- Run `rustup update stable` to get the latest Rust

### sqlx: "error: `DATABASE_URL` not set"
- sqlx checks queries AT COMPILE TIME and needs to reach the DB
- Either have the DB running during `cargo build`, or run `cargo sqlx prepare` first to cache the query analysis offline

### "passwords do not match" even though they look the same
- Check for whitespace — trim your inputs before comparing
