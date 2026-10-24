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

use crate::{auth::{middleware::AuthUser, refresh::random_token}, AppState};
use super::broadcaster::{GameInfo, GameState, PlayerInfo, ScoreRow};

fn is_leader(role: &str) -> bool {
    role == "leader"
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

    let token = random_token();
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

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            // Remove broadcast channel so existing viewers disconnect. Only after the
            // ownership check above, so nobody can drop another group's viewers.
            state.broadcaster.remove(game_id);
            StatusCode::NO_CONTENT.into_response()
        }
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

/// Resolve a public share token to its game. The token is the only credential a
/// viewer has, and it grants read access to that single game and nothing else.
pub async fn resolve_share(state: &AppState, token: &str) -> Result<Option<Uuid>, sqlx::Error> {
    let row = sqlx::query("SELECT game_id FROM game_shares WHERE token = $1")
        .bind(token)
        .fetch_optional(&state.db)
        .await?;
    Ok(row.map(|r| r.get("game_id")))
}

fn invalid_share() -> Response {
    (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Invalid or expired share link" }))).into_response()
}

// GET /live/:token/state — read-only JSON snapshot (polling fallback for viewers)
pub async fn state(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Response {
    let game_id = match resolve_share(&state, &token).await {
        Ok(Some(id)) => id,
        Ok(None) => return invalid_share(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    match fetch_game_state(&state, game_id).await {
        Ok(s) => (
            [(axum::http::header::CACHE_CONTROL, "no-store")],
            Json(s),
        )
            .into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// GET /live/:token/stream — SSE stream for viewers (no JWT required, token-based auth)
pub async fn stream(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Response {
    let game_id = match resolve_share(&state, &token).await {
        Ok(Some(id)) => id,
        Ok(None) => return invalid_share(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Fetch initial state
    let init = match fetch_game_state(&state, game_id).await {
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
            Ok(event) => Event::default().event("update").json_data(&event).ok(),
            Err(_) => None, // lagged — skip
        }
    });

    let stream = tokio_stream::once(Ok::<_, std::convert::Infallible>(init_event))
        .chain(broadcast_stream.map(Ok));

    (
        // no-transform: proxies (and Next's gzip) must not buffer the stream
        [
            (axum::http::header::CACHE_CONTROL, "no-cache, no-transform"),
            (axum::http::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Sse::new(stream).keep_alive(KeepAlive::default()),
    )
        .into_response()
}

/// Read-only game state for the public viewer.
///
/// Only this game's data is exposed: its players are the ones who have scores in it,
/// not the whole group. A closed game shows its latest final snapshot.
pub async fn fetch_game_state(
    state: &AppState,
    game_id: Uuid,
) -> Result<GameState, sqlx::Error> {
    let game = sqlx::query!(
        r#"SELECT id, name, icon, winner_rule, current_round, status::TEXT AS "status!"
           FROM games WHERE id = $1"#,
        game_id,
    )
    .fetch_one(&state.db)
    .await?;

    let scores: Vec<ScoreRow> = if game.status == "closed" {
        sqlx::query!(
            r#"SELECT a.id, a.user_id, u.username, a.round, a.value
               FROM score_archives a
               JOIN users u ON u.id = a.user_id
               WHERE a.game_id = $1
                 AND a.snapshot_id = (
                     SELECT sa.snapshot_id FROM score_archives sa
                     WHERE sa.game_id = $1
                     ORDER BY sa.archived_at DESC
                     LIMIT 1
                 )
               ORDER BY a.round ASC, u.username ASC"#,
            game_id,
        )
        .fetch_all(&state.db)
        .await?
        .into_iter()
        .map(|s| ScoreRow {
            id: s.id.to_string(),
            user_id: s.user_id.to_string(),
            username: s.username,
            round: s.round,
            value: s.value,
        })
        .collect()
    } else {
        sqlx::query!(
            r#"SELECT s.id, s.user_id, u.username, s.round, s.value
               FROM scores s
               JOIN users u ON u.id = s.user_id
               WHERE s.game_id = $1
               ORDER BY s.round ASC, u.username ASC"#,
            game_id,
        )
        .fetch_all(&state.db)
        .await?
        .into_iter()
        .map(|s| ScoreRow {
            id: s.id.to_string(),
            user_id: s.user_id.to_string(),
            username: s.username,
            round: s.round,
            value: s.value,
        })
        .collect()
    };

    let mut players: Vec<PlayerInfo> = Vec::new();
    for s in &scores {
        if !players.iter().any(|p| p.id == s.user_id) {
            players.push(PlayerInfo { id: s.user_id.clone(), username: s.username.clone() });
        }
    }
    players.sort_by(|a, b| a.username.cmp(&b.username));

    Ok(GameState {
        game: GameInfo {
            id: game.id.to_string(),
            name: game.name,
            icon: game.icon,
            winner_rule: game.winner_rule,
            current_round: game.current_round,
            status: game.status,
        },
        players,
        scores,
    })
}
