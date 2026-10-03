//! King of the Hill and Three-Check: the games end by their own rules, the
//! check count survives undo and saving, and the engine's search plays to
//! those rules rather than to standard chess.

use actix_web::{test as actix_test, web, App};
use chess_engine::api::{configure_routes, AppState};
use chess_engine::evaluation::{search_best_move_timed, search_best_move_with_rules};
use chess_engine::game::{GameState, GameStatus};
use chess_engine::moves::make_move;
use chess_engine::session::SessionConfig;
use chess_engine::variants::GameVariant;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

/// A position in `variant` with history starting from `fen`.
fn game(variant: GameVariant, fen: &str) -> GameState {
    let mut g = GameState::from_fen(fen).unwrap();
    g.variant = variant;
    g
}

fn play(g: &mut GameState, moves: &[&str]) {
    for m in moves {
        g.make_move(m).unwrap_or_else(|e| panic!("{m}: {e}"));
    }
}

/// Square name a move lands on, e.g. "e2e4" -> "e4".
fn destination(uci: &str) -> &str {
    &uci[2..4]
}

// ── King of the Hill ──

const KING_NEAR_HILL: &str = "4k3/8/8/8/8/4K3/8/7R w - - 0 1";

#[test]
fn reaching_the_centre_wins_king_of_the_hill() {
    for to in ["e3e4", "e3d4"] {
        let mut g = game(GameVariant::KingOfTheHill, KING_NEAR_HILL);
        play(&mut g, &[to]);
        assert_eq!(g.status, GameStatus::VariantWin("white".into()), "{to}");
        assert_eq!(g.status.winner(), Some("white"));
        assert!(g.status.is_terminal());
        assert!(g.make_move("e8e7").is_err(), "no moves after the game ends");
    }
}

#[test]
fn the_centre_means_nothing_in_standard_chess() {
    let mut g = game(GameVariant::Standard, KING_NEAR_HILL);
    play(&mut g, &["e3e4"]);
    assert_eq!(g.status, GameStatus::Active);
}

#[test]
fn black_can_win_king_of_the_hill_too() {
    let mut g = game(GameVariant::KingOfTheHill, "7R/8/4k3/8/8/8/8/4K3 b - - 0 1");
    play(&mut g, &["e6e5"]);
    assert_eq!(g.status, GameStatus::VariantWin("black".into()));
}

#[test]
fn engine_walks_its_king_onto_the_hill() {
    let g = game(GameVariant::KingOfTheHill, KING_NEAR_HILL);
    let (mv, _) = search_best_move_with_rules(&g.board, g.search_rules(), 3, 0).unwrap();
    assert!(
        ["d4", "e4"].contains(&destination(&mv.to_uci())),
        "played {}",
        mv.to_uci()
    );
}

#[test]
fn engine_stops_the_opponent_reaching_the_hill() {
    // White threatens Kd4 or Ke4 next move. Only Rf4 covers both squares;
    // every other rook move, including the check Rf3+, lets the king through.
    let g = game(
        GameVariant::KingOfTheHill,
        "4k3/8/8/5r2/8/4K3/8/8 b - - 0 1",
    );
    let (mv, _) = search_best_move_with_rules(&g.board, g.search_rules(), 4, 0).unwrap();
    let mut after = g.clone();
    after.make_move(&mv.to_uci()).unwrap();
    for reply in after.get_legal_moves() {
        let mut probe = after.clone();
        probe.make_move(&reply).unwrap();
        assert_ne!(
            probe.status,
            GameStatus::VariantWin("white".into()),
            "after {} white wins with {reply}",
            mv.to_uci()
        );
    }
}

// ── Three-Check ──

/// 1.e4 e5 2.Bc4 Nc6 3.Bxf7+ — white's first check.
const ITALIAN_BXF7: [&str; 5] = ["e2e4", "e7e5", "f1c4", "b8c6", "c4f7"];

#[test]
fn checks_are_counted_per_side() {
    let mut g = GameState::new_variant(GameVariant::ThreeCheck, None);
    play(&mut g, &ITALIAN_BXF7);
    assert_eq!(g.checks_given, [1, 0]);
    play(&mut g, &["e8f7"]);
    assert_eq!(
        g.checks_given,
        [1, 0],
        "capturing the checker is not a check"
    );
}

#[test]
fn checks_are_not_counted_outside_three_check() {
    let mut g = GameState::new();
    play(&mut g, &ITALIAN_BXF7);
    assert_eq!(g.checks_given, [0, 0]);
}

#[test]
fn the_third_check_wins() {
    let mut g = game(GameVariant::ThreeCheck, "4k3/8/8/8/8/8/8/3QK3 w - - 0 1");
    g.checks_given = [2, 0];
    play(&mut g, &["d1d8"]);
    assert_eq!(g.checks_given, [3, 0]);
    assert_eq!(g.status, GameStatus::VariantWin("white".into()));
    assert_eq!(g.status.winner(), Some("white"));
}

