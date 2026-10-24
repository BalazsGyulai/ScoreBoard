use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use std::collections::HashMap;

use super::models::{CloseGameResponse, CreateGameRequest, Game, GameResult};
use crate::{
    auth::middleware::AuthUser,
    scoring::{standings, WinnerRule},
    sse::broadcaster::GameEvent,
    AppState,
};

fn is_leader(role: &str) -> bool {
    role == "leader"
}

// GET /games
pub async fn list_games(auth: AuthUser, State(state): State<AppState>) -> Response {
    let result = sqlx::query_as!(
        Game,
        r#"SELECT id, group_id, name, winner_rule, icon, current_round, status::TEXT AS "status!", closed_at, created_at
         FROM games WHERE group_id = $1 ORDER BY name"#,
        auth.group_id,
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(games) => Json(games).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// GET /games/:id
pub async fn get_game(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query_as!(
        Game,
        r#"SELECT id, group_id, name, winner_rule, icon, current_round, status::TEXT AS "status!", closed_at, created_at
         FROM games WHERE id = $1 AND group_id = $2"#,
        id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(game)) => Json(game).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// POST /games
pub async fn create_game(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateGameRequest>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can create games" }))).into_response();
    }
    if body.name.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Game name is required" }))).into_response();
    }
    if body.winner_rule != "min" && body.winner_rule != "max" {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "winner_rule must be 'min' or 'max'" }))).into_response();
    }
    if body.icon.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Game icon is required" }))).into_response();
    }

    let game_id = Uuid::new_v4();
    let result = sqlx::query!(
        "INSERT INTO games (id, group_id, name, winner_rule, icon) VALUES ($1, $2, $3, $4, $5)",
        game_id,
        auth.group_id,
        body.name.trim(),
        body.winner_rule,
        body.icon.trim(),
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({
            "id": game_id,
            "name": body.name.trim(),
            "winner_rule": body.winner_rule,
            "icon": body.icon.trim(),
        }))).into_response(),
        Err(e) if e.to_string().contains("unique") => {
            (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "A game with this name already exists" }))).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// DELETE /games/:id
pub async fn delete_game(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Response {
    if auth.role != "leader" {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can delete games" }))).into_response();
    }

    let result = sqlx::query!(
        "DELETE FROM games WHERE id = $1 AND group_id = $2",
        id,
        auth.group_id,
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// POST /games/:id/close — close a game and calculate final standings
pub async fn close_game(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can close games" }))).into_response();
    }

    // Fetch game, verify ownership and that it's still open
    let game = sqlx::query!(
        r#"SELECT id, winner_rule, status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    let game = match game {
        Ok(Some(g)) => g,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Game not found" }))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    if game.status == "closed" {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Game is already closed" }))).into_response();
    }

    // Every score of the session; standings follow the shared rule in crate::scoring.
    let rows = sqlx::query!(
        r#"SELECT s.user_id, u.username, s.round, s.value
           FROM scores s
           JOIN users u ON u.id = s.user_id
           WHERE s.game_id = $1"#,
        game_id,
    )
    .fetch_all(&state.db)
    .await;

    let rows = match rows {
        Ok(rows) => rows,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    if rows.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "No scores recorded — cannot close an empty game" }))).into_response();
    }

    let usernames: HashMap<Uuid, String> = rows.iter().map(|r| (r.user_id, r.username.clone())).collect();
    let entries: Vec<(Uuid, i32, i64)> = rows.iter().map(|r| (r.user_id, r.round, r.value as i64)).collect();
    let ranked = standings(&entries, WinnerRule::parse(&game.winner_rule));

    let mut results: Vec<GameResult> = Vec::with_capacity(ranked.len());
    for s in ranked {
        let Ok(total_score) = i32::try_from(s.total) else {
            return (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "error": "Total score out of range" }))).into_response();
        };
        results.push(GameResult {
            user_id: s.player,
            username: usernames.get(&s.player).cloned().unwrap_or_default(),
            total_score: total_score as i64,
            rounds_played: s.rounds_played,
            place: s.place,
        });
    }

    // Transaction: archive scores, insert results, mark game closed
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // One close operation = one immutable results snapshot.
    let snapshot_id = Uuid::new_v4();

    // Move live score rows into archive snapshot before deleting from scores.
    if sqlx::query(
        r#"
        INSERT INTO score_archives (snapshot_id, game_id, user_id, round, value, recorded_at)
        SELECT $1, game_id, user_id, round, value, recorded_at
        FROM scores
        WHERE game_id = $2
        "#,
    )
    .bind(snapshot_id)
    .bind(game_id)
    .execute(&mut *tx)
    .await
    .is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    if sqlx::query!("DELETE FROM scores WHERE game_id = $1", game_id)
        .execute(&mut *tx)
        .await
        .is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    for r in &results {
        let res = sqlx::query(
            "INSERT INTO game_results (snapshot_id, game_id, user_id, total_score, place) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(snapshot_id)
        .bind(game_id)
        .bind(r.user_id)
        .bind(r.total_score as i32)
        .bind(r.place)
        .execute(&mut *tx)
        .await;

        if res.is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    if crate::scores::drafts::clear(&mut *tx, game_id).await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let update = sqlx::query!(
        "UPDATE games SET status = 'closed', closed_at = NOW() WHERE id = $1",
        game_id,
    )
    .execute(&mut *tx)
    .await;

    if update.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    if tx.commit().await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    state.broadcaster.notify(game_id, GameEvent::GameClosed);

    Json(CloseGameResponse { game_id, results }).into_response()
}

// POST /games/:id/restart — restart a closed game (clear scores, keep game_results history)
pub async fn restart_game(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can restart games" }))).into_response();
    }

    let game = sqlx::query!(
        r#"SELECT id, status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    let game = match game {
        Ok(Some(g)) => g,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Game not found" }))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    if game.status != "closed" {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Game is not closed" }))).into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Delete all scores for this game (game_results stay as historical record)
    if sqlx::query!("DELETE FROM scores WHERE game_id = $1", game_id)
        .execute(&mut *tx)
        .await
        .is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    if crate::scores::drafts::clear(&mut *tx, game_id).await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Reset game to open state
    if sqlx::query!(
        "UPDATE games SET status = 'open', closed_at = NULL, current_round = 1 WHERE id = $1",
        game_id,
    )
    .execute(&mut *tx)
    .await
    .is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    if tx.commit().await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    state.broadcaster.notify(game_id, GameEvent::GameRestarted);

    Json(serde_json::json!({ "status": "open" })).into_response()
}
