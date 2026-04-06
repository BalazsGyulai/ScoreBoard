use crate::{auth::handlers, games, players, scores, stats, AppState};
use axum::{
    routing::{delete, get, post},
    Router,
};
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
        // ── Auth ──────────────────────────────────────────────────────────────
        .route("/auth/register", post(handlers::register))
        .route("/auth/login",    post(handlers::login))
        .route("/auth/logout",   post(handlers::logout))

        // ── Players ───────────────────────────────────────────────────────────
        .route(
            "/players",
            get(players::handlers::list_players).post(players::handlers::add_player),
        )
        .route("/players/{id}", delete(players::handlers::delete_player))

        // ── Games ─────────────────────────────────────────────────────────────
        .route(
            "/games",
            get(games::handlers::list_games).post(games::handlers::create_game),
        )
        .route(
            "/games/{id}",
            get(games::handlers::get_game).delete(games::handlers::delete_game),
        )

        // ── Scores ────────────────────────────────────────────────────────────
        .route(
            "/games/{id}/scores",
            get(scores::handlers::get_scores).post(scores::handlers::add_round),
        )
        .route("/scores/{id}", axum::routing::put(scores::handlers::update_score))

        // ── Stats ─────────────────────────────────────────────────────────────
        .route("/stats", get(stats::handlers::leaderboard))

        // State is available to every handler via State<AppState>
        .with_state(state)
        .layer(cors)
}
