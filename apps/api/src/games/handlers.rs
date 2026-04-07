use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use super::models::{CloseGameResponse, CreateGameRequest, Game, GameResult};
use crate::{auth::middleware::AuthUser, AppState};

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
    if auth.role != "leader" {
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

    // Aggregate scores per player
    let totals = sqlx::query!(
        r#"SELECT s.user_id, u.username, COALESCE(SUM(s.value), 0) AS "total!"
           FROM scores s
           JOIN users u ON u.id = s.user_id
           WHERE s.game_id = $1
           GROUP BY s.user_id, u.username
           ORDER BY u.username"#,
        game_id,
    )
    .fetch_all(&state.db)
    .await;

    let mut totals = match totals {
        Ok(rows) => rows,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    if totals.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "No scores recorded — cannot close an empty game" }))).into_response();
    }

    // Sort by total based on winner_rule
    if game.winner_rule == "min" {
        totals.sort_by_key(|r| r.total);
    } else {
        totals.sort_by_key(|r| std::cmp::Reverse(r.total));
    }

    // Assign places with ties (same total = same place, next place = position)
    let mut results: Vec<GameResult> = Vec::with_capacity(totals.len());
    for (i, row) in totals.iter().enumerate() {
        let place = if i == 0 {
            1
        } else if row.total == totals[i - 1].total {
            results[i - 1].place // same total → same place
        } else {
            (i + 1) as i32 // skip to position
        };
        results.push(GameResult {
            user_id: row.user_id,
            username: row.username.clone(),
            total_score: row.total,
            place,
        });
    }

    // Transaction: insert results + mark game closed
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    for r in &results {
        let res = sqlx::query!(
            "INSERT INTO game_results (game_id, user_id, total_score, place) VALUES ($1, $2, $3, $4)",
            game_id,
            r.user_id,
            r.total_score as i32,
            r.place,
        )
        .execute(&mut *tx)
        .await;

        if res.is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
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

    Json(CloseGameResponse { game_id, results }).into_response()
}

// POST /games/:id/restart — restart a closed game (clear scores, keep game_results history)
pub async fn restart_game(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
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

    Json(serde_json::json!({ "status": "open" })).into_response()
}
