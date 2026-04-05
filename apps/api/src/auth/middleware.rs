use axum::{
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
};
use uuid::Uuid;
use crate::{auth::tokens::verify_token, AppState};

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub group_id: Uuid,
    pub role: String,
}

impl<S> FromRequestParts<S> for AuthUser
where
    AppState: axum::extract::FromRef<S>,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = AppState::from_ref(state);

        let cookies = parts
            .headers
            .get(axum::http::header::COOKIE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let token = cookies.split(';').find_map(|part| {
            part.trim().strip_prefix("hg_access_token=")
        });

        let token = match token {
            Some(t) => t,
            None => return Err((StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({ "error": "Missing auth token" }))).into_response()),
        };

        match verify_token(&state, token) {
            Ok(claims) => {
                let user_id = Uuid::parse_str(&claims.sub)
                    .map_err(|_| (StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({ "error": "Invalid token" }))).into_response())?;
                let group_id = Uuid::parse_str(&claims.group_id)
                    .map_err(|_| (StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({ "error": "Invalid token" }))).into_response())?;
                Ok(AuthUser { user_id, group_id, role: claims.role })
            }
            Err(_) => Err((StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({ "error": "Invalid or expired token" }))).into_response()),
        }
    }
}
