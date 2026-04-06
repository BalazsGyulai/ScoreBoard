use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use super::models::{AddRoundRequest, ScoreRow, UpdateScoreRequest};
use crate::{auth::middleware::AuthUser, AppState};

// GET /games/:id/scores — all scores grouped by round
pub async fn get_scores(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
    // Verify game belongs to caller's group
    let game = sqlx::query!(
        "SELECT id FROM games WHERE id = $1 AND group_id = $2",
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    if matches!(game, Ok(None) | Err(_)) {
        return StatusCode::NOT_FOUND.into_response();
    }

    let result = sqlx::query_as!(
        ScoreRow,
        r#"SELECT s.id, s.user_id, u.username, s.round, s.value, s.recorded_at
           FROM scores s
           JOIN users u ON u.id = s.user_id
           WHERE s.game_id = $1
           ORDER BY s.round ASC, u.username ASC"#,
        game_id,
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => Json(rows).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// POST /games/:id/scores — submit scores for the current round, then advance round
pub async fn add_round(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
    Json(body): Json<AddRoundRequest>,
) -> Response {
    if body.scores.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "No scores provided" }))).into_response();
    }

    // Fetch game and verify ownership
    let game = sqlx::query!(
        "SELECT current_round FROM games WHERE id = $1 AND group_id = $2",
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    let current_round = match game {
        Ok(Some(g)) => g.current_round,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    for ps in &body.scores {
        let score_id = Uuid::new_v4();
        let res = sqlx::query!(
            "INSERT INTO scores (id, game_id, user_id, round, value) VALUES ($1, $2, $3, $4, $5)",
            score_id,
            game_id,
            ps.player_id,
            current_round,
            ps.value,
        )
        .execute(&mut *tx)
        .await;

        if res.is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    // Advance the round counter
    let update = sqlx::query!(
        "UPDATE games SET current_round = current_round + 1 WHERE id = $1",
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

    (StatusCode::CREATED, Json(serde_json::json!({ "round": current_round }))).into_response()
}

// PUT /scores/:id — update a single score value
pub async fn update_score(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(score_id): Path<Uuid>,
    Json(body): Json<UpdateScoreRequest>,
) -> Response {
    // Ensure this score belongs to a game in the caller's group.
    // This prevents editing other groups' scores by guessing UUIDs.
    let result = sqlx::query!(
        r#"
        UPDATE scores s
        SET value = $1
        FROM games g
        WHERE s.id = $2
          AND s.game_id = g.id
          AND g.group_id = $3
        "#,
        body.value,
        score_id,
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
