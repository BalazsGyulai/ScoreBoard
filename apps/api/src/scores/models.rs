use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// One row of the scores table joined with username
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ScoreRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub username: String,
    pub round: i32,
    pub value: i32,
    pub recorded_at: DateTime<Utc>,
}

// Request to submit all scores for the current round
#[derive(Debug, Deserialize)]
pub struct AddRoundRequest {
    pub scores: Vec<PlayerScore>,
}

#[derive(Debug, Deserialize)]
pub struct PlayerScore {
    pub player_id: Uuid,
    pub value: i32,
}
