# Server-Sent Events (SSE) — How & Why

## What Is SSE?

Server-Sent Events is a browser-native protocol that lets a server **push data to the client over a single, persistent HTTP connection**. Unlike WebSockets, SSE is one-directional (server → client only), which makes it simpler and more predictable for use cases like live score updates where the client just needs to watch.

**Key properties:**
- Uses plain HTTP/1.1 — no protocol upgrade needed
- Automatic reconnection built into the browser's `EventSource` API
- Text-based (`text/event-stream` MIME type)
- Each event has a `event:` type field and a `data:` payload

A raw SSE response looks like this over the wire:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

event: init
data: {"game": {...}, "players": [...], "scores": [...]}

event: update
data: {"type": "scores_updated"}

event: update
data: {"type": "game_closed"}
```

---

## Why SSE and Not WebSockets?

| | SSE | WebSocket |
|---|---|---|
| Direction | Server → Client only | Bidirectional |
| Protocol | Plain HTTP | Upgraded connection |
| Browser support | Native `EventSource` API | Native `WebSocket` API |
| Auto-reconnect | Built-in | Manual |
| Proxy/firewall friendly | Yes | Sometimes problematic |

For the live scoreboard viewer, the browser **never needs to send data** — it only watches. SSE is the right tool. WebSockets would add complexity with no benefit.

---

## Architecture Overview

```
Browser (EventSource)
        │
        │  HTTPS  /live/{token}/stream
        ▼
 Apache2 (reverse proxy)
        │  ProxyPass /live/ → 127.0.0.1:8080/live/
        │  flushpackets=on  ← critical: disables Apache buffering
        ▼
 Rust API (Axum) — port 8080
        │
        │  validates share token
        │  queries initial game state
        │  subscribes to Broadcaster channel
        ▼
 tokio broadcast channel (in-memory, per game_id)
        ▲
        │  broadcast events
 Game mutation handlers (add score, close game, restart...)
```

---

## Server-Side: Rust/Axum Implementation

### The Broadcaster (`src/sse/broadcaster.rs`)

The broadcaster is the heart of the SSE system. It keeps one `tokio::sync::broadcast` channel per active game, stored in a shared `HashMap`.

```rust
pub struct Broadcaster {
    // game_id → broadcast sender
    channels: Mutex<HashMap<Uuid, broadcast::Sender<GameEvent>>>
}
```

**Why a broadcast channel?**
A `broadcast::Sender` lets you send one event and have it received by *all* connected viewers simultaneously. This is called "fan-out". Each connected SSE client holds its own `Receiver` clone — they all get the same event independently.

**Channel capacity is 64.** This means if a slow client falls 64 messages behind, it will get a `RecvError::Lagged` and must reconnect. For a scoreboard this is fine — scores don't change 64 times per second.

**Event types:**
```rust
pub enum GameEvent {
    ScoresUpdated,   // a round was added or a score was edited
    GameClosed,      // final standings calculated
    GameRestarted,   // game returned to open status
}
```

Note there is no `Init` event here — the initial full state is fetched from the database directly, not broadcast. Only *changes* flow through the broadcast channel.

### The SSE Handler (`src/sse/handlers.rs`)

The handler for `GET /live/:token/stream` does the following in sequence:

**Step 1 — Validate the share token**
```sql
SELECT game_id, group_id FROM game_shares WHERE token = $1
```
If no row is found, return 404. This is the only authentication for viewers — no JWT required.

**Step 2 — Fetch initial game state**
Three queries run to build the full `GameState`:
- Game metadata (name, icon, winner_rule, current_round, status)
- All players in the group
- All current live scores for this game

**Step 3 — Subscribe to the broadcaster**
```rust
let rx = state.broadcaster.subscribe(game_id).await;
```
This creates a `Receiver` on the broadcast channel for this game. Any subsequent events sent to this game will be received here.

**Step 4 — Build the SSE stream**
```rust
// First, send the full initial state
let init_event = Event::default()
    .event("init")
    .data(serde_json::to_string(&game_state)?);

// Then stream broadcast events
let stream = async_stream::stream! {
    yield Ok(init_event);  // send init first
    loop {
        match rx.recv().await {
            Ok(event) => yield Ok(to_sse_event(event)),
            Err(_) => break,  // channel dropped = game un-shared or server restart
        }
    }
};

