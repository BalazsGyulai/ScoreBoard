// Authorization: a user of one group must not be able to read or change another
// group's games, scores, players or share links by guessing ids, members must not
// be able to do leader-only writes, and the public share link must expose only that
// one game, read-only.
mod common;

use axum::http::StatusCode;
use common::{add_member, add_round, create_game, register_leader, test_app, Session, TestApp};
use serde_json::{json, Value};
use uuid::Uuid;

/// Group A with a game that has one round of scores, plus an outsider leader of group B.
struct World {
    app: TestApp,
    a_leader: Session,
    a_member: Session,
    a_game: Uuid,
    a_score: Uuid,
    b_leader: Session,
    b_game: Uuid,
}

async fn world() -> World {
    let app = test_app().await;
    let a_leader = register_leader(&app.server, "group-a").await;
    let a_member = add_member(&app.server, &a_leader, "a-member").await;
    let a_game = create_game(&app.server, &a_leader, "Secret A game").await;
    add_round(&app.server, &a_leader, a_game, &[(a_leader.user_id, 10), (a_member.user_id, 20)])
        .await
        .assert_status(StatusCode::CREATED);

    let scores: Vec<Value> = app
        .server
        .get(&format!("/games/{a_game}/scores"))
        .add_header("cookie", a_leader.cookie())
        .await
        .json();
    let a_score = scores[0]["id"].as_str().unwrap().parse().unwrap();

    let b_leader = register_leader(&app.server, "group-b").await;
    let b_game = create_game(&app.server, &b_leader, "B game").await;

    World { app, a_leader, a_member, a_game, a_score, b_leader, b_game }
}

fn ids(list: &Value) -> Vec<String> {
    list.as_array().unwrap().iter().map(|v| v["id"].as_str().unwrap().to_string()).collect()
}

#[tokio::test]
async fn outsider_cannot_read_another_groups_game_or_scores() {
    let w = world().await;
    let s = &w.app.server;
    let b = w.b_leader.cookie();

    for path in [
        format!("/games/{}", w.a_game),
        format!("/games/{}/scores", w.a_game),
        format!("/games/{}/score-snapshots", w.a_game),
    ] {
        let response = s.get(&path).add_header("cookie", b.clone()).await;
        assert_eq!(response.status_code(), StatusCode::NOT_FOUND, "GET {path}");
    }

    // Lists are scoped to the caller's group.
    let games: Value = s.get("/games").add_header("cookie", b.clone()).await.json();
    assert_eq!(ids(&games), vec![w.b_game.to_string()]);

    let players: Value = s.get("/players").add_header("cookie", b.clone()).await.json();
    assert_eq!(ids(&players), vec![w.b_leader.user_id.to_string()]);

    let stats: Value = s.get("/stats").add_header("cookie", b.clone()).await.json();
    assert_eq!(ids(&stats), vec![w.b_leader.user_id.to_string()]);

    let history: Value = s.get("/stats/history").add_header("cookie", b.clone()).await.json();
    assert!(history.as_array().unwrap().iter().all(|r| r["game_id"] != w.a_game.to_string()));
}

#[tokio::test]
async fn outsider_cannot_change_another_groups_game() {
    let w = world().await;
    let s = &w.app.server;
    let b = w.b_leader.cookie();

    let attempts = vec![
        ("DELETE game", s.delete(&format!("/games/{}", w.a_game))),
        ("close", s.post(&format!("/games/{}/close", w.a_game))),
        ("restart", s.post(&format!("/games/{}/restart", w.a_game))),
        (
            "add round",
            s.post(&format!("/games/{}/scores", w.a_game))
                .json(&json!({ "scores": [{ "player_id": w.b_leader.user_id, "value": 1 }] })),
        ),
        ("edit score", s.put(&format!("/scores/{}", w.a_score)).json(&json!({ "value": 999 }))),
    ];
    for (name, request) in attempts {
        let response = request.add_header("cookie", b.clone()).await;
        assert_eq!(response.status_code(), StatusCode::NOT_FOUND, "{name}");
    }

    // Nothing changed for group A.
    let scores: Vec<Value> = s
        .get(&format!("/games/{}/scores", w.a_game))
        .add_header("cookie", w.a_leader.cookie())
        .await
        .json();
    assert_eq!(scores.len(), 2);
    assert!(scores.iter().all(|r| r["value"] != 999));
    let game: Value = s.get(&format!("/games/{}", w.a_game)).add_header("cookie", w.a_leader.cookie()).await.json();
    assert_eq!(game["status"], "open");
}

