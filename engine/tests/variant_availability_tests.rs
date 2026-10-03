//! Only variants whose rules the engine actually plays may be offered or
//! started; the rest are refused rather than silently played as standard.

use actix_web::{test as actix_test, web, App};
use chess_engine::api::{configure_routes, AppState};
use chess_engine::session::SessionConfig;
use chess_engine::variants::{list_variants, GameVariant};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

#[test]
fn only_standard_is_playable_for_now() {
    assert!(GameVariant::Standard.is_playable());
    for v in [
        GameVariant::Chess960,
        GameVariant::KingOfTheHill,
        GameVariant::ThreeCheck,
        GameVariant::Atomic,
        GameVariant::Crazyhouse,
    ] {
        assert!(!v.is_playable(), "{v:?}");
    }
}

#[test]
fn listed_variants_are_exactly_the_playable_ones() {
    let ids: Vec<String> = list_variants().into_iter().map(|v| v.id).collect();
    assert_eq!(ids, ["standard"]);
}

#[actix_web::test]
async fn starting_an_unplayable_variant_game_is_refused() {
    std::env::set_var(
        "GAMES_DIR",
        std::env::temp_dir().join("chess-engine-variant-tests"),
    );
    let config =
        SessionConfig::new(b"test-secret-that-is-at-least-32-bytes!!".to_vec(), 86_400).unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let auth = (
        "Authorization",
        format!("Bearer {}", config.issue(now).token),
    );
    let app = actix_test::init_service(
        App::new()
            .app_data(web::Data::new(AppState {
                games: Mutex::new(HashMap::new()),
            }))
            .app_data(web::Data::new(config))
            .configure(configure_routes),
    )
    .await;

    for v in ["chess960", "kingofthehill", "threecheck"] {
        let req = actix_test::TestRequest::post()
            .uri("/game/new-variant")
            .insert_header(auth.clone())
            .set_json(json!({ "variant": v }))
            .to_request();
        let resp = actix_test::call_service(&app, req).await;
        assert_eq!(resp.status(), 400, "{v}");
        let body: Value = actix_test::read_body_json(resp).await;
        assert_eq!(body["error"], "Variant not available yet");
    }
}
