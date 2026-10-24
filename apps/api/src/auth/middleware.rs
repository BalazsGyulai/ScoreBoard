use axum::{
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
};
use uuid::Uuid;
use crate::{
    auth::{handlers::{read_cookie, ACCESS_COOKIE}, tokens::verify_access_token},
    AppState,
};

/// The authenticated caller. Every protected handler takes this as an argument and
/// must scope its queries by `group_id` — that is the tenant boundary.
#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub group_id: Uuid,
    pub username: String,
    pub role: String,
}

fn unauthorized(message: &str) -> Response {
    (StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({ "error": message }))).into_response()
}

impl<S> FromRequestParts<S> for AuthUser
where
    AppState: axum::extract::FromRef<S>,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = AppState::from_ref(state);

        let token = read_cookie(&parts.headers, ACCESS_COOKIE)
            .ok_or_else(|| unauthorized("Missing auth token"))?;

        let claims = verify_access_token(&state, token)
            .map_err(|_| unauthorized("Invalid or expired token"))?;

        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| unauthorized("Invalid token"))?;

        // Group and role come from the database, not from the token: a removed player
        // loses access immediately and a role change applies to the next request.
        let user = sqlx::query!(
            r#"SELECT group_id, username, role::TEXT AS "role!" FROM users WHERE id = $1"#,
            user_id,
        )
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())?
        .ok_or_else(|| unauthorized("User no longer exists"))?;

        Ok(AuthUser {
            user_id,
            group_id: user.group_id,
            username: user.username,
            role: user.role,
        })
    }
}
