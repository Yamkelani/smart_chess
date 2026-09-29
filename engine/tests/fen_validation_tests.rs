/// FEN validation: malformed strings and impossible positions must be
/// rejected at parse time, and every real position must still load.
use chess_engine::board::Board;
use chess_engine::chess960;
use chess_engine::moves::generate_legal_moves;

fn rejected(fen: &str) -> String {
    match Board::from_fen(fen) {
        Ok(_) => panic!("expected FEN to be rejected: {fen}"),
        Err(e) => e,
    }
}

#[test]
fn malformed_placement_is_rejected() {
    rejected("4k3/8/8/8/8/8/4K3 w - - 0 1"); // 7 ranks
    rejected("4k3/8/8/8/8/8/8/8/4K3 w - - 0 1"); // 9 ranks
    rejected("88888888888/8/8/8/8/8/8/4K2k w - - 0 1"); // overlong rank
    rejected("4k3/8/8/8/8/8/8/4K2 w - - 0 1"); // short rank
    rejected("4k3/8/8/8/8/8/8/4K9 w - - 0 1"); // '9' is not a square count
    rejected("4k3/8/8/8/8/8/8/4K2X w - - 0 1"); // unknown piece
}

#[test]
fn impossible_positions_are_rejected() {
    assert!(rejected("8/8/8/8/8/8/8/4K3 w - - 0 1").contains("exactly one king"));
    assert!(rejected("k7/8/8/8/8/8/8/3KK3 w - - 0 1").contains("exactly one king"));
    assert!(rejected("P3k3/8/8/8/8/8/8/4K3 w - - 0 1").contains("first or last rank"));
    assert!(rejected("4k3/8/8/8/8/8/8/p3K3 b - - 0 1").contains("first or last rank"));
    // White to move while black's king is already attacked.
    assert!(rejected("4k3/4R3/8/8/8/8/8/4K3 w - - 0 1").contains("not to move is in check"));
}

#[test]
fn bad_fields_are_rejected() {
    rejected("4k3/8/8/8/8/8/8/4K3 x - - 0 1"); // side to move
    rejected("4k3/8/8/8/8/8/8/4K3 w XYZ - 0 1"); // castling
    rejected("4k3/8/8/8/8/8/8/4K3 w - e4 0 1"); // ep on wrong rank
    rejected("4k3/8/8/8/8/8/8/4K3 w - e6 0 1"); // ep with no pawn behind it
    rejected("4k3/8/8/8/8/8/8/4K3 w - - x 1"); // halfmove clock
    rejected("4k3/8/8/8/8/8/8/4K3 w - - 0 y"); // fullmove number
}

#[test]
fn unsupported_castling_rights_are_dropped() {
    // Lone kings claiming every right: no castling moves may be generated.
    let board = Board::from_fen("4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1").unwrap();
    let rights = board.castling_rights;
    assert!(!rights.white_kingside && !rights.white_queenside);
    assert!(!rights.black_kingside && !rights.black_queenside);
    assert!(generate_legal_moves(&board).iter().all(|m| !m.is_castling));

    // Rights backed by king and rook are kept.
    let board = Board::from_fen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1").unwrap();
    let rights = board.castling_rights;
    assert!(rights.white_kingside && rights.white_queenside);
    assert!(rights.black_kingside && rights.black_queenside);
}

#[test]
fn real_positions_still_load() {
    for fen in [
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq e6 0 3",
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        "4k3/8/8/8/8/8/8/4K3 w - -", // counters are optional
    ] {
        let board = Board::from_fen(fen).unwrap_or_else(|e| panic!("{fen}: {e}"));
        assert_eq!(board.to_fen().split(' ').next(), fen.split(' ').next());
    }
}

#[test]
fn every_chess960_start_position_loads() {
    for id in 0..960 {
        let pos = chess960::generate_position(id);
        Board::from_fen(&pos.fen).unwrap_or_else(|e| panic!("960 #{id} {}: {e}", pos.fen));
    }
}
