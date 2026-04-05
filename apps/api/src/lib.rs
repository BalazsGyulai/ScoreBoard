pub mod auth;
pub mod config;
pub mod games;
pub mod players;
pub mod router;
pub mod scores;
pub mod stats;
pub mod db;

use config::Config;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
}