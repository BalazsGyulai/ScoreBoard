use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

use super::models::PlayerStat;
use crate::{auth::middleware::AuthUser, AppState};

// GET /stats — overall leaderboard for the caller's group
// Wins = rounds where the player had the best score (min or max depending on game rule)
pub async fn leaderboard(auth: AuthUser, State(state): State<AppState>) -> Response {
    let result = sqlx::query!(
        r#"
        WITH round_results AS (
            SELECT
                s.user_id,
                CASE
                    WHEN g.winner_rule = 'min' THEN s.value = MIN(s.value) OVER (PARTITION BY s.game_id, s.round)
                    ELSE                             s.value = MAX(s.value) OVER (PARTITION BY s.game_id, s.round)
                END AS is_winner
            FROM scores s
            JOIN games g ON g.id = s.game_id
            WHERE g.group_id = $1
        )
        SELECT
            u.id,
            u.username,
            COALESCE(SUM(CASE WHEN rr.is_winner THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(SUM(CASE WHEN NOT rr.is_winner THEN 1 ELSE 0 END), 0) AS losses,
            COALESCE(COUNT(rr.user_id), 0) AS total_rounds
        FROM users u
        LEFT JOIN round_results rr ON rr.user_id = u.id
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
