// Authentication: login, refresh past access-token expiry, rotation, reuse
// detection, logout and token-type separation.
mod common;

use axum::http::StatusCode;
use common::{login, register_leader, test_app, test_app_with, PASSWORD};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::json;
use std::time::Duration;

fn set_cookies(response: &axum_test::TestResponse) -> Vec<String> {
    response
        .iter_headers_by_name("set-cookie")
        .map(|v| v.to_str().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn login_sets_httponly_secure_cookies_with_long_refresh_lifetime() {
    let app = test_app().await;
    let leader = register_leader(&app.server, "login").await;

    let response = app
        .server
        .post("/auth/login")
        .json(&json!({ "email": leader.email, "password": PASSWORD }))
        .await;
    response.assert_status_ok();

    let cookies = set_cookies(&response);
    let access = cookies.iter().find(|c| c.starts_with("hg_access_token=")).expect("access cookie");
    let refresh = cookies.iter().find(|c| c.starts_with("hg_refresh_token=")).expect("refresh cookie");
    for c in [access, refresh] {
        assert!(c.contains("HttpOnly"), "{c}");
        assert!(c.contains("Secure"), "{c}");
        assert!(c.contains("SameSite=Lax"), "{c}");
    }
    assert!(access.contains("Max-Age=900"), "{access}");
    assert!(refresh.contains(&format!("Max-Age={}", 30 * 86_400)), "{refresh}");

    let body: serde_json::Value = response.json();
    assert_eq!(body["role"], "leader");
    assert_eq!(body["access_expires_in"], 900);
}

#[tokio::test]
async fn login_with_wrong_password_returns_401() {
    let app = test_app().await;
    let leader = register_leader(&app.server, "wrong-pw").await;

    app.server
        .post("/auth/login")
        .json(&json!({ "email": leader.email, "password": "wrong_password" }))
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn refresh_after_access_token_expired_keeps_the_session_alive() {
    // Access tokens live 0 minutes here: they expire as soon as the 5 s leeway passes.
    let app = test_app_with(|c| c.jwt_access_expiry_minutes = 0).await;
    let mut session = register_leader(&app.server, "expiry").await;

    app.server
        .get("/auth/me")
        .add_header("cookie", session.cookie())
        .await
        .assert_status_ok();

    tokio::time::sleep(Duration::from_millis(6_500)).await;

    // The access token is now expired — this is the moment users got logged out.
    app.server
        .get("/auth/me")
        .add_header("cookie", session.cookie())
        .await
        .assert_status(StatusCode::UNAUTHORIZED);

    // The refresh token silently restores the session.
    let refreshed = app
        .server
        .post("/auth/refresh")
        .add_header("cookie", session.refresh_only())
        .await;
    refreshed.assert_status_ok();
    session.update_from(&refreshed);

    let me = app.server.get("/auth/me").add_header("cookie", session.cookie()).await;
    me.assert_status_ok();
    assert_eq!(me.json::<serde_json::Value>()["user_id"], session.user_id.to_string());

    app.server
        .get("/games")
        .add_header("cookie", session.access_only())
        .await
        .assert_status_ok();
}

#[tokio::test]
async fn refresh_rotates_the_token_and_can_be_repeated_for_days() {
    let app = test_app().await;
    let mut session = register_leader(&app.server, "rotate").await;

    for _ in 0..5 {
        let previous = session.refresh.clone();
        let response = app
            .server
            .post("/auth/refresh")
            .add_header("cookie", session.refresh_only())
            .await;
        response.assert_status_ok();
        session.update_from(&response);
        assert_ne!(session.refresh, previous, "refresh token must rotate");
    }

    app.server
        .get("/auth/me")
        .add_header("cookie", session.access_only())
        .await
        .assert_status_ok();
}

#[tokio::test]
async fn concurrent_refresh_within_grace_window_is_not_treated_as_theft() {
    let app = test_app().await;
    let session = register_leader(&app.server, "grace").await;

    // Two tabs refresh with the same token at nearly the same time.
    let first = app.server.post("/auth/refresh").add_header("cookie", session.refresh_only()).await;
    let second = app.server.post("/auth/refresh").add_header("cookie", session.refresh_only()).await;
    first.assert_status_ok();
    second.assert_status_ok();

    // Both new tokens remain valid.
    for response in [&first, &second] {
        let token = response.cookie("hg_refresh_token").value().to_string();
        app.server
            .post("/auth/refresh")
            .add_header("cookie", format!("hg_refresh_token={token}"))
            .await
            .assert_status_ok();
    }
}

#[tokio::test]
async fn reusing_a_rotated_refresh_token_revokes_the_whole_session() {
    let app = test_app_with(|c| c.refresh_reuse_grace_seconds = 0).await;
    let stolen = register_leader(&app.server, "reuse").await;

    let response = app.server.post("/auth/refresh").add_header("cookie", stolen.refresh_only()).await;
    response.assert_status_ok();
    let legit_refresh = response.cookie("hg_refresh_token").value().to_string();

    tokio::time::sleep(Duration::from_millis(1_100)).await;

    // The old token is replayed (e.g. by an attacker) after the grace window.
    let replay = app.server.post("/auth/refresh").add_header("cookie", stolen.refresh_only()).await;
    replay.assert_status(StatusCode::UNAUTHORIZED);

    // ...which also kills the token the legitimate client holds.
    app.server
        .post("/auth/refresh")
        .add_header("cookie", format!("hg_refresh_token={legit_refresh}"))
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn expired_refresh_token_is_rejected() {
    let app = test_app().await;
    let session = register_leader(&app.server, "refresh-expired").await;

    sqlx::query("UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1")
        .bind(session.user_id)
        .execute(&app.state.db)
        .await
        .unwrap();

    let response = app.server.post("/auth/refresh").add_header("cookie", session.refresh_only()).await;
    response.assert_status(StatusCode::UNAUTHORIZED);
    let cookies = set_cookies(&response);
    assert!(cookies.iter().any(|c| c.starts_with("hg_refresh_token=;") && c.contains("Max-Age=0")));
}

#[tokio::test]
async fn refresh_without_cookie_or_with_garbage_is_rejected() {
    let app = test_app().await;

    app.server.post("/auth/refresh").await.assert_status(StatusCode::UNAUTHORIZED);
    app.server
        .post("/auth/refresh")
        .add_header("cookie", "hg_refresh_token=not-a-real-token")
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn logout_revokes_the_refresh_token_and_clears_cookies() {
    let app = test_app().await;
    let session = register_leader(&app.server, "logout").await;

    let response = app.server.post("/auth/logout").add_header("cookie", session.cookie()).await;
    response.assert_status_ok();
    let cookies = set_cookies(&response);
    assert!(cookies.iter().any(|c| c.starts_with("hg_access_token=;") && c.contains("Max-Age=0")));
    assert!(cookies.iter().any(|c| c.starts_with("hg_refresh_token=;") && c.contains("Max-Age=0")));

    app.server
        .post("/auth/refresh")
        .add_header("cookie", session.refresh_only())
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn logout_only_ends_that_device() {
    let app = test_app().await;
    let phone = register_leader(&app.server, "two-devices").await;
    let laptop = login(&app.server, &phone.email).await;

    app.server.post("/auth/logout").add_header("cookie", phone.cookie()).await.assert_status_ok();

    app.server
        .post("/auth/refresh")
        .add_header("cookie", laptop.refresh_only())
        .await
        .assert_status_ok();
}

#[tokio::test]
async fn refresh_token_is_not_accepted_as_access_token() {
    let app = test_app().await;
    let session = register_leader(&app.server, "typ").await;

    app.server
        .get("/auth/me")
        .add_header("cookie", format!("hg_access_token={}", session.refresh))
        .await
        .assert_status(StatusCode::UNAUTHORIZED);

    // Old-style refresh JWTs (same secret, empty scope, no typ) must not work either.
    let now = chrono::Utc::now().timestamp();
    let legacy_refresh = encode(
        &Header::default(),
        &json!({
            "sub": session.user_id, "group_id": session.group_id, "role": "leader",
            "scope": [], "iat": now, "exp": now + 7 * 86_400,
        }),
        &EncodingKey::from_secret(app.state.config.jwt_secret.as_bytes()),
    )
    .unwrap();
    app.server
        .get("/auth/me")
        .add_header("cookie", format!("hg_access_token={legacy_refresh}"))
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn forged_or_expired_access_tokens_are_rejected() {
    let app = test_app().await;
    let session = register_leader(&app.server, "forged").await;
    let now = chrono::Utc::now().timestamp();
    let claims = |exp: i64| json!({
        "sub": session.user_id, "group_id": session.group_id, "role": "leader",
        "scope": ["read", "write"], "typ": "access", "iat": now - 3600, "exp": exp,
    });

    let expired = encode(&Header::default(), &claims(now - 60), &EncodingKey::from_secret(app.state.config.jwt_secret.as_bytes())).unwrap();
    let forged = encode(&Header::default(), &claims(now + 600), &EncodingKey::from_secret(b"wrong-secret")).unwrap();

    for token in [expired, forged] {
        app.server
            .get("/games")
            .add_header("cookie", format!("hg_access_token={token}"))
            .await
            .assert_status(StatusCode::UNAUTHORIZED);
    }
}

#[tokio::test]
async fn removed_player_loses_access_immediately() {
    let app = test_app().await;
    let leader = register_leader(&app.server, "removed").await;
    let member = common::add_member(&app.server, &leader, "soon-gone").await;

    app.server.get("/games").add_header("cookie", member.cookie()).await.assert_status_ok();

    app.server
        .delete(&format!("/players/{}", member.user_id))
        .add_header("cookie", leader.cookie())
        .await
        .assert_status(StatusCode::NO_CONTENT);

    app.server.get("/games").add_header("cookie", member.cookie()).await.assert_status(StatusCode::UNAUTHORIZED);
    app.server
        .post("/auth/refresh")
        .add_header("cookie", member.refresh_only())
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn password_change_ends_other_sessions_but_keeps_the_current_one() {
    let app = test_app().await;
    let leader = register_leader(&app.server, "pw-change").await;
    let other_device = login(&app.server, &leader.email).await;

    app.server
        .patch(&format!("/players/{}", leader.user_id))
        .add_header("cookie", leader.cookie())
        .json(&json!({ "password": "new-password-1", "password2": "new-password-1" }))
        .await
        .assert_status(StatusCode::NO_CONTENT);

    app.server
        .post("/auth/refresh")
        .add_header("cookie", other_device.refresh_only())
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
    app.server
        .post("/auth/refresh")
        .add_header("cookie", leader.refresh_only())
        .await
        .assert_status_ok();
}

#[tokio::test]
async fn protected_routes_require_authentication() {
    let app = test_app().await;
    let id = uuid::Uuid::new_v4();

    let requests = vec![
        app.server.get("/auth/me"),
        app.server.get("/players"),
        app.server.post("/players").json(&json!({})),
        app.server.patch(&format!("/players/{id}")).json(&json!({})),
        app.server.delete(&format!("/players/{id}")),
        app.server.get("/games"),
        app.server.post("/games").json(&json!({})),
        app.server.get(&format!("/games/{id}")),
        app.server.delete(&format!("/games/{id}")),
        app.server.post(&format!("/games/{id}/close")),
        app.server.post(&format!("/games/{id}/restart")),
        app.server.get(&format!("/games/{id}/scores")),
        app.server.post(&format!("/games/{id}/scores")).json(&json!({ "scores": [] })),
        app.server.get(&format!("/games/{id}/score-snapshots")),
        app.server.put(&format!("/scores/{id}")).json(&json!({ "value": 1 })),
        app.server.get("/stats"),
        app.server.get("/stats/history"),
        app.server.get(&format!("/games/{id}/share")),
        app.server.post(&format!("/games/{id}/share")),
        app.server.delete(&format!("/games/{id}/share")),
    ];

    for request in requests {
        let response = request.await;
        assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED, "{response:?}");
    }
}
