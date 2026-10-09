//! The leaderboard is updated by the engine from room games it saw finish,
//! never from results a client reports.

use actix_web::{test, web, App};
use chess_engine::api::AppState;
use chess_engine::multiplayer::{configure_multiplayer_routes, MultiplayerState};
use chess_engine::session::SessionConfig;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

fn config() -> SessionConfig {
    SessionConfig::new(b"test-secret-that-is-at-least-32-bytes!!".to_vec(), 86_400).unwrap()
}

/// A fresh guest session: (player_id, token).
fn session() -> (String, String) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let s = config().issue(now);
    (s.player_id, s.token)
}

macro_rules! app {
    () => {
        test::init_service(
            App::new()
                .app_data(web::Data::new(AppState {
                    games: Mutex::new(HashMap::new()),
                }))
                .app_data(web::Data::new(MultiplayerState::new()))
                .app_data(web::Data::new(config()))
                .configure(configure_multiplayer_routes),
        )
        .await
    };
}

macro_rules! post {
    ($app:expr, $uri:expr, $token:expr, $body:expr) => {{
        let req = test::TestRequest::post()
            .uri(&$uri)
            .insert_header(("Authorization", format!("Bearer {}", $token)))
            .set_json($body)
            .to_request();
        let resp = test::call_service(&$app, req).await;
        let status = resp.status().as_u16();
        let body: Value = test::read_body_json(resp).await;
        (status, body)
    }};
}

macro_rules! leaderboard {
    ($app:expr) => {{
        let req = test::TestRequest::get().uri("/leaderboard").to_request();
        let rows: Value = test::call_and_read_body_json(&$app, req).await;
        rows.as_array().unwrap().clone()
    }};
}

/// Host (white, "Alice") and guest (black, "Bob") in a room of `variant`.
macro_rules! room {
    ($app:expr, $host:expr, $guest:expr, $variant:expr) => {{
        let (_, room) = post!(
            $app,
            "/multiplayer/room/create",
            $host,
            json!({"player_name": "Alice", "host_color": "white", "variant": $variant})
        );
        post!(
            $app,
            "/multiplayer/room/join",
            $guest,
            json!({"player_name": "Bob", "room_code": room["room_code"]})
        );
        room["room_id"].as_str().unwrap().to_string()
    }};
}

/// Fool's mate: black wins. Moves alternate host (white) and guest (black).
macro_rules! fools_mate {
    ($app:expr, $room:expr, $host:expr, $guest:expr) => {{
        let uri = format!("/multiplayer/room/{}/move", $room);
        for (who, uci) in [
            ($host, "f2f3"),
            ($guest, "e7e5"),
            ($host, "g2g4"),
            ($guest, "d8h4"),
        ] {
            let (status, body) = post!($app, uri, who, json!({ "uci": uci }));
            assert_eq!(status, 200, "{uci}: {body}");
        }
    }};
}

fn row<'a>(rows: &'a [Value], player_id: &str) -> &'a Value {
    rows.iter()
        .find(|r| r["player_id"] == player_id)
        .unwrap_or_else(|| panic!("{player_id} missing from {rows:?}"))
}

#[actix_web::test]
async fn clients_cannot_report_results() {
    let app = app!();
    let (id, token) = session();
    let (status, _) = {
        let req = test::TestRequest::post()
            .uri("/leaderboard/update")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .set_json(json!({"player_id": id, "player_name": "Me", "result": "win"}))
            .to_request();
        let resp = test::call_service(&app, req).await;
        (resp.status().as_u16(), ())
    };
    assert_eq!(status, 404);
    assert!(leaderboard!(app).is_empty());
}

#[actix_web::test]
async fn a_finished_room_game_updates_both_players() {
    let app = app!();
    let (alice, host) = session();
    let (bob, guest) = session();
    let room = room!(app, &host, &guest, "standard");
    assert!(leaderboard!(app).is_empty(), "nothing before the game ends");

    fools_mate!(app, room, &host, &guest);

    let rows = leaderboard!(app);
    assert_eq!(rows.len(), 2);
    let (a, b) = (row(&rows, &alice), row(&rows, &bob));
    assert_eq!(a["player_name"], "Alice");
    assert_eq!(b["player_name"], "Bob");
    assert_eq!(
        (a["losses"].as_u64(), a["games_played"].as_u64()),
        (Some(1), Some(1))
    );
    assert_eq!(
        (b["wins"].as_u64(), b["games_played"].as_u64()),
        (Some(1), Some(1))
    );
    // Equal ratings: the winner gains what the loser drops (K = 24).
    assert_eq!(b["rating"], 1212);
    assert_eq!(a["rating"], 1188);
    // Sorted best first.
    assert_eq!(rows[0]["player_id"], bob);
}

#[actix_web::test]
async fn each_finished_game_counts_once_including_rematches() {
    let app = app!();
    let (alice, host) = session();
    let (bob, guest) = session();
    let room = room!(app, &host, &guest, "standard");
    fools_mate!(app, room, &host, &guest);

    // Polling a finished game must not count it again.
    for t in [&host, &guest] {
        post!(app, format!("/multiplayer/room/{room}/poll"), t, json!({}));
    }
    assert_eq!(row(&leaderboard!(app), &bob)["games_played"], 1);

    // Rematch: colours swap, so Bob (now white) is mated by Alice.
    let rematch = format!("/multiplayer/room/{room}/rematch");
    post!(app, rematch, &host, json!({}));
    post!(app, rematch, &guest, json!({}));
    fools_mate!(app, room, &guest, &host);

    let rows = leaderboard!(app);
    let (a, b) = (row(&rows, &alice), row(&rows, &bob));
    assert_eq!(
        (a["wins"].as_u64(), a["losses"].as_u64()),
        (Some(1), Some(1))
    );
    assert_eq!(
        (b["wins"].as_u64(), b["losses"].as_u64()),
        (Some(1), Some(1))
    );
    assert_eq!(a["games_played"], 2);
}

#[actix_web::test]
async fn variant_games_are_not_rated() {
    let app = app!();
    let (_, host) = session();
    let (_, guest) = session();
    // Fool's mate is checkmate in King of the Hill too.
    let room = room!(app, &host, &guest, "kingofthehill");
    fools_mate!(app, room, &host, &guest);
    let (_, poll) = post!(
        app,
        format!("/multiplayer/room/{room}/poll"),
        &host,
        json!({})
    );
    assert_eq!(poll["status"], "Finished");
    assert!(leaderboard!(app).is_empty());
}
