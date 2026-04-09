//! Attack and defense map computation.
//!
//! For every square on the board, compute:
//!   - Which white pieces attack it and how many
//!   - Which black pieces attack it and how many
//!   - Whether any piece on that square is "hanging"
//!   - Overall square control ("white" | "black" | "contested" | "neutral")
//!
//! Exposed via the `/attack-map` REST endpoint.

use crate::board::{
    bishop_attacks, bit, color_index, file_of, king_attacks, knight_attacks, piece_type_index,
    rook_attacks, sq, square_name, Board,
};
use crate::piece::Color;
use serde::Serialize;

// Centipawn values used for static exchange / hanging detection
const PIECE_VALUES: [i32; 6] = [
    20000, // King   (index 0)
    900,   // Queen  (index 1)
    500,   // Rook   (index 2)
    325,   // Bishop (index 3)
    325,   // Knight (index 4)
    100,   // Pawn   (index 5)
];

fn piece_value_at(board: &Board, square: u8) -> i32 {
    match board.piece_at(square) {
        Some(p) => PIECE_VALUES[piece_type_index(p.piece_type)],
        None => 0,
    }
}

/// Returns squares of all `by_color` pieces that attack `square`.
pub fn attackers_of_square(board: &Board, square: u8, by_color: Color) -> Vec<u8> {
    let ci = color_index(by_color);
    let mut result = Vec::new();

    // Knights
    collect_bits(knight_attacks(square) & board.bitboards[ci][4], &mut result);

    // King
    collect_bits(king_attacks(square) & board.bitboards[ci][0], &mut result);

    // Pawns — reverse the pawn attack pattern relative to `by_color`
    let pawn_bb = board.bitboards[ci][5];
    let pawn_attackers = match by_color {
        Color::White => {
            // A white pawn on file f attacks (f-1, rank+1) and (f+1, rank+1).
            // So white pawns that attack `square` are below it, diagonally.
            let mut bb = 0u64;
            if file_of(square) > 0 { bb |= bit(square) >> 9; }
            if file_of(square) < 7 { bb |= bit(square) >> 7; }
            bb & pawn_bb
        }
        Color::Black => {
            let mut bb = 0u64;
            if file_of(square) > 0 { bb |= bit(square) << 7; }
            if file_of(square) < 7 { bb |= bit(square) << 9; }
            bb & pawn_bb
        }
    };
    collect_bits(pawn_attackers, &mut result);

    // Rooks / Queens (straight lines)
    let rq = board.bitboards[ci][2] | board.bitboards[ci][1];
    collect_bits(rook_attacks(square, board.all_pieces) & rq, &mut result);

    // Bishops / Queens (diagonals)
    let bq = board.bitboards[ci][3] | board.bitboards[ci][1];
    collect_bits(bishop_attacks(square, board.all_pieces) & bq, &mut result);

    result
}

fn collect_bits(mut bb: u64, out: &mut Vec<u8>) {
    while bb != 0 {
        out.push(bb.trailing_zeros() as u8);
        bb &= bb - 1; // clear lowest set bit
    }
}

// ---- Response types ----

#[derive(Serialize)]
pub struct SquareInfo {
    /// Algebraic name of this square (e.g. "e4")
    pub square: String,
    /// Squares of white pieces that attack this square
    pub white_attackers: Vec<String>,
    /// Squares of black pieces that attack this square
    pub black_attackers: Vec<String>,
    pub white_count: u8,
    pub black_count: u8,
    /// "white" | "black" | "contested" | "neutral"
    pub control: String,
}

#[derive(Serialize)]
pub struct HangingPiece {
    pub square: String,
    pub piece: String,
    pub color: String,
    /// Value of the cheapest attacker (centipawns)
    pub min_attacker_value: i32,
    /// Value of the piece itself
    pub piece_value: i32,
}

#[derive(Serialize)]
pub struct AttackMapResponse {
    pub fen: String,
    pub squares: Vec<SquareInfo>,
    pub hanging_pieces: Vec<HangingPiece>,
    /// Number of squares white controls outright
    pub white_controlled: u8,
    /// Number of squares black controls outright
    pub black_controlled: u8,
    /// Number of contested squares
    pub contested: u8,
}

/// Compute the full attack + defense map for the given board position.
pub fn compute_attack_map(board: &Board, fen: String) -> AttackMapResponse {
    let mut squares = Vec::with_capacity(64);
    let mut hanging_pieces = Vec::new();
    let mut white_controlled = 0u8;
    let mut black_controlled = 0u8;
    let mut contested_count = 0u8;

    for rank in 0..8u8 {
        for file in 0..8u8 {
            let square = sq(rank, file);
            let sq_name = square_name(square);

            let white_atk = attackers_of_square(board, square, Color::White);
            let black_atk = attackers_of_square(board, square, Color::Black);

            let wc = white_atk.len() as u8;
            let bc = black_atk.len() as u8;

            let control = match (wc, bc) {
                (0, 0) => "neutral",
                (_, 0) => { white_controlled += 1; "white" }
                (0, _) => { black_controlled += 1; "black" }
                _      => { contested_count  += 1; "contested" }
            };

            // Hanging piece detection: a piece is hanging if it's attacked more
            // than it's defended, or attacked by a lower-value piece.
            if let Some(piece) = board.piece_at(square) {
                let (attackers, defenders) = match piece.color {
                    Color::White => (&black_atk, &white_atk),
                    Color::Black => (&white_atk, &black_atk),
                };

                if !attackers.is_empty() {
                    let min_attacker_value = attackers
                        .iter()
                        .map(|&s| piece_value_at(board, s))
                        .min()
                        .unwrap_or(0);

                    let piece_val = PIECE_VALUES[piece_type_index(piece.piece_type)];
                    let is_hanging = attackers.len() > defenders.len()
                        || (min_attacker_value < piece_val && defenders.is_empty());

                    if is_hanging {
                        hanging_pieces.push(HangingPiece {
                            square: sq_name.clone(),
                            piece: format!("{:?}", piece.piece_type).to_lowercase(),
                            color: format!("{}", piece.color),
                            min_attacker_value,
                            piece_value: piece_val,
                        });
                    }
                }
            }

            squares.push(SquareInfo {
                white_attackers: white_atk.iter().map(|&s| square_name(s)).collect(),
                black_attackers: black_atk.iter().map(|&s| square_name(s)).collect(),
                white_count: wc,
                black_count: bc,
                control: control.to_string(),
                square: sq_name,
            });
        }
    }

    AttackMapResponse {
        fen,
        squares,
        hanging_pieces,
        white_controlled,
        black_controlled,
        contested: contested_count,
    }
}
