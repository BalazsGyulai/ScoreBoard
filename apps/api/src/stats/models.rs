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
    pub closed_at: String,
}
