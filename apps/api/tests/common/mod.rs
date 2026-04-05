use api::{config::Config, router, AppState};
use axum_test::TestServer;
use sqlx::PgPool;

// spins up a test server
// each tets should call this at the the top
pub async fn test_server() -> TestServer {
    dotenvy::from_filename(".env.test").ok();

    let config = Config::from_env();
    let db = PgPool::connect(&config.database_url).await.expect("Failed to connect to test database");

    let state = AppState { db, config };
    let app = router::build(state);

    TestServer::new(app).expect("Failed to start test server")
}