// Draft scores: saved server-side while typing, readable by the group, writable only
// by the leader, scoped to the current round, cleared when the round is saved —
// and never counted in totals, results, history or the live viewer.
mod common;

use axum::http::StatusCode;
use common::{add_member, add_round, create_game, register_leader, test_app, Session, TestApp};
use serde_json::{json, Value};
use uuid::Uuid;

async fn put_drafts(app: &TestApp, s: &Session, game: Uuid, round: i32, values: Value) -> axum_test::TestResponse {
    app.server
        .put(&format!("/games/{game}/drafts"))
        .add_header("cookie", s.cookie())
        .json(&json!({ "round": round, "values": values }))
        .await
}

async fn get_drafts(app: &TestApp, s: &Session, game: Uuid) -> Value {
    let r = app.server.get(&format!("/games/{game}/drafts")).add_header("cookie", s.cookie()).await;
    r.assert_status_ok();
    r.json()
}

fn draft_values(drafts: &Value) -> Vec<(String, i64)> {
    let mut v: Vec<(String, i64)> = drafts["drafts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| (d["player_id"].as_str().unwrap().to_string(), d["value"].as_i64().unwrap()))
        .collect();
    v.sort();
    v
}

#[tokio::test]
async fn drafts_are_saved_per_round_and_survive_a_reload() {
    let app = test_app().await;
    let a = register_leader(&app.server, "draft").await;
    let b = add_member(&app.server, &a, "b").await;
    let game = create_game(&app.server, &a, "Drafts").await;

    put_drafts(&app, &a, game, 1, json!([{ "player_id": a.user_id, "value": 5 }, { "player_id": b.user_id, "value": -2 }]))
        .await
        .assert_status_ok();
    // a second device / a later edit: update one, clear the other
    put_drafts(&app, &a, game, 1, json!([{ "player_id": a.user_id, "value": 7 }, { "player_id": b.user_id, "value": null }]))
        .await
        .assert_status_ok();

    let drafts = get_drafts(&app, &a, game).await;
    assert_eq!(drafts["round"], 1);
    assert_eq!(draft_values(&drafts), vec![(a.user_id.to_string(), 7)]);

    // members see what is being typed (read-only)
    assert_eq!(draft_values(&get_drafts(&app, &b, game).await), vec![(a.user_id.to_string(), 7)]);
}

#[tokio::test]
async fn drafts_respect_group_authorization() {
    let app = test_app().await;
    let a = register_leader(&app.server, "draft-authz").await;
    let member = add_member(&app.server, &a, "m").await;
    let game = create_game(&app.server, &a, "Guarded drafts").await;
    let outsider = register_leader(&app.server, "draft-outsider").await;
    let outsider_game = create_game(&app.server, &outsider, "Their drafts").await;

    let entry = json!([{ "player_id": a.user_id, "value": 1 }]);
    put_drafts(&app, &member, game, 1, entry.clone()).await.assert_status(StatusCode::FORBIDDEN);
    put_drafts(&app, &outsider, game, 1, entry.clone()).await.assert_status(StatusCode::NOT_FOUND);
    app.server
        .get(&format!("/games/{game}/drafts"))
        .add_header("cookie", outsider.cookie())
        .await
        .assert_status(StatusCode::NOT_FOUND);
    // a player of another group cannot be drafted into your game
    put_drafts(&app, &outsider, outsider_game, 1, entry).await.assert_status(StatusCode::BAD_REQUEST);
    app.server.get(&format!("/games/{game}/drafts")).await.assert_status(StatusCode::UNAUTHORIZED);

    // value range and duplicates
    put_drafts(&app, &a, game, 1, json!([{ "player_id": a.user_id, "value": 5_000_000 }]))
        .await
        .assert_status(StatusCode::BAD_REQUEST);
    put_drafts(&app, &a, game, 1, json!([{ "player_id": a.user_id, "value": 1 }, { "player_id": a.user_id, "value": 2 }]))
        .await
        .assert_status(StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn drafts_for_a_stale_round_or_closed_game_are_rejected() {
    let app = test_app().await;
    let a = register_leader(&app.server, "draft-stale").await;
    let game = create_game(&app.server, &a, "Stale").await;
    add_round(&app.server, &a, game, &[(a.user_id, 1)]).await.assert_status(StatusCode::CREATED);

    // another device already saved round 1: typing for round 1 is stale
    let stale = put_drafts(&app, &a, game, 1, json!([{ "player_id": a.user_id, "value": 3 }])).await;
    stale.assert_status(StatusCode::CONFLICT);
    assert_eq!(stale.json::<Value>()["current_round"], 2);

    app.server.post(&format!("/games/{game}/close")).add_header("cookie", a.cookie()).await.assert_status_ok();
    put_drafts(&app, &a, game, 2, json!([{ "player_id": a.user_id, "value": 3 }]))
        .await
        .assert_status(StatusCode::CONFLICT);
    let drafts = get_drafts(&app, &a, game).await;
    assert!(drafts["round"].is_null());
    assert!(drafts["drafts"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn drafts_never_count_and_are_cleared_on_submit() {
    let app = test_app().await;
    let a = register_leader(&app.server, "draft-count").await;
    let b = add_member(&app.server, &a, "b").await;
    let game = create_game(&app.server, &a, "Counting").await;
    let s = &app.server;

    // only drafts: nothing is a score yet
    put_drafts(&app, &a, game, 1, json!([{ "player_id": a.user_id, "value": 50 }, { "player_id": b.user_id, "value": 99 }]))
        .await
        .assert_status_ok();
    let scores: Vec<Value> = s.get(&format!("/games/{game}/scores")).add_header("cookie", a.cookie()).await.json();
    assert!(scores.is_empty(), "drafts leaked into scores: {scores:?}");
    s.post(&format!("/games/{game}/close"))
        .add_header("cookie", a.cookie())
        .await
        .assert_status(StatusCode::BAD_REQUEST); // "No scores recorded" — drafts are not scores

    let token: String = {
        let r = s.post(&format!("/games/{game}/share")).add_header("cookie", a.cookie()).await;
        r.json::<Value>()["token"].as_str().unwrap().to_string()
    };
    let live: Value = s.get(&format!("/live/{token}/state")).await.json();
    assert!(live["scores"].as_array().unwrap().is_empty(), "drafts leaked to the live viewer");

    // submitting the round (with different numbers) replaces and clears the drafts
    add_round(s, &a, game, &[(a.user_id, 1), (b.user_id, 2)]).await.assert_status(StatusCode::CREATED);
    assert!(draft_values(&get_drafts(&app, &a, game).await).is_empty());

    // a draft for round 2 is not part of the result either
    put_drafts(&app, &a, game, 2, json!([{ "player_id": b.user_id, "value": -500 }])).await.assert_status_ok();
    let result: Value = s.post(&format!("/games/{game}/close")).add_header("cookie", a.cookie()).await.json();
    let totals: Vec<i64> = result["results"].as_array().unwrap().iter().map(|r| r["total_score"].as_i64().unwrap()).collect();
    assert_eq!(totals, vec![2, 1]); // max game: b 2, a 1 — no 50 / 99 / -500
    assert!(draft_values(&get_drafts(&app, &a, game).await).is_empty());

    let history: Vec<Value> = s.get("/stats/history").add_header("cookie", a.cookie()).await.json();
    let hist_totals: Vec<i64> = history.iter().map(|r| r["total_score"].as_i64().unwrap()).collect();
    assert!(hist_totals.iter().all(|t| [1, 2].contains(t)), "drafts leaked into history: {hist_totals:?}");
}

#[tokio::test]
async fn undo_and_restart_clear_drafts() {
    let app = test_app().await;
    let a = register_leader(&app.server, "draft-undo").await;
    let game = create_game(&app.server, &a, "Undo drafts").await;
    let s = &app.server;

    add_round(s, &a, game, &[(a.user_id, 1)]).await.assert_status(StatusCode::CREATED);
    put_drafts(&app, &a, game, 2, json!([{ "player_id": a.user_id, "value": 8 }])).await.assert_status_ok();
    s.delete(&format!("/games/{game}/rounds/last")).add_header("cookie", a.cookie()).await.assert_status_ok();
    // round 2's drafts must not reappear when round 2 comes around again
    add_round(s, &a, game, &[(a.user_id, 1)]).await.assert_status(StatusCode::CREATED);
    assert!(draft_values(&get_drafts(&app, &a, game).await).is_empty());

    put_drafts(&app, &a, game, 2, json!([{ "player_id": a.user_id, "value": 8 }])).await.assert_status_ok();
    s.post(&format!("/games/{game}/close")).add_header("cookie", a.cookie()).await.assert_status_ok();
    s.post(&format!("/games/{game}/restart")).add_header("cookie", a.cookie()).await.assert_status_ok();
    assert!(draft_values(&get_drafts(&app, &a, game).await).is_empty());
}
