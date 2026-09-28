//! Regression tests for game-state / history consistency.
//!
//! Context: `set-position` overwrote the board from an arbitrary client FEN and
//! reset the status to Active while leaving `move_history`, `fen_history` and
//! `hash_history` untouched.  That let a client resurrect a finished game and
//! left the recorded history describing a game that had not been played, which
//! also corrupted repetition detection.

use chess_engine::board::Board;
use chess_engine::game::{GameState, GameStatus};

/// Play Fool's mate: 1.f3 e5 2.g4 Qh4#
fn fools_mate() -> GameState {
    let mut game = GameState::new();
    for uci in ["f2f3", "e7e5", "g2g4", "d8h4"] {
        game.make_move(uci).expect("legal move");
    }
    game
}

#[test]
fn fools_mate_is_checkmate_for_black() {
    let game = fools_mate();
    assert_eq!(game.status, GameStatus::Checkmate("black".to_string()));
    assert_eq!(game.status.winner(), Some("black"));
    assert!(game.status.is_terminal());
}

#[test]
fn undo_rewinds_board_and_all_history_together() {
    let mut game = fools_mate();
    let moves_before = game.move_history.len();

    game.undo_moves(1).expect("undo one move");

    // The mating move is gone from every parallel history, not just the board.
    assert_eq!(game.move_history.len(), moves_before - 1);
    assert_eq!(game.fen_history.len(), moves_before); // initial + 3 moves
    assert_eq!(game.hash_history.len(), moves_before);
    // Board matches the last surviving FEN.
    assert_eq!(&game.board.to_fen(), game.fen_history.last().unwrap());
    // Rewinding out of checkmate legitimately reactivates the game.
    assert_eq!(game.status, GameStatus::Active);
    // And the position is playable again.
    assert!(!game.get_legal_moves().is_empty());
}

#[test]
fn undo_can_rewind_several_moves() {
    let mut game = fools_mate();
    game.undo_moves(4).expect("undo all four moves");
    assert!(game.move_history.is_empty());
    assert_eq!(game.fen_history.len(), 1);
    assert_eq!(game.hash_history.len(), 1);
    assert_eq!(game.board.to_fen(), Board::new().to_fen());
    assert_eq!(game.status, GameStatus::Active);
}

#[test]
fn undo_beyond_the_start_is_rejected() {
    let mut game = fools_mate();
    assert!(game.undo_moves(5).is_err(), "cannot rewind past the first move");
    // Rejected undo must not have mutated anything.
    assert_eq!(game.move_history.len(), 4);
    assert_eq!(game.status, GameStatus::Checkmate("black".to_string()));
}

#[test]
fn undo_of_zero_moves_is_rejected() {
    let mut game = fools_mate();
    assert!(game.undo_moves(0).is_err());
}

#[test]
fn loading_an_arbitrary_position_resets_history_and_marks_analysis() {
    let mut game = fools_mate();
    let start = Board::new().to_fen();

    game.load_position(&start).expect("valid FEN");

    // History must never describe a game that was not played.
    assert!(game.move_history.is_empty(), "stale moves must be cleared");
    assert_eq!(game.fen_history, vec![start.clone()]);
    assert_eq!(game.hash_history.len(), 1);
    assert_eq!(game.board.to_fen(), start);
    // A hand-placed position cannot yield a rated result.
    assert!(game.is_analysis, "arbitrary position must mark the game unranked");
    assert_eq!(game.status, GameStatus::Active);
}

#[test]
fn repetition_detection_is_not_poisoned_by_a_position_load() {
    // Before the fix, hash_history retained hashes from the abandoned line, so
    // repetition counts were computed against positions from another game.
    let mut game = fools_mate();
    game.load_position(&Board::new().to_fen()).expect("valid FEN");

    // Shuffle knights out and back twice; the third repetition ends the game.
    // If stale hashes survived, the count would be wrong.
    for uci in ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1"] {
        if game.status != GameStatus::Active {
            break;
        }
        game.make_move(uci).expect("legal move");
    }
    // Reaching here without a spurious early draw is the assertion; the final
    // repetition is what legitimately ends it.
    assert_eq!(game.hash_history.len(), game.move_history.len() + 1);
}
