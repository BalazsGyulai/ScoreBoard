# gRPC & Protocol Buffers — How & Why

## What Is gRPC?

gRPC is a high-performance, open-source Remote Procedure Call (RPC) framework originally developed by Google. Instead of defining REST endpoints like `POST /games/:id/scores`, you define **service methods** in a language-agnostic schema file called a **Protocol Buffer** (`.proto`), and gRPC generates type-safe client and server code in any supported language.

**Key properties:**
- Uses HTTP/2 (multiplexed streams, binary framing)
- Schema-first: the `.proto` file is the source of truth
- Binary encoding (Protocol Buffers) — smaller and faster than JSON
- Supports server streaming, client streaming, and bidirectional streaming
- Strongly typed — the compiler catches type mismatches before runtime

---

## Why gRPC in This Project?

The gRPC implementation here **mirrors the SSE live streaming feature** and exists as a learning exercise. Both protocols do the same thing — stream live game events to a viewer — but gRPC uses a different transport layer (HTTP/2 + binary Protocol Buffers instead of HTTP/1.1 + text/event-stream).

Having both side-by-side lets you compare:

| | SSE | gRPC |
|---|---|---|
| Protocol | HTTP/1.1 | HTTP/2 |
| Encoding | Plain text (JSON) | Binary (Protocol Buffers) |
| Browser support | Native `EventSource` | Requires `grpc-web` layer |
| Schema | Informal (TypeScript interfaces) | Strict `.proto` contract |
| Code generation | Manual | Automatic |
| Streaming type | Server-sent only | Server-streaming RPC |

---

## The Proto File

**Location:** `packages/proto/homegame.proto`

This file is the single source of truth shared between the Rust API and any client (web, mobile, etc.).

```proto
syntax = "proto3";
package homegame;

// The service defines one RPC method: WatchGame
// It takes a request with a token and returns a *stream* of GameEvents
service GameStream {
  rpc WatchGame(WatchGameRequest) returns (stream GameEvent);
}

// The request just needs the share token — same as the SSE endpoint
message WatchGameRequest {
  string token = 1;
}

// A GameEvent wraps one of four possible event types (oneof = union type)
message GameEvent {
  oneof event {
    GameStateSnapshot init         = 1;
    ScoresUpdated     scores_updated = 2;
    GameClosed        game_closed   = 3;
    GameRestarted     game_restarted = 4;
  }
}

// Full state sent on initial connection — identical to SSE init event
message GameStateSnapshot {
  GameInfo          game    = 1;
  repeated PlayerInfo players = 2;
  repeated ScoreRow   scores  = 3;
}

message GameInfo {
  string id            = 1;
  string name          = 2;
  string icon          = 3;
  string winner_rule   = 4;
  int32  current_round = 5;
  string status        = 6;
}

message PlayerInfo {
  string id       = 1;
  string username = 2;
}

message ScoreRow {
  string id       = 1;
  string user_id  = 2;
  string username = 3;
  int32  round    = 4;
  int32  value    = 5;
}

// Delta events carry no data — client reconnects for full state
message ScoresUpdated  {}
message GameClosed     {}
message GameRestarted  {}
```

### Understanding `oneof`

`oneof` is a union type — a `GameEvent` contains exactly one of the listed fields. This is equivalent to a Rust `enum` or TypeScript union type. On the wire, only the chosen field is encoded.

### Field Numbers (the `= 1`, `= 2` tags)

These are the binary identifiers used in encoding. They are **not** sequential IDs — they're keys in the binary format. Once assigned, **never change them** — doing so would break existing clients decoding old messages.

---

## Code Generation

### Rust (Tonic)

`apps/api/build.rs` runs at compile time:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("../../packages/proto/homegame.proto")?;
    Ok(())
}
```

This generates Rust structs and the `GameStream` trait. In `grpc.rs`:

```rust
// Generated code is included via macro
tonic::include_proto!("homegame");

// This gives you generated types like:
// - WatchGameRequest
// - GameEvent
// - GameStateSnapshot
// - GameInfo, PlayerInfo, ScoreRow
// And the trait:
// - game_stream_server::GameStream (you implement this)
```

`protobuf-compiler` must be installed in the Docker build environment (it is — see `Dockerfile`).

---

## Server-Side Implementation (`src/grpc.rs`)

### Service Struct

```rust
pub struct GameStreamService {
    state: Arc<AppState>,  // shared with the REST API
}
```

The same `AppState` (with database pool and broadcaster) is shared between the REST/SSE server and the gRPC server. This is important — **they share the same broadcast channels**.

### `watch_game` Implementation

The method signature is dictated by the generated trait:

```rust
impl GameStream for GameStreamService {
    type WatchGameStream = /* opaque stream type */;

