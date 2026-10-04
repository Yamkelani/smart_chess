//! Single-player games belong to the guest session that created them: anyone
//! may read a game by id, but only its owner may change it.

use actix_web::{test, web, App};
use chess_engine::api::{configure_routes, AppState};
use chess_engine::game::GameState;
use chess_engine::session::SessionConfig;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

const SECRET: &[u8] = b"test-secret-that-is-at-least-32-bytes!!";

fn config() -> SessionConfig {
    SessionConfig::new(SECRET.to_vec(), 86_400).unwrap()
}

fn token() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    config().issue(now).token
}

fn bearer(token: &str) -> (&'static str, String) {
    ("Authorization", format!("Bearer {token}"))
}

macro_rules! app {
    ($games:expr) => {{
        // Keep persisted test games out of the working tree.
        std::env::set_var(
            "GAMES_DIR",
            std::env::temp_dir().join("chess-engine-ownership-tests"),
        );
        test::init_service(
            App::new()
                .app_data(web::Data::new(AppState {
                    games: Mutex::new($games),
                }))
                .app_data(web::Data::new(config()))
                .configure(configure_routes),
        )
        .await
    }};
}

/// Create a game as `owner` and return its id.
macro_rules! new_game {
    ($app:expr, $owner:expr) => {{
        let req = test::TestRequest::post()
            .uri("/game/new")
            .insert_header(bearer($owner))
            .set_json(json!({}))
            .to_request();
        let body: Value = test::call_and_read_body_json(&$app, req).await;
        body["game_id"].as_str().unwrap().to_string()
    }};
}

/// Status code of a POST to `uri` with an optional token.
macro_rules! post_status {
    ($app:expr, $uri:expr, $token:expr, $body:expr) => {{
        let mut req = test::TestRequest::post().uri(&$uri).set_json($body);
        if let Some(t) = $token {
            req = req.insert_header(bearer(t));
        }
        test::call_service(&$app, req.to_request())
            .await
            .status()
            .as_u16()
    }};
}

#[actix_web::test]
async fn creating_a_game_requires_a_valid_token() {
    let app = app!(HashMap::new());
    let none: Option<&str> = None;
    assert_eq!(post_status!(app, "/game/new", none, json!({})), 401);
    assert_eq!(
        post_status!(app, "/game/new", Some("v1.forged.9999999999.00"), json!({})),
        401
    );
    assert_eq!(
        post_status!(
            app,
            "/game/new-variant",
            none,
            json!({"variant": "chess960"})
        ),
        401
    );
    let owner = token();
    assert_eq!(post_status!(app, "/game/new", Some(&owner), json!({})), 200);
    assert_eq!(
        post_status!(
            app,
            "/game/new-variant",
            Some(&owner),
            json!({"variant": "chess960"})
        ),
        200
    );
}

#[actix_web::test]
async fn owner_can_change_their_game() {
    let app = app!(HashMap::new());
    let owner = token();
    let id = new_game!(app, &owner);
    let me = Some(owner.as_str());

    assert_eq!(
        post_status!(app, format!("/game/{id}/move"), me, json!({"uci": "e2e4"})),
        200
    );
    assert_eq!(
        post_status!(
            app,
            format!("/game/{id}/engine-move?depth=1"),
            me,
            json!({})
        ),
        200
    );
    assert_eq!(
        post_status!(app, format!("/game/{id}/undo"), me, json!({"moves": 1})),
        200
    );
    assert_eq!(
        post_status!(
            app,
            format!("/game/{id}/set-position"),
            me,
            json!({"fen": "4k3/8/8/8/8/8/8/4K2R w K - 0 1"})
        ),
        200
    );
    assert_eq!(
        post_status!(
            app,
            format!("/game/{id}/resign"),
            me,
            json!({"color": "white"})
        ),
        200
    );
    let id = new_game!(app, &owner);
    assert_eq!(
        post_status!(app, format!("/game/{id}/draw"), me, json!({})),
        200
    );
}

#[actix_web::test]
async fn other_players_cannot_change_a_game() {
    let app = app!(HashMap::new());
    let id = new_game!(app, &token());
    let intruder = token();
    let none: Option<&str> = None;

    for (path, body) in [
        ("move", json!({"uci": "e2e4"})),
        ("engine-move?depth=1", json!({})),
        ("undo", json!({"moves": 1})),
        (
            "set-position",
            json!({"fen": "4k3/8/8/8/8/8/8/4K2R w K - 0 1"}),
        ),
        ("resign", json!({"color": "black"})),
        ("draw", json!({})),
    ] {
        let uri = format!("/game/{id}/{path}");
        assert_eq!(
            post_status!(app, uri, Some(&intruder), body.clone()),
            403,
            "{path} by another player"
        );
        assert_eq!(
            post_status!(app, uri, none, body),
            401,
            "{path} without token"
        );
    }

    // The game is untouched.
    let req = test::TestRequest::get()
        .uri(&format!("/game/{id}"))
        .to_request();
    let game: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(game["move_history"], json!([]));
    assert_eq!(game["status"], "Active");
}

#[actix_web::test]
async fn games_stay_readable_by_id_without_a_token() {
    let app = app!(HashMap::new());
    let id = new_game!(app, &token());
    for uri in [format!("/game/{id}"), format!("/game/{id}/moves")] {
        let req = test::TestRequest::get().uri(&uri).to_request();
        assert_eq!(test::call_service(&app, req).await.status(), 200, "{uri}");
    }
}

#[actix_web::test]
async fn games_without_an_owner_are_read_only() {
    let legacy = GameState::new();
    let id = legacy.id.clone();
    let app = app!(HashMap::from([(id.clone(), legacy)]));

    assert_eq!(
        post_status!(
            app,
            format!("/game/{id}/move"),
            Some(&token()),
            json!({"uci": "e2e4"})
        ),
        403
    );
    let req = test::TestRequest::get()
        .uri(&format!("/game/{id}"))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 200);
}

#[actix_web::test]
async fn unknown_game_is_not_found_for_a_valid_token() {
    let app = app!(HashMap::new());
    assert_eq!(
        post_status!(
            app,
            "/game/no-such-game/move",
            Some(&token()),
            json!({"uci": "e2e4"})
        ),
        404
    );
}

#[actix_web::test]
async fn a_game_started_from_a_custom_position_is_unrated() {
    let app = app!(HashMap::new());
    let owner = token();
    for (body, expected) in [
        (json!({}), false),
        (json!({"fen": "4k3/8/8/8/8/8/QQQQ1QQQ/4K3 w - - 0 1"}), true),
    ] {
        let req = test::TestRequest::post()
            .uri("/game/new")
            .insert_header(bearer(&owner))
            .set_json(body.clone())
            .to_request();
        let created: Value = test::call_and_read_body_json(&app, req).await;
        let id = created["game_id"].as_str().unwrap();
        let req = test::TestRequest::get()
            .uri(&format!("/game/{id}"))
            .to_request();
        let game: Value = test::call_and_read_body_json(&app, req).await;
        assert_eq!(game["is_analysis"], expected, "{body}");
    }
}
