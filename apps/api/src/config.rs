use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_access_expiry_minutes: i64,
    pub jwt_refresh_expiry_days: i64,
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
                .unwrap_or("7".into())
                .parse()
                .expect("JWT_REFRESH_EXPIRY_DAYS must be a number"),
            port: env::var("PORT")
                .unwrap_or("8080".into())
                .parse()
                .expect("PORT must be a number"),
        }
    }
}