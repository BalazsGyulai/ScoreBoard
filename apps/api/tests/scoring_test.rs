// Scoring end to end: official results on close, round entry, filling gaps,
// undoing a round, and the match history that all statistics are built from.
mod common;

use axum::http::StatusCode;
use common::{add_member, add_round, create_game, register_leader, test_app, Session, TestApp};
use serde_json::{json, Value};
use uuid::Uuid;

async fn create_game_with_rule(app: &TestApp, leader: &Session, name: &str, rule: &str) -> Uuid {
    let response = app
        .server
        .post("/games")
        .add_header("cookie", leader.cookie())
        .json(&json!({ "name": name, "winner_rule": rule, "icon": "🎲" }))
        .await;
    response.assert_status(StatusCode::CREATED);
    response.json::<Value>()["id"].as_str().unwrap().parse().unwrap()
}

async fn close(app: &TestApp, leader: &Session, game: Uuid) -> Value {
    let response = app
        .server
        .post(&format!("/games/{game}/close"))
        .add_header("cookie", leader.cookie())
        .await;
    response.assert_status_ok();
    response.json()
}

fn place_of(results: &Value, user: Uuid) -> i64 {
    results["results"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["user_id"] == user.to_string())
        .map(|r| r["place"].as_i64().unwrap())
        .expect("player in results")
}

async fn history(app: &TestApp, s: &Session) -> Vec<Value> {
    app.server.get("/stats/history").add_header("cookie", s.cookie()).await.json()
}

#[tokio::test]
async fn skipping_a_round_does_not_win_a_min_game() {
    let app = test_app().await;
    let a = register_leader(&app.server, "skip").await;
    let b = add_member(&app.server, &a, "b").await;
    let game = create_game_with_rule(&app, &a, "Skyjo", "min").await;

    add_round(&app.server, &a, game, &[(a.user_id, 5), (b.user_id, 9)]).await.assert_status(StatusCode::CREATED);
    // b skips round 2 — the old rule counted that as 0 points and b won 9 vs 10
    add_round(&app.server, &a, game, &[(a.user_id, 5)]).await.assert_status(StatusCode::CREATED);

    let result = close(&app, &a, game).await;
    assert_eq!(place_of(&result, a.user_id), 1);
    assert_eq!(place_of(&result, b.user_id), 2);
    let rows = result["results"].as_array().unwrap();
    assert_eq!(rows.iter().find(|r| r["user_id"] == b.user_id.to_string()).unwrap()["rounds_played"], 1);
}

#[tokio::test]
async fn ties_share_the_place_in_the_official_result() {
    let app = test_app().await;
    let a = register_leader(&app.server, "tie").await;
    let b = add_member(&app.server, &a, "b").await;
    let c = add_member(&app.server, &a, "c").await;
    let game = create_game(&app.server, &a, "Uno").await; // max
    add_round(&app.server, &a, game, &[(a.user_id, 10), (b.user_id, 10), (c.user_id, 3)])
        .await
        .assert_status(StatusCode::CREATED);

    let result = close(&app, &a, game).await;
    assert_eq!(place_of(&result, a.user_id), 1);
    assert_eq!(place_of(&result, b.user_id), 1);
    assert_eq!(place_of(&result, c.user_id), 3);
}

#[tokio::test]
async fn players_without_scores_are_not_ranked() {
    let app = test_app().await;
    let a = register_leader(&app.server, "noscore").await;
    let idle = add_member(&app.server, &a, "idle").await;
    let game = create_game(&app.server, &a, "Dixit").await;
    add_round(&app.server, &a, game, &[(a.user_id, 3)]).await.assert_status(StatusCode::CREATED);

    let result = close(&app, &a, game).await;
    let ids: Vec<&str> = result["results"].as_array().unwrap().iter().map(|r| r["user_id"].as_str().unwrap()).collect();
    assert_eq!(ids, vec![a.user_id.to_string()]);
    assert!(history(&app, &a).await.iter().all(|r| r["user_id"] != idle.user_id.to_string()));
}

