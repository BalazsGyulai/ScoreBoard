pub mod auth;
pub mod config;
pub mod games;
pub mod grpc;
pub mod players;
pub mod router;
pub mod scores;
pub mod stats;
pub mod db;
pub mod sse;

use config::Config;
use sqlx::PgPool;
use std::sync::Arc;

use crate::sse::broadcaster::Broadcaster;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub broadcaster: Arc<Broadcaster>,
}