// Shared helpers for the API integration tests.
//
// The tests talk to a real PostgreSQL database (DATABASE_URL, defaulting to the
// docker-compose dev database). Every test registers its own fresh group with a
// random email, so tests are independent and can run in parallel.
#![allow(dead_code)]

use api::{config::Config, router, sse::broadcaster::Broadcaster, AppState};
use axum_test::{TestResponse, TestServer};
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub const PASSWORD: &str = "password123";

pub struct TestApp {
    pub server: TestServer,
    pub state: AppState,
}

pub async fn test_app() -> TestApp {
    test_app_with(|_| {}).await
}

/// Build a server, letting the test tweak the config (token lifetimes etc.).
pub async fn test_app_with(configure: impl FnOnce(&mut Config)) -> TestApp {
    dotenvy::from_filename(".env.test").ok();

    let mut config = Config {
        database_url: std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://homegame:homegame@localhost:5432/homegame".into()),
        jwt_secret: "integration-test-secret".into(),
        jwt_access_expiry_minutes: 15,
        jwt_refresh_expiry_days: 30,
        refresh_reuse_grace_seconds: 60,
        port: 0,
    };
    configure(&mut config);

    let db = PgPool::connect(&config.database_url)
        .await
        .expect("Failed to connect to test database (set DATABASE_URL)");
    api::db::schema::ensure(&db).await.expect("Failed to apply schema");

    let state = AppState {
        db,
        config,
        broadcaster: Arc::new(Broadcaster::new()),
    };
    let server = TestServer::new(router::build(state.clone())).expect("Failed to start test server");
    TestApp { server, state }
}

/// The two auth cookies of a logged-in browser.
#[derive(Clone, Debug)]
pub struct Session {
    pub access: String,
    pub refresh: String,
    pub user_id: Uuid,
    pub group_id: Uuid,
    pub email: String,
}

impl Session {
    pub fn cookie(&self) -> String {
        format!("hg_access_token={}; hg_refresh_token={}", self.access, self.refresh)
    }

    pub fn access_only(&self) -> String {
        format!("hg_access_token={}", self.access)
    }

    pub fn refresh_only(&self) -> String {
        format!("hg_refresh_token={}", self.refresh)
    }

    /// Replace tokens with the ones a refresh response just set.
    pub fn update_from(&mut self, response: &TestResponse) {
        self.access = response.cookie("hg_access_token").value().to_string();
        self.refresh = response.cookie("hg_refresh_token").value().to_string();
    }
}

pub fn unique_email(prefix: &str) -> String {
    format!("{prefix}-{}@test.com", Uuid::new_v4())
}

fn session_from(response: &TestResponse, email: &str) -> Session {
    let body: serde_json::Value = response.json();
    Session {
        access: response.cookie("hg_access_token").value().to_string(),
        refresh: response.cookie("hg_refresh_token").value().to_string(),
        user_id: body["user_id"].as_str().unwrap().parse().unwrap(),
        group_id: body["group_id"].as_str().unwrap().parse().unwrap(),
        email: email.to_string(),
    }
}

/// Register a new group; the caller becomes its leader.
pub async fn register_leader(server: &TestServer, prefix: &str) -> Session {
    let email = unique_email(prefix);
    let response = server
        .post("/auth/register")
        .json(&json!({
            "email": email,
            "username": format!("{prefix}-leader"),
            "password": PASSWORD,
            "password2": PASSWORD,
        }))
        .await;
    response.assert_status(axum::http::StatusCode::CREATED);
    session_from(&response, &email)
}

pub async fn login(server: &TestServer, email: &str) -> Session {
    let response = server
        .post("/auth/login")
        .json(&json!({ "email": email, "password": PASSWORD }))
        .await;
    response.assert_status_ok();
    session_from(&response, email)
}

/// Leader adds a member to their group; returns the member's logged-in session.
pub async fn add_member(server: &TestServer, leader: &Session, username: &str) -> Session {
    let email = unique_email(username);
    server
        .post("/players")
        .add_header("cookie", leader.cookie())
        .json(&json!({ "username": username, "email": email, "password": PASSWORD }))
        .await
        .assert_status(axum::http::StatusCode::CREATED);
    login(server, &email).await
}

pub async fn create_game(server: &TestServer, leader: &Session, name: &str) -> Uuid {
    let response = server
        .post("/games")
        .add_header("cookie", leader.cookie())
        .json(&json!({ "name": name, "winner_rule": "max", "icon": "🎲" }))
        .await;
    response.assert_status(axum::http::StatusCode::CREATED);
    let body: serde_json::Value = response.json();
    body["id"].as_str().unwrap().parse().unwrap()
}

pub async fn add_round(server: &TestServer, leader: &Session, game_id: Uuid, scores: &[(Uuid, i32)]) -> TestResponse {
    let scores: Vec<_> = scores
        .iter()
        .map(|(player_id, value)| json!({ "player_id": player_id, "value": value }))
        .collect();
    server
        .post(&format!("/games/{game_id}/scores"))
        .add_header("cookie", leader.cookie())
        .json(&json!({ "scores": scores }))
        .await
}
