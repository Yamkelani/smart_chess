//! Room chat is stored in memory and shown to everyone in the room, so who may
//! post, and how much, must be bounded.

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

fn token() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    config().issue(now).token
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

/// POST `body` to `uri` as `token`; returns (status, json body).
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

/// Create a room as `host` and return its id.
macro_rules! room {
    ($app:expr, $host:expr) => {{
        let (_, room) = post!(
            $app,
            "/multiplayer/room/create",
            $host,
            json!({"player_name": "Host"})
        );
        room["room_id"].as_str().unwrap().to_string()
    }};
}

fn text(name: &str, text: &str) -> Value {
    json!({"sender_name": name, "content": {"type": "text", "text": text}})
}

#[actix_web::test]
async fn only_players_and_spectators_can_chat() {
    let app = app!();
    let host = token();
    let room = room!(app, &host);
    let chat = format!("/multiplayer/room/{room}/chat");

    let outsider = token();
    let (status, body) = post!(app, chat, &outsider, text("Outsider", "hi"));
    assert_eq!(status, 403);
    assert_eq!(body["error"], "You are not in this room");

    assert_eq!(post!(app, chat, &host, text("Host", "hi")).0, 200);

    let watcher = token();
    let spectate = format!("/multiplayer/room/{room}/spectate");
    assert_eq!(
        post!(app, spectate, &watcher, json!({"spectator_name": "W"})).0,
        200
    );
    assert_eq!(post!(app, chat, &watcher, text("W", "hi")).0, 200);
}

#[actix_web::test]
async fn chat_text_must_be_non_empty_and_bounded() {
    let app = app!();
    let host = token();
    let room = room!(app, &host);
    let chat = format!("/multiplayer/room/{room}/chat");

    for bad in ["", "   ", &"x".repeat(501)] {
        let (status, _) = post!(app, chat, &host, text("Host", bad));
        assert_eq!(status, 400, "text of {} chars", bad.len());
    }
    let (status, msg) = post!(app, chat, &host, text("Host", &"é".repeat(500)));
    assert_eq!(
        status, 200,
        "500 characters is allowed, whatever their byte length"
    );
    assert_eq!(
        msg["content"]["text"].as_str().unwrap().chars().count(),
        500
    );

    let long_emote =
        json!({"sender_name": "Host", "content": {"type": "emote", "emote": "x".repeat(33)}});
    assert_eq!(post!(app, chat, &host, long_emote).0, 400);
    let emote = json!({"sender_name": "Host", "content": {"type": "emote", "emote": "gg"}});
    assert_eq!(post!(app, chat, &host, emote).0, 200);
}

#[actix_web::test]
async fn chat_and_spectator_names_are_cleaned() {
    let app = app!();
    let host = token();
    let room = room!(app, &host);

    let (_, msg) = post!(
        app,
        format!("/multiplayer/room/{room}/chat"),
        &host,
        text(&format!("\u{1b}[31m{}", "n".repeat(100)), "hi")
    );
    let name = msg["sender_name"].as_str().unwrap();
    assert_eq!(name.chars().count(), 32);
    assert!(!name.chars().any(char::is_control));

    let watcher = token();
    post!(
        app,
        format!("/multiplayer/room/{room}/spectate"),
        &watcher,
        json!({"spectator_name": "\u{7}\t "})
    );
    let (_, msg) = post!(
        app,
        format!("/multiplayer/room/{room}/chat"),
        &watcher,
        text("  W\u{0}  ", "hi")
    );
    assert_eq!(msg["sender_name"], "W");
}

#[actix_web::test]
async fn a_room_keeps_a_bounded_number_of_messages() {
    let app = app!();
    let host = token();
    let room = room!(app, &host);
    let chat = format!("/multiplayer/room/{room}/chat");

    for i in 0..200 {
        let (status, _) = post!(app, chat, &host, text("Host", &i.to_string()));
        assert_eq!(status, 200, "message {i}");
    }
    let (status, body) = post!(app, chat, &host, text("Host", "one too many"));
    assert_eq!(status, 429);
    assert_eq!(body["error"], "This room's chat is full");
}
