//! A game remembers which variant it is, starts from that variant's position,
//! and every way of starting a game (single player, rooms, rematches) honours
//! the variant that was asked for.

use actix_web::{test as actix_test, web, App};
use chess_engine::api::{configure_routes, AppState};
use chess_engine::chess960;
use chess_engine::game::GameState;
use chess_engine::multiplayer::{configure_multiplayer_routes, MultiplayerState};
use chess_engine::session::SessionConfig;
use chess_engine::variants::GameVariant;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

const STANDARD_START: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

fn config() -> SessionConfig {
    SessionConfig::new(b"test-secret-that-is-at-least-32-bytes!!".to_vec(), 86_400).unwrap()
}

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

#[test]
fn a_new_game_is_standard() {
    assert_eq!(GameState::new().variant, GameVariant::Standard);
}

#[test]
fn variant_games_start_from_the_variants_position() {
    for v in [
        GameVariant::Standard,
        GameVariant::KingOfTheHill,
        GameVariant::ThreeCheck,
        GameVariant::Atomic,
        GameVariant::Crazyhouse,
    ] {
        let g = GameState::new_variant(v, None);
        assert_eq!(g.variant, v);
        assert_eq!(g.board.to_fen(), STANDARD_START, "{v:?}");
    }

    let g = GameState::new_variant(GameVariant::Chess960, Some(0));
    assert_eq!(g.variant, GameVariant::Chess960);
    let expected = GameState::from_fen(&chess960::generate_position(0).fen).unwrap();
    assert_eq!(g.board.to_fen(), expected.board.to_fen());
    assert_ne!(g.board.to_fen(), STANDARD_START);
}

#[test]
fn every_chess960_position_starts_a_game() {
    for id in 0..960 {
        let g = GameState::new_variant(GameVariant::Chess960, Some(id));
        // All 16 single and double pawn pushes are available in every start.
        let pawn_moves = g
            .get_legal_moves()
            .iter()
            .filter(|m| m.as_bytes()[1] == b'2')
            .count();
        assert!(pawn_moves >= 16, "position {id}");
    }
}

#[test]
fn the_variant_is_saved_and_old_saves_load_as_standard() {
    let g = GameState::new_variant(GameVariant::KingOfTheHill, None);
    let json = serde_json::to_string(&g).unwrap();
    let back: GameState = serde_json::from_str(&json).unwrap();
    assert_eq!(back.variant, GameVariant::KingOfTheHill);

    let mut legacy: Value = serde_json::from_str(&json).unwrap();
    legacy.as_object_mut().unwrap().remove("variant");
    let back: GameState = serde_json::from_value(legacy).unwrap();
    assert_eq!(back.variant, GameVariant::Standard);
}

#[actix_web::test]
async fn single_player_variant_games_report_their_variant() {
    std::env::set_var(
        "GAMES_DIR",
        std::env::temp_dir().join("chess-engine-variant-game-tests"),
    );
    let app = actix_test::init_service(
        App::new()
            .app_data(web::Data::new(AppState {
                games: Mutex::new(HashMap::new()),
            }))
            .app_data(web::Data::new(config()))
            .configure(configure_routes),
    )
    .await;
    let auth = auth();

    for v in [
        "kingofthehill",
        "chess960",
        "threecheck",
        "atomic",
        "crazyhouse",
    ] {
        let req = actix_test::TestRequest::post()
            .uri("/game/new-variant")
            .insert_header(auth.clone())
            .set_json(json!({ "variant": v }))
            .to_request();
        let created: Value = actix_test::call_and_read_body_json(&app, req).await;
        assert_eq!(created["variant"], v);

        let id = created["game_id"].as_str().unwrap();
        let req = actix_test::TestRequest::get()
            .uri(&format!("/game/{id}"))
            .to_request();
        let game: Value = actix_test::call_and_read_body_json(&app, req).await;
        assert_eq!(game["variant"], v);
    }

    let req = actix_test::TestRequest::post()
        .uri("/game/new")
        .insert_header(auth.clone())
        .set_json(json!({}))
        .to_request();
    let created: Value = actix_test::call_and_read_body_json(&app, req).await;
    assert_eq!(created["variant"], "standard");

    let req = actix_test::TestRequest::post()
        .uri("/game/new-variant")
        .insert_header(auth)
        .set_json(json!({ "variant": "bughouse" }))
        .to_request();
    let resp = actix_test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        400,
        "unknown variants must not become standard"
    );
}

#[actix_web::test]
async fn room_and_rematch_games_use_the_rooms_variant() {
    let games = web::Data::new(AppState {
        games: Mutex::new(HashMap::new()),
    });
    let app = actix_test::init_service(
        App::new()
            .app_data(games.clone())
            .app_data(web::Data::new(MultiplayerState::new()))
            .app_data(web::Data::new(config()))
            .configure(configure_multiplayer_routes),
    )
    .await;
    let (host, guest) = (auth(), auth());

    let req = actix_test::TestRequest::post()
        .uri("/multiplayer/room/create")
        .insert_header(host.clone())
        .set_json(json!({ "player_name": "Host", "variant": "kingofthehill" }))
        .to_request();
    let room: Value = actix_test::call_and_read_body_json(&app, req).await;
    let req = actix_test::TestRequest::post()
        .uri("/multiplayer/room/join")
        .insert_header(guest.clone())
        .set_json(json!({ "player_name": "Guest", "room_code": room["room_code"] }))
        .to_request();
    let joined: Value = actix_test::call_and_read_body_json(&app, req).await;
    let game_id = joined["game_id"].as_str().unwrap().to_string();
    assert_eq!(
        games.games.lock().unwrap()[&game_id].variant,
        GameVariant::KingOfTheHill
    );

    let rematch = format!(
        "/multiplayer/room/{}/rematch",
        room["room_id"].as_str().unwrap()
    );
    for who in [host, guest] {
        let req = actix_test::TestRequest::post()
            .uri(&rematch)
            .insert_header(who)
            .to_request();
        actix_test::call_service(&app, req).await;
    }
    let games = games.games.lock().unwrap();
    let rematch_game = games
        .values()
        .find(|g| g.id != game_id)
        .expect("rematch game is registered");
    assert_eq!(rematch_game.variant, GameVariant::KingOfTheHill);
}