#[tokio::test]
async fn concurrent_round_saves_get_distinct_round_numbers() {
    let app = test_app().await;
    let a = register_leader(&app.server, "race").await;
    let game = create_game(&app.server, &a, "Race").await;

    let s = &app.server;
    let v: Vec<[(Uuid, i32); 1]> = (1..=5).map(|i| [(a.user_id, i)]).collect();
    let (r1, r2, r3, r4, r5) = tokio::join!(
        add_round(s, &a, game, &v[0]),
        add_round(s, &a, game, &v[1]),
        add_round(s, &a, game, &v[2]),
        add_round(s, &a, game, &v[3]),
        add_round(s, &a, game, &v[4]),
    );
    let mut rounds: Vec<i64> = [r1, r2, r3, r4, r5]
        .iter()
        .map(|r| {
            assert_eq!(r.status_code(), StatusCode::CREATED, "{r:?}");
            r.json::<Value>()["round"].as_i64().unwrap()
        })
        .collect();
    rounds.sort();
    assert_eq!(rounds, vec![1, 2, 3, 4, 5]);
}

#[tokio::test]
async fn a_missing_score_can_be_filled_in() {
    let app = test_app().await;
    let a = register_leader(&app.server, "fill").await;
    let b = add_member(&app.server, &a, "b").await;
    let game = create_game(&app.server, &a, "Fill").await;
    add_round(&app.server, &a, game, &[(a.user_id, 4)]).await.assert_status(StatusCode::CREATED);

    let s = &app.server;
    let fill = |round: i32, player: Uuid, value: i32| {
        s.put(&format!("/games/{game}/scores/{round}/{player}"))
            .add_header("cookie", a.cookie())
            .json(&json!({ "value": value }))
    };

    fill(1, b.user_id, 7).await.assert_status_ok();
    fill(1, b.user_id, 8).await.assert_status_ok(); // editing the filled cell
    fill(2, b.user_id, 1).await.assert_status(StatusCode::BAD_REQUEST); // round 2 not played
    fill(1, b.user_id, 5_000_000).await.assert_status(StatusCode::BAD_REQUEST);

    let scores: Vec<Value> = s.get(&format!("/games/{game}/scores")).add_header("cookie", a.cookie()).await.json();
    let b_score = scores.iter().find(|r| r["user_id"] == b.user_id.to_string()).unwrap();
    assert_eq!(b_score["value"], 8);
    assert_eq!(b_score["round"], 1);
}

