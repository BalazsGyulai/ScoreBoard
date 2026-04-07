# How Requests Flow: From Browser to Database and Back

This guide explains how data moves through the app using two real examples:
1. **Games list page** — fetches all games (simple GET, uses a rewrite)
2. **Score update** — edits a score value (PUT, uses a route handler)

By the end you'll understand:
- Why some requests use **rewrites** and others need a **route handler**
- How Rust/Axum knows **which function to call** for each request
- How **authentication** works automatically on every request

---

## The Big Picture

```
Browser (React)
    |
    |  fetch("/api/games")  or  fetch("/api/scores/abc", { method: "PUT" })
    v
Next.js Server (port 3000)
    |
    |  Either:
    |    a) Rewrite rule  — silently proxies the request (like a redirect the browser can't see)
    |    b) Route handler — a TypeScript file that manually forwards the request
    v
Rust API Server (port 8080)
    |
    |  Axum router matches the URL + HTTP method to a handler function
    v
Handler Function
    |
    |  Runs SQL query via sqlx
    v
PostgreSQL Database
```

The key idea: **the browser never talks to Rust directly**. Everything goes through
Next.js first. The browser only knows about `localhost:3000`.

---

## Example 1: Loading the Games List (GET)

### Step 1 — React fetches data with SWR

**File:** `apps/web/app/(app)/games/page.tsx`

```typescript
const { data: games } = useSWR<ApiGame[]>("/api/games", fetchGames);
```

SWR calls `fetchGames("/api/games")`, which does:

```typescript
const res = await fetch("/api/games", {
    credentials: "include",  // <-- sends the auth cookie along
});
```

The browser sends: `GET http://localhost:3000/api/games`

### Step 2 — Next.js rewrites the URL

**File:** `apps/web/next.config.ts`

```typescript
async rewrites() {
    const API_URL = "http://localhost:8080";
    return [
        {
            source: "/api/games",           // what the browser asked for
            destination: `${API_URL}/games`, // where Next.js actually sends it
        },
        // ...
    ];
}
```

A **rewrite** is like an invisible redirect. The browser thinks it's talking to
`/api/games` on port 3000, but Next.js quietly forwards the request to
`http://localhost:8080/games` on the Rust server. The browser never sees port 8080.

**Rewrites work great for simple GET requests.** Next.js forwards the headers
(including cookies) automatically.

### Step 3 — Axum matches the route to a function

**File:** `apps/api/src/router.rs`

```rust
Router::new()
    .route(
        "/games",
        get(games::handlers::list_games).post(games::handlers::create_game),
    )
```

This is how Axum knows which function to call. It works like a table:

| URL       | HTTP Method | Function called                  |
|-----------|-------------|----------------------------------|
| `/games`  | GET         | `games::handlers::list_games`    |
| `/games`  | POST        | `games::handlers::create_game`   |

When the request `GET /games` arrives, Axum looks through all `.route()` calls,
finds the one matching `/games`, then checks the HTTP method (GET) and calls
`list_games`.

**Think of it like a phone switchboard:** the URL is the extension number and the
HTTP method (GET/POST/PUT/DELETE) is which department you want.

### Step 4 — The handler function runs

**File:** `apps/api/src/games/handlers.rs`

```rust
pub async fn list_games(
    auth: AuthUser,              // 1. Axum extracts this from the cookie
    State(state): State<AppState>, // 2. Axum injects the database connection
) -> Response {
    let result = sqlx::query_as!(
        Game,
        "SELECT id, group_id, name, winner_rule, icon, current_round, created_at
         FROM games WHERE group_id = $1 ORDER BY name",
        auth.group_id,           // 3. Only returns games for YOUR group
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(games) => Json(games).into_response(),  // 4. Sends back JSON
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
```

The magic here is the **function signature**. You don't call these parameters
yourself — Axum reads the signature and automatically fills them in:

- `auth: AuthUser` — Axum sees this type, runs the `AuthUser` extractor (reads the
  cookie, decodes the JWT token, gives you `user_id` and `group_id`)
- `State(state)` — Axum injects the shared app state (which has the DB pool)

If the auth cookie is missing or expired, the `AuthUser` extractor returns a 401
error and the handler function **never runs**. That's how every route is
automatically protected.

### Step 5 — Response flows back

```
PostgreSQL  -->  Rust handler (JSON)  -->  Next.js rewrite  -->  Browser (SWR cache)
```

SWR stores the result. React re-renders and shows the games grid.

---

## Example 2: Updating a Score (PUT)

### Step 1 — User clicks a cell, edits the value, clicks away

**File:** `apps/web/app/(app)/games/[gameName]/page.tsx`

When you click a score cell, `startEdit()` puts it in edit mode. When you click
away (blur) or press Enter, `saveEdit()` fires:

```typescript
async function saveEdit(scoreId: string, prevValue: number) {
    const nextValue = parseInt(editRef.current?.value ?? "", 10);

    // Skip if unchanged
    if (nextValue === prevValue) { setEditingCell(null); return; }

    const res = await fetch(`/api/scores/${scoreId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: nextValue }),
    });

    // ... error handling ...

    // Refresh the scores so the table shows the new value
    await mutate(`/api/games/${game.id}/scores`);
}
```

The browser sends: `PUT http://localhost:3000/api/scores/de44e997-...`

### Step 2 — Next.js route handler (NOT a rewrite!)

**File:** `apps/web/app/api/scores/[id]/route.ts`