    async fn watch_game(
        &self,
        request: Request<WatchGameRequest>,
    ) -> Result<Response<Self::WatchGameStream>, Status> {
        let token = request.into_inner().token;

        // 1. Validate token (same query as SSE)
        let share = sqlx::query!(
            "SELECT game_id, group_id FROM game_shares WHERE token = $1",
            token
        )
        .fetch_optional(&self.state.db)
        .await
        .map_err(|_| Status::internal("db error"))?
        .ok_or_else(|| Status::not_found("invalid token"))?;

        // 2. Fetch initial state (same queries as SSE)
        let game_state = fetch_game_state(&self.state.db, share.game_id, share.group_id).await?;

        // 3. Subscribe to broadcaster (same channel as SSE)
        let mut rx = self.state.broadcaster.subscribe(share.game_id).await;

        // 4. Build the stream
        let stream = async_stream::stream! {
            // Send full initial state first
            yield Ok(GameEvent {
                event: Some(game_event::Event::Init(game_state_to_proto(game_state)))
            });

            // Then forward broadcast events
            loop {
                match rx.recv().await {
                    Ok(evt) => yield Ok(broadcast_event_to_proto(evt)),
                    Err(_) => break,
                }
            }
        };

        Ok(Response::new(Box::pin(stream)))
    }
}
```

This is structurally identical to the SSE handler. The difference is:
- SSE returns `Sse::new(stream)` with text events
- gRPC returns `Response::new(Box::pin(stream))` with protobuf-encoded messages

### gRPC-Web Layer

Standard gRPC uses HTTP/2 framing that browsers can't initiate directly. The `tonic-web` crate adds a translation layer that wraps gRPC in HTTP/1.1-compatible requests, making it usable from browsers.

```rust
// In main.rs
let grpc_service = tonic_web::enable(
    GameStreamServer::new(GameStreamService { state: state.clone() })
);

// Runs on a separate port (8081) from the REST API (8080)
tokio::spawn(async move {
    Server::builder()
        .accept_http1(true)  // required for grpc-web
        .add_service(grpc_service)
        .serve(grpc_addr)
        .await
});
```

---

## How Protocol Buffer Encoding Works

Unlike JSON, protobuf is binary. A message like:

```json
{"id": "abc", "round": 3, "value": 42}
```

Is encoded as a series of `(field_number, wire_type, value)` triplets. The result is smaller and faster to parse, but not human-readable.

**Example encoding of `ScoreRow`:**
```
field 1 (id, string)     → 0x0A 0x03 0x61 0x62 0x63   ("abc")
field 4 (round, int32)   → 0x20 0x03                   (3)
field 5 (value, int32)   → 0x28 0x2A                   (42)
```

Compare to JSON:
- JSON: `{"id":"abc","round":3,"value":42}` — 31 bytes
- Protobuf: ~9 bytes

For high-frequency streaming this matters. For a scoreboard it's mostly academic, but the principle is important.

---

## Comparing the Two Streaming Approaches in This Codebase

Both `GET /live/:token/stream` (SSE) and `rpc WatchGame` (gRPC) do the same thing. Here's what's different:

### Authentication
Both use the share token — no JWT. No difference.

### Initial State
Both query the database for full state and send it first. No difference.

### Event Delivery
Both use the same `Broadcaster`. The SSE handler converts events to `text/event-stream` format. The gRPC handler converts them to `GameEvent` protobuf messages. Same data, different encoding.

### Transport
SSE uses HTTP/1.1. gRPC uses HTTP/2 (via gRPC-web over HTTP/1.1 for browser compatibility).

### Client Code Complexity
SSE: Browser's native `EventSource`. One line to connect.
gRPC: Requires a generated client, a `@connectrpc/connect-web` library, and handling of protobuf deserialization.

---

## The `packages/proto` Shared Package

```
packages/
└── proto/
    └── homegame.proto
```

This location is intentional. Neither `apps/api` nor `apps/web` owns the proto file — it lives in a shared package. This enforces the contract:

- If the Rust API changes a message, the proto file changes, and the web client regenerates its types → type mismatch caught at compile time
- Both sides always agree on the schema

In practice, the web client uses the generated TypeScript types for the gRPC integration with `@connectrpc/connect-web`.

---

## Summary

| Concept | Detail |
|---|---|
| `.proto` file | Schema source of truth in `packages/proto/` |
| Code generation | `build.rs` runs `tonic_build` at Rust compile time |
| `GameStreamService` | Implements generated trait, shares `AppState` with REST server |
| `tonic-web` | Enables browser gRPC over HTTP/1.1, runs on port 8081 |
| Broadcaster sharing | SSE and gRPC both subscribe to the same in-memory channels |
| Learning purpose | Mirrors SSE to demonstrate two transport approaches for the same problem |
