use crate::board::*;
use crate::piece::{Color, PieceType};

/// Piece-square tables for positional evaluation (centipawns)
/// These encode good positions for each piece type

const PAWN_TABLE: [i32; 64] = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
];

const KNIGHT_TABLE: [i32; 64] = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP_TABLE: [i32; 64] = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK_TABLE: [i32; 64] = [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
];

const QUEEN_TABLE: [i32; 64] = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
];

const KING_MIDDLEGAME_TABLE: [i32; 64] = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
];

const KING_ENDGAME_TABLE: [i32; 64] = [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
];

fn mirror_square(sq: u8) -> u8 {
    sq ^ 56 // Flip rank
}

fn count_bits(bb: u64) -> i32 {
    bb.count_ones() as i32
}

/// Evaluate the current position from the perspective of white.
/// Positive = white advantage, Negative = black advantage.
pub fn evaluate(board: &Board) -> i32 {
    let mut score = 0i32;

    // Determine game phase (for king table interpolation)
    let total_material = count_non_pawn_material(board);
    let is_endgame = total_material < 1300; // Roughly when queens are off

    // Material and positional evaluation
    for ci in 0..2 {
        let sign = if ci == 0 { 1 } else { -1 };

        for pi in 0..6 {
            let mut bb = board.bitboards[ci][pi];
            while bb != 0 {
                let sq_idx = bb.trailing_zeros() as u8;
                bb &= bb - 1;

                let piece_type = match pi {
                    0 => PieceType::King,
                    1 => PieceType::Queen,
                    2 => PieceType::Rook,
                    3 => PieceType::Bishop,
                    4 => PieceType::Knight,
                    5 => PieceType::Pawn,
                    _ => unreachable!(),
                };

                // Material value
                score += sign * piece_type.value();

                // Positional value from piece-square tables
                let table_sq = if ci == 0 { sq_idx } else { mirror_square(sq_idx) } as usize;
                let pst_value = match pi {
                    0 => {
                        if is_endgame {
                            KING_ENDGAME_TABLE[table_sq]
                        } else {
                            KING_MIDDLEGAME_TABLE[table_sq]
                        }
                    }
                    1 => QUEEN_TABLE[table_sq],
                    2 => ROOK_TABLE[table_sq],
                    3 => BISHOP_TABLE[table_sq],
                    4 => KNIGHT_TABLE[table_sq],
                    5 => PAWN_TABLE[table_sq],
                    _ => 0,
                };
                score += sign * pst_value;
            }
        }
    }

    // Bonus for bishop pair
    if count_bits(board.bitboards[0][3]) >= 2 {
        score += 30;
    }
    if count_bits(board.bitboards[1][3]) >= 2 {
        score -= 30;
    }

    // Mobility bonus (simplified)
    let white_mobility = count_mobility(board, Color::White);
    let black_mobility = count_mobility(board, Color::Black);
    score += (white_mobility - black_mobility) * 5;

    // Return score relative to current side
    match board.side_to_move {
        Color::White => score,
        Color::Black => -score,
    }
}

fn count_non_pawn_material(board: &Board) -> i32 {
    let mut material = 0;
    for ci in 0..2 {
        material += count_bits(board.bitboards[ci][1]) * PieceType::Queen.value();
        material += count_bits(board.bitboards[ci][2]) * PieceType::Rook.value();
        material += count_bits(board.bitboards[ci][3]) * PieceType::Bishop.value();
        material += count_bits(board.bitboards[ci][4]) * PieceType::Knight.value();
    }
    material
}

fn count_mobility(board: &Board, color: Color) -> i32 {
    let ci = match color { Color::White => 0, Color::Black => 1 };
    let own = board.pieces_of(color);
    let mut mobility = 0i32;

    // Knight mobility
    let mut bb = board.bitboards[ci][4];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        mobility += count_bits(knight_attacks(sq_idx) & !own);
    }

    // Bishop mobility
    bb = board.bitboards[ci][3];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        mobility += count_bits(bishop_attacks(sq_idx, board.all_pieces) & !own);
    }

    // Rook mobility
    bb = board.bitboards[ci][2];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        mobility += count_bits(rook_attacks(sq_idx, board.all_pieces) & !own);
    }

    mobility
}

/// Alpha-beta search with iterative deepening
pub fn search_best_move(board: &Board, depth: u8) -> Option<(crate::moves::Move, i32)> {
    use crate::moves::{generate_legal_moves, make_move, Move};

    let moves = generate_legal_moves(board);
    if moves.is_empty() {
        return None;
    }

    let mut best_move = moves[0];
    let mut best_score = i32::MIN + 1;

    for mv in &moves {
        let mut new_board = board.clone();
        if make_move(&mut new_board, mv) {
            let score = -alpha_beta(&new_board, depth - 1, i32::MIN + 1, i32::MAX - 1);
            if score > best_score {
                best_score = score;
                best_move = *mv;
            }
        }
    }

    Some((best_move, best_score))
}

fn alpha_beta(board: &Board, depth: u8, mut alpha: i32, beta: i32) -> i32 {
    use crate::moves::{generate_legal_moves, make_move};

    if depth == 0 {
        return quiescence_search(board, alpha, beta, 4);
    }

    let moves = generate_legal_moves(board);

    if moves.is_empty() {
        if board.is_in_check() {
            return -19000 - depth as i32; // Checkmate (prefer faster mates)
        }
        return 0; // Stalemate
    }

    for mv in &moves {
        let mut new_board = board.clone();
        if make_move(&mut new_board, mv) {
            let score = -alpha_beta(&new_board, depth - 1, -beta, -alpha);
            if score >= beta {
                return beta; // Beta cutoff
            }
            if score > alpha {
                alpha = score;
            }
        }
    }

    alpha
}

/// Quiescence search to avoid horizon effect
fn quiescence_search(board: &Board, mut alpha: i32, beta: i32, max_depth: u8) -> i32 {
    use crate::moves::{generate_legal_moves, make_move};

    let stand_pat = evaluate(board);
    if stand_pat >= beta {
        return beta;
    }
    if alpha < stand_pat {
        alpha = stand_pat;
    }
    if max_depth == 0 {
        return alpha;
    }

    let moves = generate_legal_moves(board);
    for mv in &moves {
        // Only search captures in quiescence
        let is_capture = board.piece_at(mv.to).is_some() || mv.is_en_passant;
        if !is_capture {
            continue;
        }

        let mut new_board = board.clone();
        if make_move(&mut new_board, mv) {
            let score = -quiescence_search(&new_board, -beta, -alpha, max_depth - 1);
            if score >= beta {
                return beta;
            }
            if score > alpha {
                alpha = score;
            }
        }
    }

    alpha
}
