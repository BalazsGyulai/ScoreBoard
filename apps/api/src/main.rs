use api::{config::Config, router, AppState};
use api::db::pool::create_pool;

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