Sse::new(stream).with_keepalive(KeepAlive::default())
```

The `KeepAlive` sends a comment (`:`) every ~15 seconds to prevent proxies and browsers from closing idle connections.

### Broadcasting Events from Mutation Handlers

Any handler that changes game state must notify the broadcaster. For example, when a score is added:

```rust
// After inserting score into database...
state.broadcaster.broadcast(game_id, GameEvent::ScoresUpdated).await;
```

When sharing is disabled (`DELETE /games/:id/share`), the broadcaster **drops the channel**:
```rust
state.broadcaster.remove(game_id).await;
```
This causes all connected SSE streams to end — their `rx.recv()` returns an error, breaking the loop cleanly.

---

## Client-Side: Next.js / Browser

### The `EventSource` API

The browser's built-in `EventSource` is used directly — no third-party library needed.

```typescript
// apps/web/app/(viewer)/live/[gameCode]/page.tsx

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const es = new EventSource(`${apiUrl}/live/${token}/stream`);

es.addEventListener("init", (e) => {
    const data: GameState = JSON.parse(e.data);
    setState(data);
    setStatus("connected");
});

es.addEventListener("update", (e) => {
    const event = JSON.parse(e.data);
    if (event.type === "scores_updated" || event.type === "game_closed") {
        es.close();
        setTimeout(connect, 300); // small delay, then reconnect for fresh state
    }
});

es.onerror = () => {
    es.close();
    setStatus("disconnected");
    setTimeout(connect, 3000); // auto-reconnect after 3 seconds
};
```

### Why `NEXT_PUBLIC_API_URL` and Not a Relative Path?

The `EventSource` runs in the **browser**, not on the Next.js server. When the browser opens an SSE connection:

- A **relative path** (`/api/live/...`) would go through the Next.js server
- Next.js buffers the entire response body before forwarding — **this breaks SSE** because SSE requires chunks to flow through immediately
- By connecting directly to the Rust API URL, we bypass Next.js entirely

This is why `NEXT_PUBLIC_API_URL` must be the **publicly accessible URL of the API**, and why Apache must proxy `/live/` directly to the Rust API with `flushpackets=on`.

### Why `NEXT_PUBLIC_`?

In Next.js, only environment variables prefixed with `NEXT_PUBLIC_` are included in the JavaScript bundle sent to the browser. Regular `process.env.X` variables are server-side only.

- `API_URL` — server-side only (Next.js server fetches, rewrites)
- `NEXT_PUBLIC_API_URL` — baked into the browser bundle at build time

Because it's baked at **build time**, it must be passed as a `--build-arg` to `docker buildx build`.

---

## Apache Configuration: The `flushpackets=on` Detail

Without this, Apache buffers the SSE stream:

```apache
# WRONG — Apache buffers the stream, client sees nothing until buffer fills
ProxyPass / http://127.0.0.1:3100/

# CORRECT — Apache flushes each SSE packet immediately
ProxyPass /live/ http://127.0.0.1:8080/live/ flushpackets=on
ProxyPassReverse /live/ http://127.0.0.1:8080/live/
```

The `/live/` rule must appear **before** the catch-all `/` rule — Apache applies the first matching rule.

---

## End-to-End Flow: What Happens When a Score Is Added

1. A group leader adds a score via the app UI
2. `POST /api/games/:id/scores` hits the Next.js route handler
3. Next.js forwards the request to the Rust API
4. Rust inserts the score into the `scores` table
5. Rust calls `broadcaster.broadcast(game_id, GameEvent::ScoresUpdated)`
6. Every connected viewer's `rx.recv()` receives `ScoresUpdated`
7. The SSE stream sends `event: update\ndata: {"type":"scores_updated"}\n\n` to each browser
8. Each browser's `update` listener closes the current `EventSource` and reconnects after 300ms
9. On reconnect, the new `init` event contains the updated scores

**Why reconnect instead of a delta update?**  
Simpler and more robust. The server always sends full state on `init`. This means no complex client-side state merging and no risk of the client being out of sync.

---

## Summary

| Component | Role |
|---|---|
| `Broadcaster` | In-memory fan-out; one channel per active game |
| `GET /live/:token/stream` | Validates token, sends init, streams events |
| Mutation handlers | Call `broadcaster.broadcast()` after DB writes |
| `EventSource` (browser) | Connects directly to Rust API, auto-reconnects |
| `NEXT_PUBLIC_API_URL` | Public API URL baked into browser bundle at build time |
| Apache `flushpackets=on` | Prevents response buffering, lets SSE chunks flow |