```typescript
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const body = await request.json();
    const cookie = request.headers.get("cookie") ?? "";

    const rustRes = await fetch(`${process.env.API_URL}/scores/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Cookie: cookie,   // <-- manually forward the auth cookie
        },
        body: JSON.stringify(body),
    });

    // ... parse response and return it ...
}
```

### Why a route handler instead of a rewrite?

This is the key question. Here's the difference:

| | Rewrite | Route Handler |
|---|---------|---------------|
| **What it is** | A config rule in `next.config.ts` | A TypeScript file at `app/api/.../route.ts` |
| **How it works** | Next.js silently proxies the request | You write code that makes a new request |
| **Good for** | Simple GET requests | PUT/POST/DELETE, or when you need to transform the request/response |
| **Cookie handling** | Automatic (usually) | You forward cookies manually |
| **Flexibility** | None — just forwards as-is | Full control — you can modify headers, body, handle errors |

**The games list uses a rewrite** because it's a simple GET — just forward it and
pass the response back. Nothing fancy needed.

**The score update uses a route handler** because Next.js rewrites can be unreliable
with PUT/PATCH/DELETE requests in some versions. A route handler gives us full
control: we explicitly read the cookie, forward it to Rust, and relay the response.

**Rule of thumb:** Use rewrites for GET. Use route handlers for PUT/POST/DELETE if
a rewrite isn't working, or if you need to modify the request (like the auth routes
that copy Set-Cookie headers).

### Step 3 — Axum matches the route

**File:** `apps/api/src/router.rs`

```rust
.route("/scores/{id}", axum::routing::put(scores::handlers::update_score))
```

| URL             | HTTP Method | Function called                     |
|-----------------|-------------|-------------------------------------|
| `/scores/{id}`  | PUT         | `scores::handlers::update_score`    |

The `{id}` is a **path parameter**. When the request is `PUT /scores/de44e997-...`,
Axum captures `de44e997-...` and makes it available as `Path(score_id)` in the
handler.

### Step 4 — The handler updates the database

**File:** `apps/api/src/scores/handlers.rs`

```rust
pub async fn update_score(
    auth: AuthUser,                    // from cookie
    State(state): State<AppState>,     // database connection
    Path(score_id): Path<Uuid>,        // from the URL: /scores/{id}
    Json(body): Json<UpdateScoreRequest>, // from the request body: { "value": 42 }
) -> Response {
    let result = sqlx::query!(
        r#"
        UPDATE scores
        SET value = $1
        FROM games
        WHERE scores.id = $2
          AND scores.game_id = games.id
          AND games.group_id = $3
        RETURNING scores.value
        "#,
        body.value,      // $1 — the new score value
        score_id,        // $2 — which score row to update
        auth.group_id,   // $3 — security: only if it belongs to your group
    )
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(_)) => Json(json!({ "value": body.value })).into_response(),
        Ok(None)    => (StatusCode::NOT_FOUND, ...).into_response(),
        Err(e)      => (StatusCode::INTERNAL_SERVER_ERROR, ...).into_response(),
    }
}
```

Notice how the function signature has **four** parameters. Axum fills them in
automatically, in order:

1. `auth: AuthUser` — extracted from the cookie header
2. `State(state)` — the shared database pool
3. `Path(score_id)` — parsed from the URL
4. `Json(body)` — parsed from the request body

The SQL uses `UPDATE ... FROM games WHERE games.group_id = $3` to make sure you
can only edit scores that belong to your group. Without this check, anyone could
guess a score UUID and change someone else's score.

---

## How Axum Knows Which Function to Call (Deep Dive)

This is the part that confused you, so let's break it down.

### The Router is a lookup table

```rust
// In router.rs — this runs ONCE when the server starts
Router::new()
    .route("/games",           get(list_games).post(create_game))
    .route("/games/{id}",      get(get_game).delete(delete_game))
    .route("/scores/{id}",     put(update_score))
```

This builds a table in memory:

```
/games        + GET    --> list_games()
/games        + POST   --> create_game()
/games/{id}   + GET    --> get_game()
/games/{id}   + DELETE --> delete_game()
/scores/{id}  + PUT    --> update_score()
```

### When a request arrives

```
Incoming: PUT /scores/de44e997-40ce-4663-a552-5aaad8b81e48
```

Axum does:
1. **Match the URL pattern:** `/scores/de44e997-...` matches `/scores/{id}`
   (and captures `id = "de44e997-..."`)
2. **Match the HTTP method:** PUT matches `put(update_score)`
3. **Call the function:** `update_score(auth, state, path, body)`

If no route matches, Axum returns 404 automatically.
If the route matches but the method doesn't (e.g., GET to `/scores/{id}`), Axum
returns 405 Method Not Allowed.

### The "magic" parameter extraction

Axum uses Rust's type system. Each parameter type has an "extractor" that knows
how to get its data from the HTTP request:

| Parameter type | Where data comes from |
|---|---|
| `AuthUser` | Cookie header -> JWT decode |
| `State<AppState>` | Shared app state (set via `.with_state()`) |
| `Path<Uuid>` | URL path segments (`{id}`) |
| `Json<T>` | Request body (parsed as JSON) |
| `Query<T>` | URL query string (`?key=value`) |

You just declare what you need in the function signature, and Axum handles the rest.
If extraction fails (bad JSON, missing cookie, invalid UUID), Axum returns an error
response automatically — your handler code never runs.

---

## Summary

```
Games List (GET):
  Browser --> Next.js REWRITE --> Rust --> DB
  (simple, config-only, no code needed on the Next.js side)

Score Update (PUT):
  Browser --> Next.js ROUTE HANDLER (route.ts) --> Rust --> DB
  (explicit TypeScript code that forwards the request)

Why the difference?
  Rewrites are simpler but can be unreliable for PUT/DELETE.
  Route handlers give you full control.
```

Axum routing is just a lookup table:
**URL pattern + HTTP method = function to call**.
Parameters are extracted automatically from the request based on their types.
