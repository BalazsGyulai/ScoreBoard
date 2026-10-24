// JWT creation and verification (access tokens only).
// Refresh tokens are opaque random strings stored hashed in the DB — see auth/refresh.rs.
use crate::AppState;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const ACCESS_TOKEN_TYPE: &str = "access";

// JWT token fields
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,      // user UUID
    pub group_id: String, // group UUID
    pub role: String,
    pub scope: Vec<String>, // [read] || [write]
    pub exp: i64,           // unix timestamp
    pub iat: i64,           // unix timestamp
    /// Token type. Only "access" tokens are accepted by the auth extractor.
    /// Missing on tokens issued before refresh rotation existed.
    #[serde(default)]
    pub typ: String,
}

impl Claims {
    /// Tokens issued before the `typ` claim existed are accepted only if they carry a
    /// scope: the old refresh JWTs had an empty scope and must never act as access tokens.
    fn is_access_token(&self) -> bool {
        self.typ == ACCESS_TOKEN_TYPE || (self.typ.is_empty() && !self.scope.is_empty())
    }
}

pub fn access_token_ttl_secs(state: &AppState) -> i64 {
    state.config.jwt_access_expiry_minutes * 60
}

pub fn create_access_token(state: &AppState, user_id: Uuid, group_id: Uuid, role: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let expires = now + Duration::seconds(access_token_ttl_secs(state));
    let claims = Claims {
        sub: user_id.to_string(),
        group_id: group_id.to_string(),
        role: role.to_string(),
        scope: role_handler(role),
        exp: expires.timestamp(),
        iat: now.timestamp(),
        typ: ACCESS_TOKEN_TYPE.to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
}

/// Verifies signature, expiry and that the token is an access token.
pub fn verify_access_token(
    state: &AppState,
    token: &str,
) -> Result<Claims, jsonwebtoken::errors::Error> {
    // The API is the only issuer and verifier, so clock skew is not a concern:
    // keep the leeway small so "expired" means expired.
    let mut validation = Validation::default();
    validation.leeway = 5;

    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &validation,
    )?;

    if !data.claims.is_access_token() {
        return Err(jsonwebtoken::errors::ErrorKind::InvalidToken.into());
    }
    Ok(data.claims)
}

fn role_handler(role: &str) -> Vec<String> {
    if role == "viewer" {
        vec!["read".to_string()]
    } else {
        vec!["read".to_string(), "write".to_string()]
    }
}
