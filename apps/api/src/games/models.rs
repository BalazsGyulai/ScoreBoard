use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Game {
    pub id: Uuid,
    pub group_id: Uuid,
    pub name: String,
    pub winner_rule: String,
    pub current_round: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGameRequest {
    pub name: String,
    pub winner_rule: String, // "min" or "max"
    pub icon: String,
}