#[tokio::test]
async fn outsider_cannot_edit_or_remove_another_groups_players() {
    let w = world().await;
    let s = &w.app.server;
    let b = w.b_leader.cookie();

    s.patch(&format!("/players/{}", w.a_member.user_id))
        .add_header("cookie", b.clone())
        .json(&json!({ "email": "hijacked@test.com" }))
        .await
        .assert_status(StatusCode::NOT_FOUND);
    s.delete(&format!("/players/{}", w.a_member.user_id))
        .add_header("cookie", b.clone())
        .await
        .assert_status(StatusCode::NOT_FOUND);

    // The member can still log in with the original email.
    common::login(s, &w.a_member.email).await;
}

#[tokio::test]
async fn leader_cannot_put_scores_on_players_of_another_group() {
    let w = world().await;
    let response = add_round(&w.app.server, &w.b_leader, w.b_game, &[(w.a_member.user_id, 5)]).await;
    response.assert_status(StatusCode::BAD_REQUEST);

    let scores: Vec<Value> = w
        .app
        .server
        .get(&format!("/games/{}/scores", w.b_game))
        .add_header("cookie", w.b_leader.cookie())
        .await
        .json();
    assert!(scores.is_empty(), "foreign player's username must not leak into group B");
}

#[tokio::test]
async fn round_is_rejected_on_a_closed_game_and_for_duplicate_players() {
    let w = world().await;
    let s = &w.app.server;

    add_round(s, &w.a_leader, w.a_game, &[(w.a_leader.user_id, 1), (w.a_leader.user_id, 2)])
        .await
        .assert_status(StatusCode::BAD_REQUEST);

    s.post(&format!("/games/{}/close", w.a_game))
        .add_header("cookie", w.a_leader.cookie())
        .await
        .assert_status_ok();
    add_round(s, &w.a_leader, w.a_game, &[(w.a_leader.user_id, 1)])
        .await
        .assert_status(StatusCode::CONFLICT);
}

#[tokio::test]
async fn member_can_read_but_not_do_leader_writes() {
    let w = world().await;
    let s = &w.app.server;
    let m = w.a_member.cookie();

    s.get(&format!("/games/{}/scores", w.a_game)).add_header("cookie", m.clone()).await.assert_status_ok();

    let attempts = vec![
        ("create game", s.post("/games").json(&json!({ "name": "x", "winner_rule": "max", "icon": "🎲" }))),
        ("delete game", s.delete(&format!("/games/{}", w.a_game))),
        ("close", s.post(&format!("/games/{}/close", w.a_game))),
        ("restart", s.post(&format!("/games/{}/restart", w.a_game))),
        (
            "add round",
            s.post(&format!("/games/{}/scores", w.a_game))
                .json(&json!({ "scores": [{ "player_id": w.a_member.user_id, "value": -100 }] })),
        ),
        ("edit score", s.put(&format!("/scores/{}", w.a_score)).json(&json!({ "value": 0 }))),
        (
            "add player",
            s.post("/players").json(&json!({ "username": "x", "email": "x@test.com", "password": "password123" })),
        ),
        ("remove player", s.delete(&format!("/players/{}", w.a_leader.user_id))),
        ("edit other player", s.patch(&format!("/players/{}", w.a_leader.user_id)).json(&json!({ "email": "x@test.com" }))),
        ("share", s.post(&format!("/games/{}/share", w.a_game))),
        ("unshare", s.delete(&format!("/games/{}/share", w.a_game))),
    ];
    for (name, request) in attempts {
        let response = request.add_header("cookie", m.clone()).await;
        assert_eq!(response.status_code(), StatusCode::FORBIDDEN, "{name}");
    }

    // Editing their own account is allowed.
    s.patch(&format!("/players/{}", w.a_member.user_id))
        .add_header("cookie", m)
        .json(&json!({ "email": common::unique_email("member-new") }))
        .await
        .assert_status(StatusCode::NO_CONTENT);
}

