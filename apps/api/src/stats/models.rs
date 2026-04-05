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
