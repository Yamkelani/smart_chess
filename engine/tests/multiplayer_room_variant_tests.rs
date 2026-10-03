//! Room creation and joining must validate player-supplied fields: the
//! variant and player names are stored and shown to every player browsing
//! the lobby.

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

/// `Authorization` header for a fresh guest session.
fn auth() -> (&'static str, String) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    (
        "Authorization",
        format!("Bearer {}", config().issue(now).token),
    )
}

async fn create_room(variant: Option<&str>) -> (u16, Value) {
    create_room_named("Host", variant).await
}

async fn create_room_named(name: &str, variant: Option<&str>) -> (u16, Value) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(AppState {
                games: Mutex::new(HashMap::new()),
            }))
            .app_data(web::Data::new(MultiplayerState::new()))
            .app_data(web::Data::new(config()))
            .configure(configure_multiplayer_routes),
    )
    .await;
    let mut body = json!({ "player_name": name });
    if let Some(v) = variant {
        body["variant"] = json!(v);
    }
    let req = test::TestRequest::post()
        .uri("/multiplayer/room/create")
        .insert_header(auth())
        .set_json(body)
        .to_request();
    let resp = test::call_service(&app, req).await;
    let status = resp.status().as_u16();
    (status, test::read_body_json(resp).await)
}

#[actix_web::test]
async fn unknown_variant_is_rejected() {
    for v in ["<img src=x onerror=alert(1)>", "bughouse", ""] {
        let (status, body) = create_room(Some(v)).await;
        assert_eq!(status, 400, "variant {v:?} should be rejected");
        assert_eq!(body["error"], "Unknown variant");
    }
}

#[actix_web::test]
async fn playable_variant_is_accepted_and_normalised() {
    let (status, body) = create_room(Some(" Standard ")).await;
    assert_eq!(status, 200);
    assert_eq!(body["variant"], "standard");
}

#[actix_web::test]
async fn variants_without_rules_yet_are_refused() {
    // A room must not advertise a variant whose rules the engine does not play.
    for v in [
        "chess960",
        "kingofthehill",
        "threecheck",
        "atomic",
        "crazyhouse",
    ] {
        let (status, body) = create_room(Some(v)).await;
        assert_eq!(status, 400, "variant {v:?} should be refused");
        assert_eq!(body["error"], "Variant not available yet");
    }
}

#[actix_web::test]
async fn missing_variant_defaults_to_standard() {
    let (status, body) = create_room(None).await;
    assert_eq!(status, 200);
    assert_eq!(body["variant"], "standard");
}

#[actix_web::test]
async fn host_name_is_capped_and_cleaned() {
    let (_, body) = create_room_named(&"x".repeat(100), None).await;
    assert_eq!(body["host_name"].as_str().unwrap().chars().count(), 32);

    let (_, body) = create_room_named("  Bo\u{0}b\n  ", None).await;
    assert_eq!(body["host_name"], "Bob");

    let (_, body) = create_room_named("\u{7}\t ", None).await;
    assert_eq!(body["host_name"], "Anonymous");

    // Printable characters are kept; the frontend renders names as text.
    let (_, body) = create_room_named("Tom & Jerry <3", None).await;
    assert_eq!(body["host_name"], "Tom & Jerry <3");
}

#[actix_web::test]
async fn guest_name_is_capped_and_cleaned_on_join() {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(AppState {
                games: Mutex::new(HashMap::new()),
            }))
            .app_data(web::Data::new(MultiplayerState::new()))
            .app_data(web::Data::new(config()))
            .configure(configure_multiplayer_routes),
    )
    .await;
    let req = test::TestRequest::post()
        .uri("/multiplayer/room/create")
        .insert_header(auth())
        .set_json(json!({ "player_name": "Host" }))
        .to_request();
    let created: Value = test::call_and_read_body_json(&app, req).await;

    let long_name = format!("\u{1b}[31m{}", "g".repeat(100));
    let req = test::TestRequest::post()
        .uri("/multiplayer/room/join")
        .insert_header(auth())
        .set_json(json!({
            "player_name": long_name,
            "room_code": created["room_code"],
        }))
        .to_request();
    let joined: Value = test::call_and_read_body_json(&app, req).await;
    let guest = joined["guest_name"].as_str().unwrap();
    assert_eq!(guest.chars().count(), 32);
    assert!(
        !guest.chars().any(char::is_control),
        "control characters must be stripped"
    );
}
