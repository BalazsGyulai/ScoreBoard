use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;

use super::models::{AddPlayerRequest, Player, UpdatePlayerRequest};
use crate::{auth::middleware::AuthUser, AppState};

// GET /players — list all members of the caller's group
pub async fn list_players(auth: AuthUser, State(state): State<AppState>) -> Response {
    let result = sqlx::query_as!(
        Player,
        r#"SELECT id, group_id, username, email, role::TEXT as "role!", created_at
           FROM users WHERE group_id = $1 ORDER BY username"#,
        auth.group_id,
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(players) => Json(players).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// POST /players — add a new member (leader only)
pub async fn add_player(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<AddPlayerRequest>,
) -> Response {
    if auth.role != "leader" {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can add players" }))).into_response();
    }

    if body.username.trim().is_empty() || body.email.trim().is_empty() || body.password.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "All fields are required" }))).into_response();
    }

    let pass_hash = match bcrypt::hash(&body.password, 10) {
        Ok(h) => h,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let player_id = Uuid::new_v4();

    let result = sqlx::query!(
        r#"INSERT INTO users (id, group_id, username, email, pass_hash, role)
           VALUES ($1, $2, $3, $4, $5, 'member')"#,
        player_id,
        auth.group_id,
        body.username.trim(),
        body.email.trim().to_lowercase(),
        pass_hash,
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({
            "id": player_id,
            "username": body.username.trim(),
        }))).into_response(),
        Err(e) if e.to_string().contains("unique") => {
            (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "Username or email already taken" }))).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// DELETE /players/:id — remove a member (leader only, cannot remove self)
pub async fn delete_player(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Response {
    if auth.role != "leader" {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Only the leader can remove players" }))).into_response();
    }
    if id == auth.user_id {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Cannot remove yourself" }))).into_response();
    }

    let result = sqlx::query!(
        "DELETE FROM users WHERE id = $1 AND group_id = $2",
        id,
        auth.group_id,
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// PATCH /players/:id — update email and/or password (leader: anyone, member: self)
pub async fn update_player(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdatePlayerRequest>,
) -> Response {
    let can_edit = auth.role == "leader" || auth.user_id == id;
    if !can_edit {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "You can only edit your own account" }))).into_response();
    }

    let email = body.email.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let password = body.password.unwrap_or_default();
    let password2 = body.password2.unwrap_or_default();
    let has_password_update = !password.is_empty() || !password2.is_empty();

    if email.is_none() && !has_password_update {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Email or password update is required" }))).into_response();
    }

    let pass_hash = if has_password_update {
        if password != password2 {
            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Passwords do not match" }))).into_response();
        }
        if password.len() < 8 {
            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Password must be at least 8 characters" }))).into_response();
        }
        match bcrypt::hash(&password, 10) {
            Ok(h) => Some(h),
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        }
    } else {
        None
    };

    let result = match (email, pass_hash.as_deref()) {
        (Some(next_email), Some(next_hash)) => {
            sqlx::query!(
                r#"UPDATE users
                   SET email = $1, pass_hash = $2
                   WHERE id = $3 AND group_id = $4"#,
                next_email.to_lowercase(),
                next_hash,
                id,
                auth.group_id,
            )
            .execute(&state.db)
            .await
        }
        (Some(next_email), None) => {
            sqlx::query!(
                r#"UPDATE users
                   SET email = $1
                   WHERE id = $2 AND group_id = $3"#,
                next_email.to_lowercase(),
                id,
                auth.group_id,
            )
            .execute(&state.db)
            .await
        }
        (None, Some(next_hash)) => {
            sqlx::query!(
                r#"UPDATE users
                   SET pass_hash = $1
                   WHERE id = $2 AND group_id = $3"#,
                next_hash,
                id,
                auth.group_id,
            )
            .execute(&state.db)
            .await
        }
        (None, None) => return StatusCode::BAD_REQUEST.into_response(),
    };

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => StatusCode::NOT_FOUND.into_response(),
        Err(e) if e.to_string().contains("unique") => {
            (StatusCode::CONFLICT, Json(serde_json::json!({ "error": "Email already in use" }))).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
