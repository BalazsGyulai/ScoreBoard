use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

use super::models::{PlayerPlacement, PlayerStat};
use crate::{auth::middleware::AuthUser, AppState};

// GET /stats — overall leaderboard for the caller's group
// Computed from immutable game_results snapshots (finished matches), not live scores.
pub async fn leaderboard(auth: AuthUser, State(state): State<AppState>) -> Response {
    let result = sqlx::query!(
        r#"
        WITH ranked_results AS (
            SELECT
                gr.snapshot_id,
                gr.user_id,
                gr.place,
                MAX(gr.place) OVER (PARTITION BY gr.snapshot_id) AS worst_place,
                COUNT(*) OVER (PARTITION BY gr.snapshot_id) AS player_count
            FROM game_results gr
            JOIN games g ON g.id = gr.game_id
            WHERE g.group_id = $1
        )
        SELECT
            u.id,
            u.username,
            COALESCE(SUM(CASE WHEN rr.place = 1 THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(SUM(CASE WHEN rr.player_count > 1 AND rr.worst_place > 1 AND rr.place = rr.worst_place THEN 1 ELSE 0 END), 0) AS losses,
            COALESCE(COUNT(rr.snapshot_id), 0) AS total_rounds
        FROM users u
        LEFT JOIN ranked_results rr ON rr.user_id = u.id
        WHERE u.group_id = $1
        GROUP BY u.id, u.username
        ORDER BY wins DESC, losses ASC
        "#,
        auth.group_id,
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => {
            let stats: Vec<PlayerStat> = rows
                .into_iter()
                .map(|r| PlayerStat {
                    id: r.id,
                    username: r.username,
                    wins: r.wins.unwrap_or(0),
                    losses: r.losses.unwrap_or(0),
                    total_rounds: r.total_rounds.unwrap_or(0),
                })
                .collect();
            Json(stats).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// GET /stats/history — per-snapshot placements for trend/streak calculations
pub async fn history(auth: AuthUser, State(state): State<AppState>) -> Response {
    let result = sqlx::query!(
        r#"
        SELECT
            gr.snapshot_id,
            gr.user_id,
            gr.place,
            g.closed_at
        FROM game_results gr
        JOIN games g ON g.id = gr.game_id
        WHERE g.group_id = $1
          AND g.closed_at IS NOT NULL
        ORDER BY g.closed_at ASC, gr.snapshot_id ASC, gr.user_id ASC
        "#,
        auth.group_id,
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => {
            let placements: Vec<PlayerPlacement> = rows
                .into_iter()
                .map(|r| PlayerPlacement {
                    snapshot_id: r.snapshot_id,
                    user_id: r.user_id,
                    place: r.place,
                    closed_at: r.closed_at.expect("closed_at filtered by query").to_rfc3339(),
                })
                .collect();
            Json(placements).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
