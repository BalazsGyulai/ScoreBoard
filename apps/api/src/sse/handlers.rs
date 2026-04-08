use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    Json,
};
use serde::Serialize;
use sqlx::Row;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::{auth::middleware::AuthUser, AppState};
use super::broadcaster::{GameInfo, GameState, PlayerInfo, ScoreRow};

fn is_leader(role: &str) -> bool {
    role == "leader"
}

/// Generate a URL-safe random token (32 bytes → 43-char base64url, no padding).
fn generate_token() -> String {
    use std::io::Read;
    let mut buf = [0u8; 32];
    if std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_err()
    {
        return format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    }
    base64_url_encode(&buf)
}

fn base64_url_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut result = String::with_capacity((data.len() * 4 + 2) / 3);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        }
    }
    result
}

#[derive(Serialize)]
struct ShareResponse {
    token: String,
    share_url: String,
}

#[derive(Serialize)]
struct ShareStatus {
    sharing: bool,
    token: Option<String>,
    share_url: Option<String>,
}

// POST /games/:id/share — enable sharing and generate a token
pub async fn create_share(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can share games" }))).into_response();
    }

    // Verify game belongs to caller's group
    let game = sqlx::query!(
        "SELECT id FROM games WHERE id = $1 AND group_id = $2",
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    match game {
        Ok(Some(_)) => {}
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    let token = generate_token();
    let share_id = Uuid::new_v4();

    // Upsert: replace existing share if one exists (ON CONFLICT on game_id)
    // Using runtime query since game_shares isn't in the sqlx offline cache yet.
    let result = sqlx::query(
        r#"
        INSERT INTO game_shares (id, game_id, token)
        VALUES ($1, $2, $3)
        ON CONFLICT (game_id) DO UPDATE SET token = $3, created_at = now()
        RETURNING token
        "#,
    )
    .bind(share_id)
    .bind(game_id)
    .bind(&token)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(row) => {
            let token: String = row.get("token");
            let share_url = format!("/live/{}?token={}", game_id, token);
            Json(ShareResponse { token, share_url }).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// DELETE /games/:id/share — disable sharing
pub async fn delete_share(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can manage sharing" }))).into_response();
    }

    let result = sqlx::query(
        "DELETE FROM game_shares WHERE game_id = $1 AND game_id IN (SELECT id FROM games WHERE group_id = $2)",
    )
    .bind(game_id)
    .bind(auth.group_id)
    .execute(&state.db)
    .await;

    // Remove broadcast channel so existing viewers disconnect
    state.broadcaster.remove(game_id);

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// GET /games/:id/share — check if sharing is active
pub async fn get_share(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
    let share = sqlx::query(
        r#"
        SELECT gs.token
        FROM game_shares gs
        JOIN games g ON g.id = gs.game_id
        WHERE gs.game_id = $1 AND g.group_id = $2
        "#,
    )
    .bind(game_id)
    .bind(auth.group_id)
    .fetch_optional(&state.db)
    .await;

    match share {
        Ok(Some(row)) => {
            let token: String = row.get("token");
            let share_url = format!("/live/{}?token={}", game_id, token);
            Json(ShareStatus {
                sharing: true,
                token: Some(token),
                share_url: Some(share_url),
            })
            .into_response()
        }
        Ok(None) => Json(ShareStatus {
            sharing: false,
            token: None,
            share_url: None,
        })
        .into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// GET /live/:token/stream — SSE stream for viewers (no JWT required, token-based auth)
pub async fn stream(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Response {
    // Look up the share by token
    let share = sqlx::query(
        r#"
        SELECT gs.game_id, g.group_id
        FROM game_shares gs
        JOIN games g ON g.id = gs.game_id
        WHERE gs.token = $1
        "#,
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await;

    let share = match share {
        Ok(Some(s)) => s,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Invalid or expired share link" }))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let game_id: Uuid = share.get("game_id");
    let group_id: Uuid = share.get("group_id");

    // Fetch initial state
    let init = match fetch_game_state(&state, game_id, group_id).await {
        Ok(s) => s,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Subscribe to future events
    let rx = state.broadcaster.subscribe(game_id);

    // Build the SSE stream: init event first, then broadcast events
    let init_event = Event::default()
        .event("init")
        .json_data(&init)
        .unwrap();

    let broadcast_stream = BroadcastStream::new(rx).filter_map(|result| {
        match result {
            Ok(event) => {
                let sse_event = Event::default()
                    .event("update")
                    .json_data(&event)
                    .ok();
                sse_event
            }
            Err(_) => None, // lagged — skip
        }
    });

    let stream = tokio_stream::once(Ok::<_, std::convert::Infallible>(init_event))
        .chain(broadcast_stream.map(Ok));

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

/// Fetch full game state for the initial SSE snapshot.
async fn fetch_game_state(
    state: &AppState,
    game_id: Uuid,
    group_id: Uuid,
) -> Result<GameState, sqlx::Error> {
    let game = sqlx::query!(
        r#"SELECT id, name, icon, winner_rule, current_round, status::TEXT AS "status!"
           FROM games WHERE id = $1"#,
        game_id,
    )
    .fetch_one(&state.db)
    .await?;

    let players = sqlx::query!(
        "SELECT id, username FROM users WHERE group_id = $1 ORDER BY username",
        group_id,
    )
    .fetch_all(&state.db)
    .await?;

    let scores = sqlx::query!(
        r#"SELECT s.id, s.user_id, u.username, s.round, s.value
           FROM scores s
           JOIN users u ON u.id = s.user_id
           WHERE s.game_id = $1
           ORDER BY s.round ASC, u.username ASC"#,
        game_id,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(GameState {
        game: GameInfo {
            id: game.id.to_string(),
            name: game.name,
            icon: game.icon,
            winner_rule: game.winner_rule,
            current_round: game.current_round,
            status: game.status,
        },
        players: players
            .into_iter()
            .map(|p| PlayerInfo {
                id: p.id.to_string(),
                username: p.username,
            })
            .collect(),
        scores: scores
            .into_iter()
            .map(|s| ScoreRow {
                id: s.id.to_string(),
                user_id: s.user_id.to_string(),
                username: s.username,
                round: s.round,
                value: s.value,
            })
            .collect(),
    })
}
