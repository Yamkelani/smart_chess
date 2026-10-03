//! Room seats belong to session tokens: a player is whoever their token says,
//! never the player id a request body claims.

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

/// POST `body` to `uri` with an optional token; returns (status, json body).
macro_rules! post {
    ($app:expr, $uri:expr, $token:expr, $body:expr) => {{
        let mut req = test::TestRequest::post().uri(&$uri).set_json($body);
        let token: Option<&String> = $token;
        if let Some(t) = token {
            req = req.insert_header(("Authorization", format!("Bearer {t}")));
        }
        let resp = test::call_service(&$app, req.to_request()).await;
        let status = resp.status().as_u16();
        let body: Value = test::read_body_json(resp).await;
        (status, body)
    }};
}

/// Host (white) creates a room and guest joins it; returns the room id.
macro_rules! seated_room {
    ($app:expr, $host:expr, $guest:expr) => {{
        let (status, room) = post!(
            $app,
            "/multiplayer/room/create",
            Some($host),
            json!({"player_name": "Host", "host_color": "white"})
        );
        assert_eq!(status, 200);
        let (status, _) = post!(
            $app,
            "/multiplayer/room/join",
            Some($guest),
            json!({"player_name": "Guest", "room_code": room["room_code"]})
        );
        assert_eq!(status, 200);
        room["room_id"].as_str().unwrap().to_string()
    }};
}

#[actix_web::test]
async fn room_actions_require_a_token() {
    let app = app!();
    let (_, host) = session();
    let (_, guest) = session();
    let room = seated_room!(app, &host, &guest);

    assert_eq!(
        post!(
            app,
            "/multiplayer/room/create",
            None,
            json!({"player_name": "X"})
        )
        .0,
        401
    );
    for (path, body) in [
        ("move", json!({"uci": "e2e4"})),
        (
            "chat",
            json!({"sender_name": "X", "content": {"type": "text", "text": "hi"}}),
        ),
        ("spectate", json!({"spectator_name": "X"})),
        ("rematch", json!({})),
        ("leave", json!({})),
    ] {
        let uri = format!("/multiplayer/room/{room}/{path}");
        assert_eq!(post!(app, uri, None, body).0, 401, "{path}");
    }
}

#[actix_web::test]
async fn claiming_another_players_id_in_the_body_does_not_seat_you() {
    let app = app!();
    let (host_id, host) = session();
    let (_, guest) = session();
    let (_, intruder) = session();
    let room = seated_room!(app, &host, &guest);
    let uri = format!("/multiplayer/room/{room}/move");

    // White to move. The intruder claims to be the host; the guest (black)
    // claims the same. Both are judged by their own tokens.
    let (status, body) = post!(
        app,
        uri,
        Some(&intruder),
        json!({"player_id": host_id, "uci": "e2e4"})
    );
    assert_eq!(status, 403);
    assert_eq!(body["error"], "You are not a player in this room");
    let (status, body) = post!(
        app,
        uri,
        Some(&guest),
        json!({"player_id": host_id, "uci": "e2e4"})
    );
    assert_eq!(status, 403);
    assert_eq!(body["error"], "Not your turn");

    assert_eq!(post!(app, uri, Some(&host), json!({"uci": "e2e4"})).0, 200);
    assert_eq!(post!(app, uri, Some(&guest), json!({"uci": "e7e5"})).0, 200);
}

#[actix_web::test]
async fn host_cannot_join_their_own_room_under_another_id() {
    let app = app!();
    let (_, host) = session();
    let (_, room) = post!(
        app,
        "/multiplayer/room/create",
        Some(&host),
        json!({"player_name": "Host"})
    );
    let (status, body) = post!(
        app,
        "/multiplayer/room/join",
        Some(&host),
        json!({"player_id": "someone-else", "player_name": "Alt", "room_code": room["room_code"]})
    );
    assert_eq!(status, 400);
    assert_eq!(body["error"], "Cannot join your own room");
}

#[actix_web::test]
async fn only_seated_players_can_leave_or_request_a_rematch() {
    let app = app!();
    let (host_id, host) = session();
    let (_, guest) = session();
    let (_, intruder) = session();
    let room = seated_room!(app, &host, &guest);

    for path in ["rematch", "leave"] {
        let uri = format!("/multiplayer/room/{room}/{path}");
        let (status, _) = post!(app, uri, Some(&intruder), json!({"player_id": host_id}));
        assert_eq!(status, 403, "{path} by a non-player");
    }

    // The room is still being played.
    let (_, poll) = post!(
        app,
        format!("/multiplayer/room/{room}/poll"),
        None,
        json!({})
    );
    assert_eq!(poll["status"], "Playing");
    assert_eq!(poll["rematch_requested_by"], Value::Null);

    let uri = format!("/multiplayer/room/{room}/leave");
    assert_eq!(post!(app, uri, Some(&guest), json!({})).0, 200);
}

#[actix_web::test]
async fn chat_sender_comes_from_the_token() {
    let app = app!();
    let (host_id, host) = session();
    let (guest_id, guest) = session();
    let room = seated_room!(app, &host, &guest);

    let (status, msg) = post!(
        app,
        format!("/multiplayer/room/{room}/chat"),
        Some(&guest),
        json!({
            "sender_id": host_id,
            "sender_name": "Guest",
            "content": {"type": "text", "text": "hi"}
        })
    );
    assert_eq!(status, 200);
    assert_eq!(msg["sender_id"], guest_id);
}

#[actix_web::test]
async fn poll_reports_your_turn_only_to_the_seated_token() {
    let app = app!();
    let (host_id, host) = session();
    let (_, guest) = session();
    let room = seated_room!(app, &host, &guest);
    let uri = format!("/multiplayer/room/{room}/poll");

    assert_eq!(post!(app, uri, Some(&host), json!({})).1["your_turn"], true);
    assert_eq!(
        post!(app, uri, Some(&guest), json!({})).1["your_turn"],
        false
    );
    // Watching needs no token, and a claimed id in the body counts for nothing.
    let (status, poll) = post!(app, uri, None, json!({"player_id": host_id}));
    assert_eq!(status, 200);
    assert_eq!(poll["your_turn"], false);
}
