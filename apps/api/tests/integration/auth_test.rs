mod common;

use axum_test::TestServer;
use serde_json::json;

// register a fresh user and return the server
async fn register_user(server: &TestServer, email: &str) {
    server
        .post("/auth/register")
        .json(&json!({
            "email": email,
            "username": "testuser",
            "password": "password123",
            "password2": "password123"
        }))
        .await
        .assert_status(axum::http::StatusCode::CREATED);
}

#[tokio::test]
async fn login_returns_200_sets_both_cookies() {
    let server = common::test_server().await;

    let email = format!("login-test-{}@test.com", uuid::Uuid::new_v4());
    register_user(&server, &email).await;

    let response = server
        .post("/auth/login")
        .json(&json!({
            "email": email,
            "password": "password123"
        }))
        .await;

    response.assert_status(axum::http::StatusCode::OK);

    let cookies: Vec<String> = response
        .iter_headers_by_name("set-cookie")
        .map(|v| v.to_str().unwrap().to_string())
        .collect();

    assert!(
        cookies.iter().any(|c| c.starts_with("hg_access_token=")),
        "Missing hg_access_token cookie. Got: {cookies:?}"
    );
    assert!(
        cookies.iter().any(|c| c.starts_with("hg_refresh_token=")),
        "Missing hg_refresh_token cookie. Got: {cookies:?}"
    );

    let body: serde_json::Value = response.json();
    assert_eq!(body["username"], "testuser");
    assert_eq!(body["role"], "leader");
    assert!(body["user_id"].is_string());
    assert!(body["group_id"].is_string());
}


#[tokio::test]
async fn login_with_wrong_password_returns_401() {
    let server = common::test_server().await;

    let email = format!("wrong-pw-{}@test.com", uuid::Uuid::new_v4());
    register_user(&server, &email).await;

    let response = server
        .post("/auth/login")
        .json(&json!({
            "email": email,
            "password": "wrong_password"
        }))
        .await;

    response.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}