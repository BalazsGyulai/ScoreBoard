use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{AppendHeaders, IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use super::models::{AuthResponse, LoginRequest, RegisterRequest, User};
use super::refresh::{self, RefreshOutcome};
use super::tokens::{access_token_ttl_secs, create_access_token};
use crate::{auth::middleware::AuthUser, AppState};

pub const ACCESS_COOKIE: &str = "hg_access_token";
pub const REFRESH_COOKIE: &str = "hg_refresh_token";

// builds a Set-Cookie header value with security flags
fn make_cookie(name: &str, value: &str, max_age_secs: i64) -> String {
    format!("{name}={value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={max_age_secs}")
}

/// Reads a cookie value from the request headers.
pub fn read_cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let prefix = format!("{name}=");
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|part| part.trim().strip_prefix(prefix.as_str()))
        .filter(|v| !v.is_empty())
}

fn clear_cookies() -> AppendHeaders<[(header::HeaderName, String); 2]> {
    AppendHeaders([
        (header::SET_COOKIE, make_cookie(ACCESS_COOKIE, "", 0)),
        (header::SET_COOKIE, make_cookie(REFRESH_COOKIE, "", 0)),
    ])
}

/// Mint an access token and build the session response (both cookies + JSON body).
fn session_response(
    state: &AppState,
    status: StatusCode,
    user: AuthResponseParts,
    refresh_token: &str,
) -> Response {
    let access_token = match create_access_token(state, user.user_id, user.group_id, &user.role) {
        Ok(t) => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let access_max_age = access_token_ttl_secs(state);
    let refresh_max_age = refresh::refresh_token_ttl_secs(state);

    (
        status,
        AppendHeaders([
            (header::SET_COOKIE, make_cookie(ACCESS_COOKIE, &access_token, access_max_age)),
            (header::SET_COOKIE, make_cookie(REFRESH_COOKIE, refresh_token, refresh_max_age)),
        ]),
        Json(AuthResponse {
            user_id: user.user_id,
            group_id: user.group_id,
            username: user.username,
            role: user.role,
            access_expires_in: access_max_age,
        }),
    )
        .into_response()
}

struct AuthResponseParts {
    user_id: Uuid,
    group_id: Uuid,
    username: String,
    role: String,
}

// POST /auth/register
pub async fn register(State(state): State<AppState>, Json(body): Json<RegisterRequest>) -> Response {
    if body.email.trim().is_empty() || body.username.trim().is_empty() || body.password.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Email, username and password are required"
        }))).into_response();
    }
    if body.password != body.password2 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Passwords do not match"
        }))).into_response();
    }
    if body.password.len() < 8 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Password must be at least 8 characters"
        }))).into_response();
    }

    let pass_hash = match bcrypt::hash(&body.password, 10) {
        Ok(h) => h,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // create a new group + user in a single transaction
    // if either insert fails, both are rolled back
    let mut tx = match state.db.begin().await {
        Ok(tx)  => tx,
        Err(_)  => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let group_id = Uuid::new_v4();
    let user_id  = Uuid::new_v4();

    let group_result = sqlx::query!(
        "INSERT INTO groups (id) VALUES ($1)",
        group_id
    )
    .execute(&mut *tx)
    .await;

    if group_result.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let user_result = sqlx::query!(
        r#"
        INSERT INTO users (id, group_id, username, email, pass_hash, role)
        VALUES ($1, $2, $3, $4, $5, 'leader')
        "#,
        user_id,
        group_id,
        body.username.trim(),
        body.email.trim().to_lowercase(),
        pass_hash,
    )
    .execute(&mut *tx)
    .await;

    match user_result {
        Ok(_) => {}
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("duplicate") {
                return (StatusCode::CONFLICT, Json(serde_json::json!({
                    "error": "Email already registered"
                }))).into_response();
            }
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    if tx.commit().await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let refresh_token = match refresh::issue_new_family(&state, user_id).await {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    session_response(
        &state,
        StatusCode::CREATED,
        AuthResponseParts {
            user_id,
            group_id,
            username: body.username.trim().to_string(),
            role: "leader".to_string(),
        },
        &refresh_token,
    )
}

// POST /auth/login
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Response {
    // look up by email
    // role::TEXT casts the DB enum to a plain string that sqlx can map to User.role
    let user = sqlx::query_as!(
        User,
        r#"
        SELECT id, group_id, username, pass_hash, role::TEXT as "role!", email, created_at
        FROM users WHERE email = $1 LIMIT 1
        "#,
        body.email.trim().to_lowercase(),
    )
    .fetch_optional(&state.db)
    .await;

    let user = match user {
        Ok(Some(u)) => u,
        Ok(None) => {
            // same error for wrong email or wrong password
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                "error": "Invalid email or password"
            }))).into_response();
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let valid = bcrypt::verify(&body.password, &user.pass_hash).unwrap_or(false);
    if !valid {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "error": "Invalid email or password"
        }))).into_response();
    }

    let refresh_token = match refresh::issue_new_family(&state, user.id).await {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    session_response(
        &state,
        StatusCode::OK,
        AuthResponseParts {
            user_id: user.id,
            group_id: user.group_id,
            username: user.username,
            role: user.role,
        },
        &refresh_token,
    )
}

// POST /auth/refresh — exchange the refresh cookie for a new access + refresh token
pub async fn refresh(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let unauthorized = |message: &str| {
        (
            StatusCode::UNAUTHORIZED,
            clear_cookies(),
            Json(serde_json::json!({ "error": message })),
        )
            .into_response()
    };

    let Some(presented) = read_cookie(&headers, REFRESH_COOKIE) else {
        return unauthorized("Missing refresh token");
    };

    match refresh::rotate(&state, presented).await {
        Ok(RefreshOutcome::Rotated { user_id, group_id, username, role, token }) => session_response(
            &state,
            StatusCode::OK,
            AuthResponseParts { user_id, group_id, username, role },
            &token,
        ),
        Ok(RefreshOutcome::Rejected) => unauthorized("Invalid or expired refresh token"),
        Ok(RefreshOutcome::ReuseDetected) => unauthorized("Session revoked"),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// POST /auth/logout — revokes the session server-side and clears both cookies
pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(presented) = read_cookie(&headers, REFRESH_COOKIE)
        && refresh::revoke_family_of(&state, presented).await.is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    (
        StatusCode::OK,
        clear_cookies(),
        Json(serde_json::json!({ "message": "Logged out" })),
    )
        .into_response()
}

// GET /auth/me — returns the current authenticated user identity
pub async fn me(auth: AuthUser) -> Response {
    Json(serde_json::json!({
        "user_id": auth.user_id,
        "group_id": auth.group_id,
        "username": auth.username,
        "role": auth.role,
    }))
    .into_response()
}
