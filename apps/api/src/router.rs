use crate::{auth::handlers, AppState};
use axum::{routing::post, Router};
use http::{header::{AUTHORIZATION, CONTENT_TYPE}, Method};
use tower_http::cors::CorsLayer;

pub fn build(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(["http://localhost:3000".parse().unwrap()])
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        // Wildcards are forbidden when allow_credentials is true — list headers explicitly
        .allow_headers([CONTENT_TYPE, AUTHORIZATION])
        .allow_credentials(true); // required for HttpOnly cookies to be sent cross-origin

    Router::new()
        // Auth routes
        .route("/auth/register", post(handlers::register))
        .route("/auth/login", post(handlers::login))
        .route("/auth/logout", post(handlers::logout))
        // State is available to every handler via State<AppState>
        .with_state(state)
        .layer(cors)
}
