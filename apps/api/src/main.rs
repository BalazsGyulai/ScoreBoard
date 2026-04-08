use api::{config::Config, grpc::GameStreamService, router, AppState};
use api::db::pool::create_pool;
use api::sse::broadcaster::Broadcaster;
use std::sync::Arc;

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
        broadcaster: Arc::new(Broadcaster::new()),
    };

    // ── HTTP/REST + SSE server (primary) ─────────────────────────────────
    let app = router::build(state.clone());
    let http_addr = format!("0.0.0.0:{}", config.port);

    // ── gRPC server (learning implementation on port+1) ──────────────────
    let grpc_port = config.port + 1;
    let grpc_addr = format!("0.0.0.0:{grpc_port}").parse().unwrap();
    let grpc_service = GameStreamService::new(state).into_server();

    tracing::info!("API listening on {http_addr}");
    tracing::info!("gRPC-web listening on {grpc_addr}");

    let http_listener = tokio::net::TcpListener::bind(&http_addr).await.unwrap();

    // Run both servers concurrently.
    tokio::select! {
        res = axum::serve(http_listener, app) => {
            if let Err(e) = res { tracing::error!("HTTP server error: {e}"); }
        }
        res = tonic::transport::Server::builder()
            .accept_http1(true) // required for gRPC-web (browser clients)
            .layer(tonic_web::GrpcWebLayer::new())
            .add_service(grpc_service)
            .serve(grpc_addr) => {
            if let Err(e) = res { tracing::error!("gRPC server error: {e}"); }
        }
    }
}
