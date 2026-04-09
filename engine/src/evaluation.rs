use crate::board::*;
use crate::piece::{Color, PieceType};
use crate::zobrist::hash_board;
use std::sync::Mutex;

// ═══════════════════════════════════════════════════════════════════════
// Piece-Square Tables (centipawns)
// ═══════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════
// Transposition Table
// ═══════════════════════════════════════════════════════════════════════

/// Type of transposition table entry bound.
#[derive(Clone, Copy, PartialEq, Eq)]
enum TTFlag {
    Exact,
    LowerBound, // beta cutoff
    UpperBound, // failed low
}

#[derive(Clone, Copy)]
struct TTEntry {
    hash: u64,
    depth: u8,
    score: i32,
    flag: TTFlag,
    best_move: Option<crate::moves::Move>,
}

impl Default for TTEntry {
    fn default() -> Self {
        Self {
            hash: 0,
            depth: 0,
            score: 0,
            flag: TTFlag::Exact,
            best_move: None,
        }
    }
}

/// Fixed-size transposition table (≈16 MB default — 2^20 entries × 16 bytes)
const TT_SIZE: usize = 1 << 20; // ~1 million entries

lazy_static::lazy_static! {
    static ref TT: Mutex<Vec<TTEntry>> = Mutex::new(vec![TTEntry::default(); TT_SIZE]);
}

fn tt_index(hash: u64) -> usize {
    (hash as usize) % TT_SIZE
}

fn tt_probe(hash: u64) -> Option<TTEntry> {
    if let Ok(table) = TT.lock() {
        let entry = table[tt_index(hash)];
        if entry.hash == hash {
            return Some(entry);
        }
    }
    None
}

