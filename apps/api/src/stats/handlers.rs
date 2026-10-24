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

// GET /stats/history — one row per player per finished match (snapshot).
//
// The match date is the snapshot's own time (game_results.created_at), not
// games.closed_at: that column only holds the *latest* close of a game and is reset
// to NULL by a restart, which used to (a) drop every match of a restarted game from
// the history and (b) date all earlier matches of a game with its latest match.
pub async fn history(auth: AuthUser, State(state): State<AppState>) -> Response {
    let result = sqlx::query!(
        r#"
        SELECT
            gr.snapshot_id,
            gr.game_id,
            gr.user_id,
            gr.place,
            gr.total_score,
            gr.created_at AS played_at,
            g.winner_rule,
            a.rounds_played AS "rounds_played!",
            a.best_round
        FROM game_results gr
        JOIN games g ON g.id = gr.game_id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) AS rounds_played,
                CASE WHEN g.winner_rule = 'min' THEN MIN(sa.value) ELSE MAX(sa.value) END AS best_round
            FROM score_archives sa
            WHERE sa.snapshot_id = gr.snapshot_id AND sa.user_id = gr.user_id
        ) a ON TRUE
        WHERE g.group_id = $1
        ORDER BY gr.created_at ASC, gr.snapshot_id ASC, gr.user_id ASC
        "#,
        auth.group_id,
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => {
            let placements: Vec<PlayerPlacement> = rows
                .into_iter()
                .map(|r| {
                    let played_at = r.played_at.to_rfc3339();
                    PlayerPlacement {
                        snapshot_id: r.snapshot_id,
                        game_id: r.game_id,
                        user_id: r.user_id,
                        place: r.place,
                        total_score: r.total_score,
                        rounds_played: r.rounds_played,
                        best_round: r.best_round,
                        winner_rule: r.winner_rule,
                        closed_at: played_at.clone(),
                        played_at,
                    }
                })
                .collect();
            Json(placements).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
