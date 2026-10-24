use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct PlayerStat {
    pub id: Uuid,
    pub username: String,
    pub wins: i64,
    pub losses: i64,
    pub total_rounds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlayerPlacement {
    pub snapshot_id: Uuid,
    pub game_id: Uuid,
    pub user_id: Uuid,
    pub place: i32,
    pub total_score: i32,
    /// Rounds this player has scores for in this match (0 for matches without archive).
    pub rounds_played: i64,
    /// Best single round of this player (lowest for "min" games, highest for "max").
    pub best_round: Option<i32>,
    pub winner_rule: String,
    /// When the match was finished (RFC 3339, UTC).
    pub played_at: String,
    /// Same as played_at — kept for clients built before played_at existed.
    pub closed_at: String,
}
