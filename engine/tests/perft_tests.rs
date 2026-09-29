//! Real perft (performance test) node-count verification against published
//! reference values.  Perft counts every leaf node of the legal-move tree to a
//! given depth; matching the published counts exercises castling, en passant,
//! promotion, pin/check evasion and discovered-check legality all at once.
//!
//! Reference values from the Chess Programming Wiki standard test positions.

use chess_engine::board::Board;
use chess_engine::moves::{generate_legal_moves, make_move};

fn perft(board: &Board, depth: u32) -> u64 {
    if depth == 0 {
        return 1;
    }
    let moves = generate_legal_moves(board);
    if depth == 1 {
        return moves.len() as u64;
    }
    let mut nodes = 0u64;
    for mv in &moves {
        let mut next = board.clone();
        if make_move(&mut next, mv) {
            nodes += perft(&next, depth - 1);
        }
    }
    nodes
}

fn check(name: &str, fen: &str, expected: &[u64]) {
    let board = Board::from_fen(fen).expect("valid FEN");
    for (i, &want) in expected.iter().enumerate() {
        let depth = i as u32 + 1;
        let got = perft(&board, depth);
        assert_eq!(
            got, want,
            "{}: perft({}) = {} but reference says {}\nFEN: {}",
            name, depth, got, want, fen
        );
    }
}

#[test]
fn perft_startpos() {
    check(
        "startpos",
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        &[20, 400, 8902, 197281],
    );
}

#[test]
fn perft_kiwipete() {
    // Dense middlegame: castling both sides, many captures and pins.
    check(
        "kiwipete",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        &[48, 2039, 97862],
    );
}

#[test]
fn perft_position_3_endgame() {
    // Rook/pawn endgame rich in en-passant and promotion edge cases.
    check(
        "position 3",
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
        &[14, 191, 2812, 43238],
    );
}

#[test]
fn perft_position_4_promotions() {
    // Heavy promotion position with pins against the king.
    check(
        "position 4",
        "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
        &[6, 264, 9467],
    );
}

#[test]
fn perft_position_5() {
    check(
        "position 5",
        "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
        &[44, 1486, 62379],
    );
}

#[test]
fn perft_position_6() {
    check(
        "position 6",
        "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
        &[46, 2079, 89890],
    );
}
