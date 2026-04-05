use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{AppendHeaders, IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use super::models::{AuthResponse, LoginRequest, RegisterRequest, User};
use super::tokens::{create_access_token, create_refresh_token};
use crate::AppState;

// builds a Set-Cookie header value with security flags
fn make_cookie(name: &str, value: String, max_age_secs: i64) -> String {
    format!("{name}={value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={max_age_secs}")
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

    let access_token = match create_access_token(&state, user_id, group_id, "leader") {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let refresh_token = match create_refresh_token(&state, user_id, group_id, "leader") {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let access_max_age  = state.config.jwt_access_expiry_minutes * 60;
    let refresh_max_age = state.config.jwt_refresh_expiry_days   * 86_400;

    (
        StatusCode::CREATED,
        AppendHeaders([
            (header::SET_COOKIE, make_cookie("hg_access_token",  access_token,  access_max_age)),
            (header::SET_COOKIE, make_cookie("hg_refresh_token", refresh_token, refresh_max_age)),
        ]),
        Json(AuthResponse {
            user_id,
            group_id,
            username: body.username.trim().to_string(),
            role: "leader".to_string(),
        }),
    )
        .into_response()
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

    let access_token = match create_access_token(&state, user.id, user.group_id, &user.role) {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let refresh_token = match create_refresh_token(&state, user.id, user.group_id, &user.role) {
        Ok(t)  => t,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let access_max_age  = state.config.jwt_access_expiry_minutes * 60;
    let refresh_max_age = state.config.jwt_refresh_expiry_days   * 86_400;

    (
        StatusCode::OK,
        AppendHeaders([
            (header::SET_COOKIE, make_cookie("hg_access_token",  access_token,  access_max_age)),
            (header::SET_COOKIE, make_cookie("hg_refresh_token", refresh_token, refresh_max_age)),
        ]),
        Json(AuthResponse {
            user_id:  user.id,
            group_id: user.group_id,
            username: user.username,
            role:     user.role,
        }),
    )
        .into_response()
}

// POST /auth/logout — clears both cookies by setting Max-Age=0
pub async fn logout() -> Response {
    (
        StatusCode::OK,
        AppendHeaders([
            (header::SET_COOKIE, make_cookie("hg_access_token",  String::new(), 0)),
            (header::SET_COOKIE, make_cookie("hg_refresh_token", String::new(), 0)),
        ]),
        Json(serde_json::json!({ "message": "Logged out" })),
    )
        .into_response()
}
