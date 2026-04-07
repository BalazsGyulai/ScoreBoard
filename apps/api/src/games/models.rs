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
    pub icon: String,
    pub current_round: i32,
    pub status: String,
    pub closed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGameRequest {
    pub name: String,
    pub winner_rule: String, // "min" or "max"
    pub icon: String,
}

#[derive(Debug, Serialize)]
pub struct GameResult {
    pub user_id: Uuid,
    pub username: String,
    pub total_score: i64,
    pub place: i32,
}

#[derive(Debug, Serialize)]
pub struct CloseGameResponse {
    pub game_id: Uuid,
    pub results: Vec<GameResult>,
}
