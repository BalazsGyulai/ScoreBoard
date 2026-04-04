// JWT creation and verification
use crate::AppState;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// JWT token fields
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,      // user UUID
    pub group_id: String, // group UUID
    pub role: String,
    pub scope: Vec<String>, // [read] || [write]
    pub exp: i64,           // unix timestamp
    pub iat: i64,           // unix timestamp
}

pub fn create_access_token(state: &AppState, user_id: Uuid, group_id: Uuid, role: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let expires = now + Duration::minutes(state.config.jwt_access_expiry_minutes);
    let scope = role_handler(role);
    let claims = Claims {
        sub: user_id.to_string(),
        group_id: group_id.to_string(),
        role: role.to_string(),
        scope,
        exp: expires.timestamp(),
        iat: now.timestamp(),
    };

   encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
} 


pub fn create_refresh_token(
    state: &AppState,
    user_id: Uuid,
    group_id: Uuid,
    role: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let expires = now + Duration::days(state.config.jwt_refresh_expiry_days);

    let claims = Claims {
        sub: user_id.to_string(),
        group_id: group_id.to_string(),
        role: role.to_string(),
        scope: vec![],         // refresh tokens don't carry scope
        exp: expires.timestamp(),
        iat: now.timestamp(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
}

pub fn verify_token(
    state: &AppState,
    token: &str,
) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

fn role_handler(role: &str) -> Vec<String> {
    if role == "viewer" {
        vec!["read".to_string()]
    } else {
        vec!["read".to_string(), "write".to_string()]
    }
}