#[test]
fn undo_restores_the_check_count() {
    let mut g = GameState::new_variant(GameVariant::ThreeCheck, None);
    play(&mut g, &ITALIAN_BXF7);
    g.undo_moves(1).unwrap();
    assert_eq!(g.checks_given, [0, 0]);
    play(&mut g, &["c4f7"]);
    assert_eq!(g.checks_given, [1, 0]);
}

#[test]
fn undo_out_of_a_three_check_win_reopens_the_game() {
    let mut g = GameState::new_variant(GameVariant::ThreeCheck, None);
    play(&mut g, &ITALIAN_BXF7); // 3.Bxf7+, first check
    play(&mut g, &["e8f7", "d1h5"]); // 4.Qh5+, second check
    assert_eq!(g.checks_given, [2, 0]);
    play(&mut g, &["g7g6", "h5f3"]); // 5.Qf3+, third check
    assert_eq!(g.status, GameStatus::VariantWin("white".into()));
    g.undo_moves(1).unwrap();
    assert_eq!(g.status, GameStatus::Active);
    assert_eq!(g.checks_given, [2, 0]);
}

#[test]
fn loading_a_position_resets_the_check_count() {
    let mut g = GameState::new_variant(GameVariant::ThreeCheck, None);
    play(&mut g, &ITALIAN_BXF7);
    g.load_position("4k3/8/8/8/8/8/8/4K3 w - - 0 1").unwrap();
    assert_eq!(g.checks_given, [0, 0]);
}

#[test]
fn the_check_count_is_saved_and_old_saves_load_with_none() {
    let mut g = GameState::new_variant(GameVariant::ThreeCheck, None);
    play(&mut g, &ITALIAN_BXF7);
    let json = serde_json::to_string(&g).unwrap();
    let back: GameState = serde_json::from_str(&json).unwrap();
    assert_eq!(back.checks_given, [1, 0]);

    let mut legacy: Value = serde_json::from_str(&json).unwrap();
    legacy.as_object_mut().unwrap().remove("checks_given");
    let back: GameState = serde_json::from_value(legacy).unwrap();
    assert_eq!(back.checks_given, [0, 0]);
}

/// White to move with two checks given: any check wins on the spot, but
/// capturing the loose rook is the better standard-chess move.
const THIRD_CHECK_OR_ROOK: &str = "4k3/8/8/8/6r1/8/8/3QK3 w - - 0 1";

#[test]
fn engine_takes_the_third_check_over_material() {
    let mut g = game(GameVariant::ThreeCheck, THIRD_CHECK_OR_ROOK);
    g.checks_given = [2, 0];
    let (mv, _) = search_best_move_with_rules(&g.board, g.search_rules(), 3, 0).unwrap();
    let mut after = g.board.clone();
    let legal = chess_engine::moves::generate_legal_moves(&g.board);
    let legal_mv = legal.iter().find(|m| m.to_uci() == mv.to_uci()).unwrap();
    assert!(make_move(&mut after, legal_mv));
    assert!(after.is_in_check(), "played {}", mv.to_uci());
}

#[test]
fn standard_search_still_takes_the_rook() {
    // Same position under standard rules: the rook is the right choice.
    let g = game(GameVariant::Standard, THIRD_CHECK_OR_ROOK);
    let (mv, _) = search_best_move_timed(&g.board, 3, 0).unwrap();
    assert_eq!(mv.to_uci(), "d1g4");
}

// ── Over HTTP ──

#[actix_web::test]
async fn responses_carry_the_check_count_only_in_three_check() {
    std::env::set_var(
        "GAMES_DIR",
        std::env::temp_dir().join("chess-engine-koth-threecheck-tests"),
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

    let new_game = |variant: &str| {
        actix_test::TestRequest::post()
            .uri("/game/new-variant")
            .insert_header(auth.clone())
            .set_json(json!({ "variant": variant }))
            .to_request()
    };
    let created: Value = actix_test::call_and_read_body_json(&app, new_game("threecheck")).await;
    let id = created["game_id"].as_str().unwrap().to_string();
    let mut last = Value::Null;
    for uci in ITALIAN_BXF7 {
        let req = actix_test::TestRequest::post()
            .uri(&format!("/game/{id}/move"))
            .insert_header(auth.clone())
            .set_json(json!({ "uci": uci }))
            .to_request();
        last = actix_test::call_and_read_body_json(&app, req).await;
    }
    assert_eq!(last["checks"], json!({"white": 1, "black": 0}));
    let req = actix_test::TestRequest::get()
        .uri(&format!("/game/{id}"))
        .to_request();
    let state: Value = actix_test::call_and_read_body_json(&app, req).await;
    assert_eq!(state["checks"], json!({"white": 1, "black": 0}));

    let created: Value = actix_test::call_and_read_body_json(&app, new_game("standard")).await;
    let req = actix_test::TestRequest::get()
        .uri(&format!("/game/{}", created["game_id"].as_str().unwrap()))
        .to_request();
    let state: Value = actix_test::call_and_read_body_json(&app, req).await;
    assert!(state.get("checks").is_none(), "{state}");
}
