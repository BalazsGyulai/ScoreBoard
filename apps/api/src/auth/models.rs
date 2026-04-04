use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// maps directly to users table row
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub group_id: Uuid,
    pub username: String,
    pub pass_hash: String,
    pub role: String,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

// HTTP request body for registration
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub password2: String,
}

// HTTP request body for login — email is the unique identifier
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

// HTTP JSON response after login / register
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user_id: Uuid,
    pub group_id: Uuid,
    pub username: String,
    pub role: String,
}