#[tokio::test]
async fn fill_in_and_undo_are_protected() {
    let app = test_app().await;
    let a = register_leader(&app.server, "fill-authz").await;
    let member = add_member(&app.server, &a, "m").await;
    let game = create_game(&app.server, &a, "Guarded").await;
    add_round(&app.server, &a, game, &[(a.user_id, 4)]).await.assert_status(StatusCode::CREATED);
    let outsider = register_leader(&app.server, "fill-outsider").await;
    let outsider_game = create_game(&app.server, &outsider, "Theirs").await;
    add_round(&app.server, &outsider, outsider_game, &[(outsider.user_id, 1)]).await.assert_status(StatusCode::CREATED);
    let s = &app.server;

    // member: read-only
    s.put(&format!("/games/{game}/scores/1/{}", member.user_id))
        .add_header("cookie", member.cookie())
        .json(&json!({ "value": 1 }))
        .await
        .assert_status(StatusCode::FORBIDDEN);
    s.delete(&format!("/games/{game}/rounds/last")).add_header("cookie", member.cookie()).await.assert_status(StatusCode::FORBIDDEN);

    // another group's leader: not found
    s.put(&format!("/games/{game}/scores/1/{}", outsider.user_id))
        .add_header("cookie", outsider.cookie())
        .json(&json!({ "value": 1 }))
        .await
        .assert_status(StatusCode::NOT_FOUND);
    s.delete(&format!("/games/{game}/rounds/last")).add_header("cookie", outsider.cookie()).await.assert_status(StatusCode::NOT_FOUND);

    // own game, foreign player
    s.put(&format!("/games/{outsider_game}/scores/1/{}", a.user_id))
        .add_header("cookie", outsider.cookie())
        .json(&json!({ "value": 1 }))
        .await
        .assert_status(StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn the_last_round_can_be_undone() {
    let app = test_app().await;
    let a = register_leader(&app.server, "undo").await;
    let game = create_game(&app.server, &a, "Undo").await;
    let s = &app.server;
    let undo = || s.delete(&format!("/games/{game}/rounds/last")).add_header("cookie", a.cookie());

    undo().await.assert_status(StatusCode::CONFLICT); // nothing to undo
    add_round(s, &a, game, &[(a.user_id, 1)]).await.assert_status(StatusCode::CREATED);
    add_round(s, &a, game, &[(a.user_id, 2)]).await.assert_status(StatusCode::CREATED);

    let response = undo().await;
    response.assert_status_ok();
    assert_eq!(response.json::<Value>()["deleted_round"], 2);

    let g: Value = s.get(&format!("/games/{game}")).add_header("cookie", a.cookie()).await.json();
    assert_eq!(g["current_round"], 2, "the next round to play is 2 again");
    let next = add_round(s, &a, game, &[(a.user_id, 9)]).await;
    assert_eq!(next.json::<Value>()["round"], 2);
}

#[tokio::test]
async fn history_keeps_every_match_with_its_own_date() {
    let app = test_app().await;
    let a = register_leader(&app.server, "history").await;
    let b = add_member(&app.server, &a, "b").await;
    let game = create_game_with_rule(&app, &a, "Carcassonne", "min").await;
    let s = &app.server;

    // match 1
    add_round(s, &a, game, &[(a.user_id, 3), (b.user_id, 8)]).await.assert_status(StatusCode::CREATED);
    add_round(s, &a, game, &[(a.user_id, -2), (b.user_id, 1)]).await.assert_status(StatusCode::CREATED);
    close(&app, &a, game).await;

    // pretend match 1 was played on New Year's Eve 2024, 23:30 Budapest time
    sqlx::query("UPDATE game_results SET created_at = '2024-12-31T22:30:00Z' WHERE game_id = $1")
        .bind(game)
        .execute(&app.state.db)
        .await
        .unwrap();

    // restart + match 2: restart sets games.closed_at = NULL, which used to hide match 1
    s.post(&format!("/games/{game}/restart")).add_header("cookie", a.cookie()).await.assert_status_ok();
    add_round(s, &a, game, &[(a.user_id, 9), (b.user_id, 1)]).await.assert_status(StatusCode::CREATED);
    let before_close = history(&app, &a).await;
    assert_eq!(before_close.len(), 2, "match 1 must survive the restart: {before_close:?}");
    close(&app, &a, game).await;

    let rows = history(&app, &a).await;
    assert_eq!(rows.len(), 4);
    let first: Vec<&Value> = rows.iter().filter(|r| r["played_at"].as_str().unwrap().starts_with("2024-12-31")).collect();
    assert_eq!(first.len(), 2, "match 1 keeps its own date, not the latest close: {rows:?}");

    let a1 = first.iter().find(|r| r["user_id"] == a.user_id.to_string()).unwrap();
    assert_eq!(a1["total_score"], 1);
    assert_eq!(a1["rounds_played"], 2);
    assert_eq!(a1["best_round"], -2, "best round of a min game is the lowest");
    assert_eq!(a1["place"], 1);
    assert_eq!(a1["winner_rule"], "min");
    assert_eq!(a1["closed_at"], a1["played_at"]);
}
