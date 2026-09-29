//! Room creation must only accept known variants: the variant string is
//! stored and shown to every player browsing the lobby.

use actix_web::{test, web, App};
use chess_engine::api::AppState;
use chess_engine::multiplayer::{configure_multiplayer_routes, MultiplayerState};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

async fn create_room(variant: Option<&str>) -> (u16, Value) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(AppState {
                games: Mutex::new(HashMap::new()),
            }))
            .app_data(web::Data::new(MultiplayerState::new()))
            .configure(configure_multiplayer_routes),
    )
    .await;
    let mut body = json!({ "player_id": "p1", "player_name": "Host" });
    if let Some(v) = variant {
        body["variant"] = json!(v);
    }
    let req = test::TestRequest::post()
        .uri("/multiplayer/room/create")
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
async fn known_variants_are_accepted_and_normalised() {
    let (status, body) = create_room(Some(" Chess960 ")).await;
    assert_eq!(status, 200);
    assert_eq!(body["variant"], "chess960");

    for v in ["standard", "kingofthehill", "threecheck"] {
        let (status, body) = create_room(Some(v)).await;
        assert_eq!(status, 200, "variant {v:?} should be accepted");
        assert_eq!(body["variant"], v);
    }
}

#[actix_web::test]
async fn missing_variant_defaults_to_standard() {
    let (status, body) = create_room(None).await;
    assert_eq!(status, 200);
    assert_eq!(body["variant"], "standard");
}
