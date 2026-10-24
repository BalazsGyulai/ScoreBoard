use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_access_expiry_minutes: i64,
    /// Sliding lifetime of a refresh token. Every successful refresh issues a new
    /// token with a fresh lifetime, so an active session never expires.
    pub jwt_refresh_expiry_days: i64,
    /// A rotated refresh token presented again within this window is treated as a
    /// concurrent request (two tabs / parallel fetches), not as token theft.
    pub refresh_reuse_grace_seconds: i64,
    pub port: u16
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret: env::var("JWT_SECRET")
                .expect("JWT_SECRET must be set"),
            jwt_access_expiry_minutes: env::var("JWT_ACCESS_EXPIRY_MINUTES")
                .unwrap_or("15".into())
                .parse()
                .expect("JWT_ACCESS_EXPIRY_MINUTES must be a number"),
            jwt_refresh_expiry_days: env::var("JWT_REFRESH_EXPIRY_DAYS")
                .unwrap_or("30".into())
                .parse()
                .expect("JWT_REFRESH_EXPIRY_DAYS must be a number"),
            refresh_reuse_grace_seconds: env::var("REFRESH_REUSE_GRACE_SECONDS")
                .unwrap_or("60".into())
                .parse()
                .expect("REFRESH_REUSE_GRACE_SECONDS must be a number"),
            port: env::var("PORT")
                .unwrap_or("8080".into())
                .parse()
                .expect("PORT must be a number"),
        }
    }
}