fn tt_store(hash: u64, depth: u8, score: i32, flag: TTFlag, best_move: Option<crate::moves::Move>) {
    if let Ok(mut table) = TT.lock() {
        let idx = tt_index(hash);
        // Always-replace strategy; prefer deeper entries
        if depth >= table[idx].depth || table[idx].hash != hash {
            table[idx] = TTEntry { hash, depth, score, flag, best_move };
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Move Ordering (MVV-LVA + killer moves + TT move)
// ═══════════════════════════════════════════════════════════════════════

/// MVV-LVA (Most Valuable Victim – Least Valuable Attacker) scores.
/// Higher is better — we want to search good captures first.
fn mvv_lva_score(board: &Board, mv: &crate::moves::Move) -> i32 {
    let victim = board.piece_at(mv.to);
    let attacker = board.piece_at(mv.from);

    match (victim, attacker) {
        (Some(v), Some(a)) => v.piece_type.value() * 10 - a.piece_type.value(),
        _ if mv.is_en_passant => PieceType::Pawn.value() * 10, // en passant captures a pawn
        _ => 0,
    }
}

/// Thread-local killer moves (indexed by depth, 2 slots each).
/// Killer moves are quiet moves that caused beta cutoffs at the same depth.
const MAX_KILLER_DEPTH: usize = 64;

lazy_static::lazy_static! {
    static ref KILLERS: Mutex<[[Option<crate::moves::Move>; 2]; MAX_KILLER_DEPTH]> =
        Mutex::new([[None; 2]; MAX_KILLER_DEPTH]);
}

fn is_killer(mv: &crate::moves::Move, depth: usize) -> bool {
    if depth >= MAX_KILLER_DEPTH { return false; }
    if let Ok(killers) = KILLERS.lock() {
        killers[depth][0].map_or(false, |k| k == *mv) ||
        killers[depth][1].map_or(false, |k| k == *mv)
    } else {
        false
    }
}

fn store_killer(mv: &crate::moves::Move, depth: usize) {
    if depth >= MAX_KILLER_DEPTH { return; }
    if let Ok(mut killers) = KILLERS.lock() {
        if killers[depth][0] != Some(*mv) {
            killers[depth][1] = killers[depth][0];
            killers[depth][0] = Some(*mv);
        }
    }
}

/// Sort moves for best alpha-beta pruning:
///   1. TT best move (score 900_000)
///   2. Winning / equal captures by MVV-LVA (100_000 + mvv_lva)
///   3. Killer moves (80_000)
///   4. Quiet moves (0)
fn order_moves(
    moves: &mut Vec<crate::moves::Move>,
    board: &Board,
    tt_move: Option<crate::moves::Move>,
    depth: usize,
) {
    moves.sort_by_cached_key(|mv| {
        let mut priority = 0i32;

        // TT move gets highest priority
        if tt_move.map_or(false, |tm| tm == *mv) {
            return -900_000;
        }

        // Captures sorted by MVV-LVA
        let is_capture = board.piece_at(mv.to).is_some() || mv.is_en_passant;
        if is_capture {
            priority = -100_000 - mvv_lva_score(board, mv);
        } else if is_killer(mv, depth) {
            priority = -80_000;
        }

        priority
    });
}


// ═══════════════════════════════════════════════════════════════════════
// Principal Search: Iterative Deepening + Alpha-Beta + TT + Ordering
// ═══════════════════════════════════════════════════════════════════════

/// Find the best move using iterative deepening alpha-beta search.
pub fn search_best_move(board: &Board, depth: u8) -> Option<(crate::moves::Move, i32)> {
    use crate::moves::{generate_legal_moves, make_move};

    let moves = generate_legal_moves(board);
    if moves.is_empty() {
        return None;
    }

    // Clear killer table for fresh search
    if let Ok(mut killers) = KILLERS.lock() {
        for k in killers.iter_mut() {
            *k = [None; 2];
        }
    }

    let hash = hash_board(board);
    let mut best_move = moves[0];
    let mut best_score = i32::MIN + 1;

    // Iterative deepening: search depth 1, 2, … up to requested depth.
    // Each iteration warms the TT for the next one.
    for d in 1..=depth {
        let mut current_best = moves[0];
        let mut current_score = i32::MIN + 1;

        // Order root moves using TT from previous iteration
        let tt_move = tt_probe(hash).and_then(|e| e.best_move);
        let mut ordered = moves.clone();
        order_moves(&mut ordered, board, tt_move, d as usize);

        for mv in &ordered {
            let mut new_board = board.clone();
            if make_move(&mut new_board, mv) {
                let score = -alpha_beta(&new_board, d - 1, -i32::MAX + 1, -current_score.max(i32::MIN + 1));
                if score > current_score {
                    current_score = score;
                    current_best = *mv;
                }
            }
        }

        best_move = current_best;
        best_score = current_score;

        // Store root position in TT
        tt_store(hash, d, best_score, TTFlag::Exact, Some(best_move));
    }

    Some((best_move, best_score))
}

/// Multi-PV search: return the top N moves with their evaluations and
/// principal variations.
pub fn search_top_moves(
    board: &Board,
    depth: u8,
    num_moves: usize,
) -> Vec<(crate::moves::Move, i32, Vec<crate::moves::Move>)> {
    use crate::moves::{generate_legal_moves, make_move};

    let moves = generate_legal_moves(board);
    if moves.is_empty() {
        return vec![];
    }

    let mut scored: Vec<(crate::moves::Move, i32)> = Vec::new();
    for mv in &moves {
        let mut new_board = board.clone();
        if make_move(&mut new_board, mv) {
            let score = -alpha_beta(
                &new_board,
                depth.saturating_sub(1),
                i32::MIN + 1,
                i32::MAX - 1,
            );
            scored.push((*mv, score));
        }
    }

    scored.sort_by(|a, b| b.1.cmp(&a.1));
    scored.truncate(num_moves);

    scored
        .into_iter()
        .map(|(mv, score)| {
            let mut pv = vec![mv];
            let mut pv_board = board.clone();
            if make_move(&mut pv_board, &mv) {
                extract_pv(&pv_board, depth.saturating_sub(1), &mut pv);
            }
            (mv, score, pv)
        })
        .collect()
}

/// Extract the principal variation from the transposition table.
fn extract_pv(board: &Board, max_depth: u8, pv: &mut Vec<crate::moves::Move>) {
    use crate::moves::make_move;

    if max_depth == 0 || pv.len() >= 10 {
        return;
    }
    let hash = hash_board(board);
    if let Some(entry) = tt_probe(hash) {
        if let Some(mv) = entry.best_move {
            pv.push(mv);
            let mut next = board.clone();
            if make_move(&mut next, &mv) {
                extract_pv(&next, max_depth - 1, pv);
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════
// Alpha-Beta with Null-Move Pruning and Late-Move Reductions
// ═══════════════════════════════════════════════════════════════════════

fn alpha_beta(board: &Board, depth: u8, mut alpha: i32, beta: i32) -> i32 {
    use crate::moves::{generate_legal_moves, make_move};

    // ── Transposition table probe ──
    let hash = hash_board(board);
    if let Some(entry) = tt_probe(hash) {
        if entry.depth >= depth {
            match entry.flag {
                TTFlag::Exact => return entry.score,
                TTFlag::LowerBound => {
                    if entry.score >= beta { return entry.score; }
                }
                TTFlag::UpperBound => {
                    if entry.score <= alpha { return entry.score; }
                }
            }
        }
    }

    // ── Leaf node ──
    if depth == 0 {
        return quiescence_search(board, alpha, beta, 6);
    }

    let in_check = board.is_in_check();

    // ── Null-move pruning ──
    // Skip when in check, at shallow depth, or in a zugzwang-prone endgame.
    if !in_check && depth >= 3 {
        let non_pawn = count_non_pawn_material(board);
        if non_pawn > 600 { // Not pure pawn endgame
            // Make a "null move" (pass the turn) and search with reduced depth
            let mut null_board = board.clone();
            null_board.side_to_move = board.side_to_move.opposite();
            null_board.en_passant_square = None; // EP is invalid after null move
            let r = if depth > 6 { 3 } else { 2 }; // Reduction factor
            let null_score = -alpha_beta(&null_board, depth - 1 - r, -beta, -beta + 1);
            if null_score >= beta {
                return beta; // Null-move cutoff
            }
        }
    }

    // ── Generate & order moves ──
    let mut moves = generate_legal_moves(board);
    if moves.is_empty() {
        if in_check {
            return -19000 - depth as i32; // Checkmate
        }
        return 0; // Stalemate
    }

    let tt_move = tt_probe(hash).and_then(|e| e.best_move);
    order_moves(&mut moves, board, tt_move, depth as usize);

    let mut best_score = i32::MIN + 1;
    let mut best_move = moves[0];
    let mut moves_searched = 0u32;
    let original_alpha = alpha;

    for mv in &moves {
        let mut new_board = board.clone();
        if !make_move(&mut new_board, mv) {
            continue;
        }

        let score;

        // ── Late-Move Reductions (LMR) ──
        // After the first few moves (which are likely the best thanks to ordering),
        // search remaining quiet moves at reduced depth. If they look promising,
        // re-search at full depth.
        let is_capture = board.piece_at(mv.to).is_some() || mv.is_en_passant;
        let gives_check = new_board.is_in_check();

        if moves_searched >= 4
            && depth >= 3
            && !is_capture
            && !in_check
            && !gives_check
            && mv.promotion.is_none()
        {
            // Reduced search (depth - 2 instead of depth - 1)
            let reduced = -alpha_beta(&new_board, depth - 2, -alpha - 1, -alpha);
            if reduced > alpha {
                // Re-search at full depth
                score = -alpha_beta(&new_board, depth - 1, -beta, -alpha);
            } else {
                score = reduced;
            }
        } else {
            score = -alpha_beta(&new_board, depth - 1, -beta, -alpha);
        }

        moves_searched += 1;

        if score > best_score {
            best_score = score;
            best_move = *mv;
        }
        if score > alpha {
            alpha = score;
        }
        if alpha >= beta {
            // Store killer move (quiet moves that cause cutoffs)
            if !is_capture {
                store_killer(mv, depth as usize);
            }
            // Beta cutoff — store as lower bound
            tt_store(hash, depth, best_score, TTFlag::LowerBound, Some(best_move));
            return beta;
        }
    }

    // Determine TT flag
    let flag = if best_score <= original_alpha {
        TTFlag::UpperBound
    } else {
        TTFlag::Exact
    };
    tt_store(hash, depth, best_score, flag, Some(best_move));

    best_score
}

/// Quiescence search to avoid horizon effect — only searches captures.
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

    let mut moves = generate_legal_moves(board);

    // Filter to captures only and sort by MVV-LVA
    moves.retain(|mv| board.piece_at(mv.to).is_some() || mv.is_en_passant);
    moves.sort_by_cached_key(|mv| -mvv_lva_score(board, mv));

    for mv in &moves {
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
