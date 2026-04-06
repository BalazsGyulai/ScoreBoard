use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use super::models::{CreateGameRequest, Game};
use crate::{auth::middleware::AuthUser, AppState};

// GET /games
pub async fn list_games(auth: AuthUser, State(state): State<AppState>) -> Response {
    let result = sqlx::query_as!(
        Game,
        "SELECT id, group_id, name, winner_rule, icon, current_round, created_at
         FROM games WHERE group_id = $1 ORDER BY name",
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
        "SELECT id, group_id, name, winner_rule, icon, current_round, created_at
         FROM games WHERE id = $1 AND group_id = $2",
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
