mod auth;
mod config;
mod db;
mod games;
mod players;
mod router;
mod scores;
mod sse;
mod stats;

use config::Config;
use db::pool::create_pool;

// AppState - each field is an Arc internally
#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Config,
}

#[tokio::main]
async fn main() {
    // Load .env in development
    dotenvy::dotenv().ok();

    // logging: RUST_LOG=debug
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::from_env();
    let db = create_pool(&config.database_url).await;
    let state = AppState {
        db,
        config: config.clone(),
    };
    let app = router::build(state);
    let addr = format!("0.0.0.0:{}", config.port);

    tracing::info!("API listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