async fn share(w: &World) -> String {
    let response = w
        .app
        .server
        .post(&format!("/games/{}/share", w.a_game))
        .add_header("cookie", w.a_leader.cookie())
        .await;
    response.assert_status_ok();
    response.json::<Value>()["token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn outsider_cannot_see_create_or_revoke_another_groups_share_link() {
    let w = world().await;
    let s = &w.app.server;
    let token = share(&w).await;
    let b = w.b_leader.cookie();

    let status: Value = s.get(&format!("/games/{}/share", w.a_game)).add_header("cookie", b.clone()).await.json();
    assert_eq!(status["sharing"], false);
    assert!(status["token"].is_null(), "share token leaked to another group");

    s.post(&format!("/games/{}/share", w.a_game)).add_header("cookie", b.clone()).await.assert_status(StatusCode::NOT_FOUND);
    s.delete(&format!("/games/{}/share", w.a_game)).add_header("cookie", b).await.assert_status(StatusCode::NOT_FOUND);

    // The original link still works.
    s.get(&format!("/live/{token}/state")).await.assert_status_ok();
}

#[tokio::test]
async fn share_link_exposes_only_that_game_read_only() {
    let w = world().await;
    let s = &w.app.server;
    // A second member who never played this game, and a second game.
    let bystander = add_member(s, &w.a_leader, "bystander").await;
    let other_game = create_game(s, &w.a_leader, "Other A game").await;
    add_round(s, &w.a_leader, other_game, &[(bystander.user_id, 77)]).await.assert_status(StatusCode::CREATED);

    let token = share(&w).await;
    let state: Value = s.get(&format!("/live/{token}/state")).await.json();

    assert_eq!(state["game"]["id"], w.a_game.to_string());
    let player_ids = ids(&state["players"]);
    assert_eq!(player_ids.len(), 2);
    assert!(!player_ids.contains(&bystander.user_id.to_string()), "non-participant exposed");
    let body = state.to_string();
    assert!(!body.contains("@test.com"), "emails must not be exposed");
    assert!(!body.contains(&w.a_leader.group_id.to_string()), "group id must not be exposed");
    assert!(state["scores"].as_array().unwrap().iter().all(|r| r["value"] != 77));

    // The token is not a login: it does not open any authenticated endpoint.
    for path in ["/games".to_string(), format!("/games/{}/scores", w.a_game), "/players".to_string()] {
        let response = s.get(&path).add_header("cookie", format!("hg_access_token={token}")).await;
        assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED, "{path}");
    }
    // There are no write routes under /live.
    let write = s.post(&format!("/live/{token}/state")).json(&json!({})).await;
    assert_eq!(write.status_code(), StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn share_link_shows_final_scores_after_close_and_dies_when_unshared() {
    let w = world().await;
    let s = &w.app.server;
    let token = share(&w).await;

    s.post(&format!("/games/{}/close", w.a_game))
        .add_header("cookie", w.a_leader.cookie())
        .await
        .assert_status_ok();

    let state: Value = s.get(&format!("/live/{token}/state")).await.json();
    assert_eq!(state["game"]["status"], "closed");
    assert_eq!(state["scores"].as_array().unwrap().len(), 2, "closed game should show its final round scores");

    s.delete(&format!("/games/{}/share", w.a_game))
        .add_header("cookie", w.a_leader.cookie())
        .await
        .assert_status(StatusCode::NO_CONTENT);
    s.get(&format!("/live/{token}/state")).await.assert_status(StatusCode::NOT_FOUND);
    s.get(&format!("/live/{token}/stream")).await.assert_status(StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn unknown_share_token_is_rejected() {
    let app = test_app().await;
    app.server.get("/live/not-a-token/state").await.assert_status(StatusCode::NOT_FOUND);
    app.server.get("/live/not-a-token/stream").await.assert_status(StatusCode::NOT_FOUND);
}
