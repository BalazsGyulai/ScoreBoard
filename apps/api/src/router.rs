use crate::{auth::handlers, games, players, scores, sse, stats, AppState};
use axum::{
    routing::{delete, get, post},
    Router,
};
use http::{header::{AUTHORIZATION, CONTENT_TYPE}, Method};
use tower_http::cors::CorsLayer;

pub fn build(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(["http://localhost:3000".parse().unwrap()])
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
        // Wildcards are forbidden when allow_credentials is true — list headers explicitly
        .allow_headers([CONTENT_TYPE, AUTHORIZATION])
        .allow_credentials(true); // required for HttpOnly cookies to be sent cross-origin

    // SSE stream uses permissive CORS — viewers connect cross-origin with only a
    // URL token for auth (no cookies). Mounted separately so it doesn't inherit
    // the credential-based CORS from the main API routes.
    let live_cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET]);

    let live_routes = Router::new()
        .route("/live/{token}/stream", get(sse::handlers::stream))
        .with_state(state.clone())
        .layer(live_cors);

    let api_routes = Router::new()
        // ── Auth ──────────────────────────────────────────────────────────────
        .route("/auth/register", post(handlers::register))
        .route("/auth/login",    post(handlers::login))
        .route("/auth/logout",   post(handlers::logout))
        .route("/auth/me",       get(handlers::me))

        // ── Players ───────────────────────────────────────────────────────────
        .route(
            "/players",
            get(players::handlers::list_players).post(players::handlers::add_player),
        )
        .route(
            "/players/{id}",
            delete(players::handlers::delete_player).patch(players::handlers::update_player),
        )

        // ── Games ─────────────────────────────────────────────────────────────
        .route(
            "/games",
            get(games::handlers::list_games).post(games::handlers::create_game),
        )
        .route(
            "/games/{id}",
            get(games::handlers::get_game).delete(games::handlers::delete_game),
        )

        .route("/games/{id}/close", post(games::handlers::close_game))
        .route("/games/{id}/restart", post(games::handlers::restart_game))

        // ── Scores ────────────────────────────────────────────────────────────
        .route(
            "/games/{id}/scores",
            get(scores::handlers::get_scores).post(scores::handlers::add_round),
        )
        .route(
            "/games/{id}/score-snapshots",
            get(scores::handlers::get_score_snapshots),
        )
        .route("/scores/{id}", axum::routing::put(scores::handlers::update_score))

        // ── Stats ─────────────────────────────────────────────────────────────
        .route("/stats", get(stats::handlers::leaderboard))
        .route("/stats/history", get(stats::handlers::history))

        // ── Sharing ──────────────────────────────────────────────────────────
        .route(
            "/games/{id}/share",
            get(sse::handlers::get_share)
                .post(sse::handlers::create_share)
                .delete(sse::handlers::delete_share),
        )

        // State is available to every handler via State<AppState>
        .with_state(state)
        .layer(cors);

    // Merge both routers — live routes checked first.
    live_routes.merge(api_routes)
}
