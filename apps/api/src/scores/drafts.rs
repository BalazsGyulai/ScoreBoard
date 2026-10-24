// Draft scores of the round being entered (see migrations/0009_score_drafts.sql).
//
// Drafts belong to the game's *current* round. They are cleared whenever that round
// stops being the one being entered: on save, undo, close and restart. They are
// never read by totals, results or statistics.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{auth::middleware::AuthUser, AppState};

const MAX_ABS_SCORE: i32 = 1_000_000;

#[derive(Debug, Serialize)]
pub struct DraftValue {
    pub player_id: Uuid,
    pub value: i32,
}

#[derive(Debug, Serialize)]
pub struct DraftsResponse {
    /// the round the drafts are for (the game's current round); null for a closed game
    pub round: Option<i32>,
    pub drafts: Vec<DraftValue>,
}

#[derive(Debug, Deserialize)]
pub struct DraftEntry {
    pub player_id: Uuid,
    /// null clears the player's draft
    pub value: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SaveDraftsRequest {
    pub round: i32,
    pub values: Vec<DraftEntry>,
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

/// Delete every draft of a game (inside the caller's transaction).
pub async fn clear<'e, E: sqlx::PgExecutor<'e>>(executor: E, game_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM score_drafts WHERE game_id = $1", game_id)
        .execute(executor)
        .await
        .map(|_| ())
}

// GET /games/:id/drafts — any member of the group may read.
pub async fn get_drafts(auth: AuthUser, State(state): State<AppState>, Path(game_id): Path<Uuid>) -> Response {
    let game = sqlx::query!(
        r#"SELECT current_round, status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    let round = match game {
        Ok(Some(g)) if g.status == "open" => g.current_round,
        Ok(Some(_)) => return Json(DraftsResponse { round: None, drafts: vec![] }).into_response(),
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let drafts = sqlx::query_as!(
        DraftValue,
        r#"SELECT user_id AS player_id, value FROM score_drafts
           WHERE game_id = $1 AND round = $2
           ORDER BY user_id"#,
        game_id,
        round,
    )
    .fetch_all(&state.db)
    .await;

    match drafts {
        Ok(drafts) => Json(DraftsResponse { round: Some(round), drafts }).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// PUT /games/:id/drafts — leader only; upserts the listed players (null value = clear).
pub async fn save_drafts(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
    Json(body): Json<SaveDraftsRequest>,
) -> Response {
    if auth.role != "leader" {
        return error(StatusCode::FORBIDDEN, "Only the leader can enter scores");
    }
    if body.values.iter().any(|v| v.value.is_some_and(|x| x.abs() > MAX_ABS_SCORE)) {
        return error(StatusCode::BAD_REQUEST, &format!("Score must be between -{MAX_ABS_SCORE} and {MAX_ABS_SCORE}"));
    }

    let mut player_ids: Vec<Uuid> = body.values.iter().map(|v| v.player_id).collect();
    player_ids.sort();
    player_ids.dedup();
    if player_ids.len() != body.values.len() {
        return error(StatusCode::BAD_REQUEST, "Duplicate player");
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Lock the game row: a round being saved at the same time either happens before
    // (then this round number is stale → 409) or after (then it clears these drafts).
    let game = sqlx::query!(
        r#"SELECT current_round, status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2 FOR SHARE"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&mut *tx)
    .await;

    match game {
        Ok(Some(g)) if g.status != "open" => return error(StatusCode::CONFLICT, "Game is closed"),
        Ok(Some(g)) if g.current_round != body.round => {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({ "error": "Round already saved", "current_round": g.current_round })),
            )
                .into_response();
        }
        Ok(Some(_)) => {}
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    if !player_ids.is_empty() {
        let members = sqlx::query_scalar!(
            r#"SELECT COUNT(*) AS "count!" FROM users WHERE group_id = $1 AND id = ANY($2)"#,
            auth.group_id,
            &player_ids,
        )
        .fetch_one(&mut *tx)
        .await;
        match members {
            Ok(n) if n == player_ids.len() as i64 => {}
            Ok(_) => return error(StatusCode::BAD_REQUEST, "Unknown player"),
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        }
    }

    for entry in &body.values {
        let result = match entry.value {
            Some(value) => sqlx::query!(
                r#"INSERT INTO score_drafts (game_id, user_id, round, value, updated_by, updated_at)
                   VALUES ($1, $2, $3, $4, $5, NOW())
                   ON CONFLICT (game_id, user_id, round)
                   DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()"#,
                game_id,
                entry.player_id,
                body.round,
                value,
                auth.user_id,
            )
            .execute(&mut *tx)
            .await,
            None => sqlx::query!(
                "DELETE FROM score_drafts WHERE game_id = $1 AND user_id = $2 AND round = $3",
                game_id,
                entry.player_id,
                body.round,
            )
            .execute(&mut *tx)
            .await,
        };
        if result.is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    if tx.commit().await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    Json(serde_json::json!({ "round": body.round, "saved": body.values.len() })).into_response()
}
