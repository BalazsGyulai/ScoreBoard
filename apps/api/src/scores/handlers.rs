use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use super::models::{AddRoundRequest, ScoreQuery, ScoreRow, ScoreSnapshotRow, UpdateScoreRequest};
use crate::{auth::middleware::AuthUser, sse::broadcaster::GameEvent, AppState};

fn is_leader(role: &str) -> bool {
    role == "leader"
}

/// A single round score must stay within this range, so session totals always fit
/// the stored INT column (and typos like 5000000 are caught).
const MAX_ABS_SCORE: i32 = 1_000_000;

fn score_out_of_range() -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": format!("Score must be between -{MAX_ABS_SCORE} and {MAX_ABS_SCORE}") })),
    )
        .into_response()
}

async fn is_group_member(state: &AppState, group_id: Uuid, user_id: Uuid) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND group_id = $2) AS "exists!""#,
        user_id,
        group_id,
    )
    .fetch_one(&state.db)
    .await
}

// GET /games/:id/scores — all scores grouped by round
pub async fn get_scores(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
    Query(query): Query<ScoreQuery>,
) -> Response {
    // Verify game belongs to caller's group
    let game = sqlx::query!(
        r#"SELECT id, status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    let result = match game {
        Ok(Some(g)) if g.status == "closed" => {
            sqlx::query_as::<_, ScoreRow>(
                r#"
                SELECT a.id, a.user_id, u.username, a.round, a.value, a.recorded_at
                FROM score_archives a
                JOIN users u ON u.id = a.user_id
                WHERE a.game_id = $1
                  AND a.snapshot_id = COALESCE(
                      $2,
                      (
                          SELECT sa.snapshot_id
                          FROM score_archives sa
                          WHERE sa.game_id = $1
                          ORDER BY sa.archived_at DESC
                          LIMIT 1
                      )
                  )
                ORDER BY a.round ASC, u.username ASC
                "#,
            )
            .bind(game_id)
            .bind(query.snapshot_id)
            .fetch_all(&state.db)
            .await
        }
        Ok(Some(_)) => {
            sqlx::query_as!(
                ScoreRow,
                r#"SELECT s.id, s.user_id, u.username, s.round, s.value, s.recorded_at
                   FROM scores s
                   JOIN users u ON u.id = s.user_id
                   WHERE s.game_id = $1
                   ORDER BY s.round ASC, u.username ASC"#,
                game_id,
            )
            .fetch_all(&state.db)
            .await
        }
        Ok(None) | Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    
    match result {
        Ok(rows) => Json(rows).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// GET /games/:id/score-snapshots — list archived score snapshots for closed game versions
pub async fn get_score_snapshots(
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

    let snapshots = sqlx::query_as!(
        ScoreSnapshotRow,
        r#"
        SELECT snapshot_id, MAX(archived_at) AS "archived_at!"
        FROM score_archives
        WHERE game_id = $1
        GROUP BY snapshot_id
        ORDER BY MAX(archived_at) DESC
        "#,
        game_id,
    )
    .fetch_all(&state.db)
    .await;

    match snapshots {
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
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can save rounds" }))).into_response();
    }

    if body.scores.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "No scores provided" }))).into_response();
    }
    if body.scores.iter().any(|s| s.value.abs() > MAX_ABS_SCORE) {
        return score_out_of_range();
    }

    // Fetch game and verify ownership
    let game = sqlx::query!(
        r#"SELECT current_round, status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    match game {
        Ok(Some(g)) if g.status == "closed" => {
            return (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "Game is closed" }))).into_response();
        }
        Ok(Some(_)) => {}
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    // Every player must be a member of the caller's group — otherwise a leader could
    // attach scores (and expose usernames) of users from another group.
    let mut player_ids: Vec<Uuid> = body.scores.iter().map(|s| s.player_id).collect();
    player_ids.sort();
    player_ids.dedup();
    if player_ids.len() != body.scores.len() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Duplicate player in round" }))).into_response();
    }

    let members = sqlx::query_scalar!(
        r#"SELECT COUNT(*) AS "count!" FROM users WHERE group_id = $1 AND id = ANY($2)"#,
        auth.group_id,
        &player_ids,
    )
    .fetch_one(&state.db)
    .await;

    match members {
        Ok(n) if n == player_ids.len() as i64 => {}
        Ok(_) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Unknown player" }))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Claim the round number atomically: two phones saving at the same moment get
    // rounds N and N+1 instead of both writing round N (unique violation → 500).
    let claimed = sqlx::query_scalar!(
        r#"UPDATE games SET current_round = current_round + 1
           WHERE id = $1 AND group_id = $2 AND status = 'open'
           RETURNING current_round - 1 AS "round!""#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&mut *tx)
    .await;

    let current_round = match claimed {
        Ok(Some(round)) => round,
        Ok(None) => return (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "Game is closed" }))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // The round is saved: its drafts are done.
    if super::drafts::clear(&mut *tx, game_id).await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    for ps in &body.scores {
        let res = sqlx::query!(
            "INSERT INTO scores (id, game_id, user_id, round, value) VALUES ($1, $2, $3, $4, $5)",
            Uuid::new_v4(),
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

    if tx.commit().await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    state.broadcaster.notify(game_id, GameEvent::ScoresUpdated);

    (StatusCode::CREATED, Json(serde_json::json!({ "round": current_round }))).into_response()
}

// PUT /scores/:id — update a single score value
pub async fn update_score(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(score_id): Path<Uuid>,
    Json(body): Json<UpdateScoreRequest>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can update scores" }))).into_response();
    }
    if body.value.abs() > MAX_ABS_SCORE {
        return score_out_of_range();
    }

    // Ensure this score belongs to a game in the caller's group.
    // This prevents editing other groups' scores by guessing UUIDs.
    let result = sqlx::query!(
        r#"
        UPDATE scores
        SET value = $1
        FROM games
        WHERE scores.id = $2
          AND scores.game_id = games.id
          AND games.group_id = $3
        RETURNING scores.value, scores.game_id
        "#,
        body.value,
        score_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(row)) => {
            state.broadcaster.notify(row.game_id, GameEvent::ScoresUpdated);
            Json(serde_json::json!({ "value": body.value })).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Score not found or access denied" }))).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// PUT /games/:id/scores/:round/:player_id — set (or fill in a missing) score of an
// already played round of an open game.
pub async fn set_round_score(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((game_id, round, player_id)): Path<(Uuid, i32, Uuid)>,
    Json(body): Json<UpdateScoreRequest>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can update scores" }))).into_response();
    }
    if body.value.abs() > MAX_ABS_SCORE {
        return score_out_of_range();
    }

    let game = sqlx::query!(
        r#"SELECT current_round, status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&state.db)
    .await;

    match game {
        Ok(Some(g)) if g.status == "closed" => {
            return (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "Game is closed" }))).into_response();
        }
        Ok(Some(g)) if round < 1 || round >= g.current_round => {
            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "This round has not been played yet" }))).into_response();
        }
        Ok(Some(_)) => {}
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    match is_group_member(&state, auth.group_id, player_id).await {
        Ok(true) => {}
        Ok(false) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Unknown player" }))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    let row = sqlx::query!(
        r#"INSERT INTO scores (id, game_id, user_id, round, value)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ON CONSTRAINT scores_one_per_player_round
           DO UPDATE SET value = EXCLUDED.value
           RETURNING id, value"#,
        Uuid::new_v4(),
        game_id,
        player_id,
        round,
        body.value,
    )
    .fetch_one(&state.db)
    .await;

    match row {
        Ok(r) => {
            state.broadcaster.notify(game_id, GameEvent::ScoresUpdated);
            Json(serde_json::json!({ "id": r.id, "value": r.value })).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// DELETE /games/:id/rounds/last — undo the last saved round of an open game.
pub async fn delete_last_round(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(game_id): Path<Uuid>,
) -> Response {
    if !is_leader(&auth.role) {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can delete rounds" }))).into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Lock the game row so a concurrent "save round" cannot interleave.
    let game = sqlx::query!(
        r#"SELECT status::TEXT AS "status!" FROM games WHERE id = $1 AND group_id = $2 FOR UPDATE"#,
        game_id,
        auth.group_id,
    )
    .fetch_optional(&mut *tx)
    .await;

    match game {
        Ok(Some(g)) if g.status == "closed" => {
            return (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "Game is closed" }))).into_response();
        }
        Ok(Some(_)) => {}
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    let last = sqlx::query_scalar!("SELECT MAX(round) FROM scores WHERE game_id = $1", game_id)
        .fetch_one(&mut *tx)
        .await;
    let last = match last {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "No rounds to delete" }))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    if sqlx::query!("DELETE FROM scores WHERE game_id = $1 AND round = $2", game_id, last)
        .execute(&mut *tx)
        .await
        .is_err()
        || sqlx::query!("UPDATE games SET current_round = $2 WHERE id = $1", game_id, last)
            .execute(&mut *tx)
            .await
            .is_err()
        || super::drafts::clear(&mut *tx, game_id).await.is_err()
        || tx.commit().await.is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    state.broadcaster.notify(game_id, GameEvent::ScoresUpdated);
    Json(serde_json::json!({ "deleted_round": last })).into_response()
}
