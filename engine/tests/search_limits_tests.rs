//! Regression tests for search resource limits.
//!
//! Context: `/evaluate` and `/analyze` accepted an unbounded `depth` and ran an
//! unlimited search, which allowed a small number of unauthenticated requests to
//! occupy every worker indefinitely.  These tests pin the two guarantees that
//! close that hole: client-supplied depth is clamped, and every search the API
//! performs is bounded in wall-clock time.

use std::time::{Duration, Instant};

use chess_engine::api::clamp_depth;
use chess_engine::board::Board;
use chess_engine::evaluation::{search_best_move_timed, search_top_moves_timed};

/// Dense middlegame position — enough branching that an unbounded deep search
/// runs for minutes rather than seconds.
const KIWIPETE: &str = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

#[test]
fn depth_is_clamped_to_the_maximum() {
    // Absurd and merely large client values both come back at the cap.
    assert_eq!(clamp_depth(Some(255)), chess_engine::api::MAX_SEARCH_DEPTH);
    assert_eq!(clamp_depth(Some(99)), chess_engine::api::MAX_SEARCH_DEPTH);
    // Values inside the range are preserved.
    assert_eq!(clamp_depth(Some(4)), 4);
    // Zero would make the search meaningless; it is raised to one ply.
    assert_eq!(clamp_depth(Some(0)), 1);
    // Absent depth falls back to the default, which must itself be in range.
    let d = clamp_depth(None);
    assert!(d >= 1 && d <= chess_engine::api::MAX_SEARCH_DEPTH);
}

#[test]
fn best_move_search_respects_its_time_budget() {
    let board = Board::from_fen(KIWIPETE).expect("valid FEN");
    let budget_ms = 500;

    let start = Instant::now();
    let result = search_best_move_timed(&board, 99, budget_ms);
    let elapsed = start.elapsed();

    assert!(result.is_some(), "a legal move must still be returned on timeout");
    // Generous ceiling: the limit is checked every 2048 nodes, so overshoot is
    // expected — but it must be bounded, not open-ended.
    assert!(
        elapsed < Duration::from_millis(budget_ms * 10),
        "depth-99 search with a {budget_ms}ms budget took {elapsed:?}"
    );
}

#[test]
fn top_moves_search_respects_its_time_budget() {
    let board = Board::from_fen(KIWIPETE).expect("valid FEN");
    let budget_ms = 500;

    let start = Instant::now();
    let moves = search_top_moves_timed(&board, 99, 3, budget_ms);
    let elapsed = start.elapsed();

    assert!(!moves.is_empty(), "analysis must still return moves on timeout");
    assert!(
        elapsed < Duration::from_millis(budget_ms * 10),
        "depth-99 multi-PV search with a {budget_ms}ms budget took {elapsed:?}"
    );
}

#[test]
fn timed_search_still_finds_mate_in_one() {
    // A budget must not break correctness on positions that resolve instantly.
    let board = Board::from_fen("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1").expect("valid FEN");
    let (mv, _) = search_best_move_timed(&board, 4, 5000).expect("a move exists");
    assert_eq!(mv.to_uci(), "a1a8", "Ra8# is mate in one");
}
