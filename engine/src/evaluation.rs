use crate::board::*;
use crate::piece::{Color, PieceType};
use crate::zobrist::hash_board;
use std::time::Instant;

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
    let mut mg_score = 0i32; // Middlegame score
    let mut eg_score = 0i32; // Endgame score

    // Determine game phase (0 = endgame, 256 = opening)
    let phase = compute_phase(board);

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
                let mat = piece_type.value();
                mg_score += sign * mat;
                eg_score += sign * mat;

                // Positional value from piece-square tables
                let table_sq = if ci == 0 { sq_idx } else { mirror_square(sq_idx) } as usize;
                let mg_pst = match pi {
                    0 => KING_MIDDLEGAME_TABLE[table_sq],
                    1 => QUEEN_TABLE[table_sq],
                    2 => ROOK_TABLE[table_sq],
                    3 => BISHOP_TABLE[table_sq],
                    4 => KNIGHT_TABLE[table_sq],
                    5 => PAWN_TABLE[table_sq],
                    _ => 0,
                };
                let eg_pst = match pi {
                    0 => KING_ENDGAME_TABLE[table_sq],
                    _ => mg_pst, // Use same for non-king (good enough)
                };
                mg_score += sign * mg_pst;
                eg_score += sign * eg_pst;
            }
        }
    }

    // Bonus for bishop pair
    if count_bits(board.bitboards[0][3]) >= 2 { mg_score += 30; eg_score += 50; }
    if count_bits(board.bitboards[1][3]) >= 2 { mg_score -= 30; eg_score -= 50; }

    // Mobility bonus
    let white_mobility = count_mobility(board, Color::White);
    let black_mobility = count_mobility(board, Color::Black);
    mg_score += (white_mobility - black_mobility) * 5;
    eg_score += (white_mobility - black_mobility) * 3;

    // ── Pawn structure ──
    let (w_pawn_mg, w_pawn_eg) = evaluate_pawn_structure(board, Color::White);
    let (b_pawn_mg, b_pawn_eg) = evaluate_pawn_structure(board, Color::Black);
    mg_score += w_pawn_mg - b_pawn_mg;
    eg_score += w_pawn_eg - b_pawn_eg;

    // ── King safety (middlegame only — scale by phase) ──
    let w_king_safety = evaluate_king_safety(board, Color::White);
    let b_king_safety = evaluate_king_safety(board, Color::Black);
    mg_score += w_king_safety - b_king_safety;

    // ── Rook on open / semi-open files ──
    let w_rook_bonus = evaluate_rooks(board, Color::White);
    let b_rook_bonus = evaluate_rooks(board, Color::Black);
    mg_score += w_rook_bonus - b_rook_bonus;
    eg_score += w_rook_bonus - b_rook_bonus;

    // ── Tapered evaluation: interpolate between middlegame and endgame ──
    let score = (mg_score * phase + eg_score * (256 - phase)) / 256;

    // Return score relative to current side
    match board.side_to_move {
        Color::White => score,
        Color::Black => -score,
    }
}

/// Compute game phase: 256 = full middlegame, 0 = pure endgame.
fn compute_phase(board: &Board) -> i32 {
    // Phase value by piece: Q=4, R=2, B=1, N=1
    // Max total = 2*(4+2+2+1+1) = 24 → scale to 256
    let mut phase = 0i32;
    for ci in 0..2 {
        phase += count_bits(board.bitboards[ci][1]) * 4; // Queens
        phase += count_bits(board.bitboards[ci][2]) * 2; // Rooks
        phase += count_bits(board.bitboards[ci][3]) * 1; // Bishops
        phase += count_bits(board.bitboards[ci][4]) * 1; // Knights
    }
    // Clamp and scale: max phase = 24 → 256
    (phase.min(24) * 256) / 24
}

/// Evaluate pawn structure: doubled, isolated, backward, and passed pawns.
fn evaluate_pawn_structure(board: &Board, color: Color) -> (i32, i32) {
    let ci = color_index(color);
    let own_pawns = board.bitboards[ci][5];
    let opp_pawns = board.bitboards[1 - ci][5];
    let mut mg = 0i32;
    let mut eg = 0i32;

    for file in 0..8u8 {
        let file_mask = FILE_MASKS[file as usize];
        let own_on_file = own_pawns & file_mask;
        let own_count = count_bits(own_on_file);

        // Doubled pawns
        if own_count > 1 {
            mg -= 10 * (own_count - 1);
            eg -= 20 * (own_count - 1);
        }

        // Isolated pawns (no friendly pawns on adjacent files)
        if own_count > 0 {
            let adj = adjacent_files_mask(file);
            if own_pawns & adj == 0 {
                mg -= 15;
                eg -= 20;
            }
        }
    }

    // Passed pawns (no opponent pawns can block or capture it)
    let mut bb = own_pawns;
    while bb != 0 {
        let sq = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        let file = file_of(sq);
        let rank = rank_of(sq);

        // Build a mask of squares ahead on same + adjacent files
        let passed_mask = passed_pawn_mask(color, sq);
        if opp_pawns & passed_mask == 0 {
            // Bonus scales with advancement
            let advancement = if color == Color::White { rank } else { 7 - rank };
            let bonus = PASSED_PAWN_BONUS[advancement as usize];
            mg += bonus / 2;
            eg += bonus;
        }

        // Backward pawn: pawn cannot advance because the stop square is attacked
        // by enemy pawns, and no friendly pawns on adjacent files can support it
        let stop_sq = if color == Color::White { sq + 8 } else { sq.wrapping_sub(8) };
        if stop_sq < 64 {
            let adj = adjacent_files_mask(file);
            let behind_mask = behind_ranks_mask(color, rank);
            let supporters = own_pawns & adj & behind_mask;
            if supporters == 0 {
                // Check if stop square is controlled by enemy pawns
                let enemy_pawn_attacks = pawn_attacks_to(stop_sq, color);
                if opp_pawns & enemy_pawn_attacks != 0 {
                    mg -= 10;
                    eg -= 15;
                }
            }
        }
    }

    (mg, eg)
}

/// King safety: pawn shield + open files near king.
fn evaluate_king_safety(board: &Board, color: Color) -> i32 {
    let ci = color_index(color);
    let king_sq = if color == Color::White { board.white_king_sq } else { board.black_king_sq };
    let king_file = file_of(king_sq);
    let king_rank = rank_of(king_sq);
    let own_pawns = board.bitboards[ci][5];
    let mut safety = 0i32;

    // Pawn shield bonus: pawns on ranks 2/3 in front of the king
    let shield_files = if king_file == 0 { 0..=1u8 }
        else if king_file == 7 { 6..=7u8 }
        else { (king_file - 1)..=(king_file + 1) };

    for f in shield_files {
        let file_mask = FILE_MASKS[f as usize];
        let shield_pawns = own_pawns & file_mask;
        if shield_pawns != 0 {
            // Pawn exists on this file — bonus for being close
            let pawn_sq = if color == Color::White {
                shield_pawns.trailing_zeros() as u8
            } else {
                (63 - shield_pawns.leading_zeros()) as u8
            };
            let dist = if color == Color::White {
                rank_of(pawn_sq) as i32 - king_rank as i32
            } else {
                king_rank as i32 - rank_of(pawn_sq) as i32
            };
            if dist == 1 { safety += 15; }
            else if dist == 2 { safety += 8; }
        } else {
            // Open file near king — penalty
            safety -= 20;
        }
    }

    safety
}

/// Rook on open / semi-open file bonus.
fn evaluate_rooks(board: &Board, color: Color) -> i32 {
    let ci = color_index(color);
    let own_pawns = board.bitboards[ci][5];
    let opp_pawns = board.bitboards[1 - ci][5];
    let mut bonus = 0i32;

    let mut rooks = board.bitboards[ci][2];
    while rooks != 0 {
        let sq = rooks.trailing_zeros() as u8;
        rooks &= rooks - 1;
        let file_mask = FILE_MASKS[file_of(sq) as usize];

        if own_pawns & file_mask == 0 {
            if opp_pawns & file_mask == 0 {
                bonus += 25; // Open file
            } else {
                bonus += 12; // Semi-open file
            }
        }
    }

    bonus
}

// ── Helper masks for pawn structure ──

const FILE_MASKS: [u64; 8] = [
    0x0101_0101_0101_0101, // a-file
    0x0202_0202_0202_0202, // b-file
    0x0404_0404_0404_0404, // c-file
    0x0808_0808_0808_0808, // d-file
    0x1010_1010_1010_1010, // e-file
    0x2020_2020_2020_2020, // f-file
    0x4040_4040_4040_4040, // g-file
    0x8080_8080_8080_8080, // h-file
];

fn adjacent_files_mask(file: u8) -> u64 {
    let mut mask = 0u64;
    if file > 0 { mask |= FILE_MASKS[(file - 1) as usize]; }
    if file < 7 { mask |= FILE_MASKS[(file + 1) as usize]; }
    mask
}

/// Ranks behind a pawn (inclusive of its own rank) for backward pawn detection.
fn behind_ranks_mask(color: Color, rank: u8) -> u64 {
    match color {
        Color::White => {
            // Ranks 0..=rank
            if rank >= 7 { u64::MAX } else { (1u64 << ((rank as u32 + 1) * 8)) - 1 }
        }
        Color::Black => {
            // Ranks rank..=7
            if rank == 0 { u64::MAX } else { !((1u64 << (rank as u32 * 8)) - 1) }
        }
    }
}

/// Squares that enemy pawns must occupy to block a passed pawn:
/// all squares ahead on the same file + adjacent files.
fn passed_pawn_mask(color: Color, sq: u8) -> u64 {
    let file = file_of(sq);
    let rank = rank_of(sq);
    let files = {
        let mut m = FILE_MASKS[file as usize];
        if file > 0 { m |= FILE_MASKS[(file - 1) as usize]; }
        if file < 7 { m |= FILE_MASKS[(file + 1) as usize]; }
        m
    };
    match color {
        Color::White => {
            if rank >= 7 { 0 } else { files & !((1u64 << ((rank as u32 + 1) * 8)) - 1) }
        }
        Color::Black => {
            if rank == 0 { 0 } else { files & ((1u64 << (rank as u32 * 8)) - 1) }
        }
    }
}

/// Which squares could an enemy pawn be on to attack `sq`?
fn pawn_attacks_to(sq: u8, defender_color: Color) -> u64 {
    let b = bit(sq);
    match defender_color {
        Color::White => {
            // Enemy = black: black pawns on rank above, adjacent files
            let mut m = 0u64;
            if file_of(sq) > 0 { m |= b << 7; }
            if file_of(sq) < 7 { m |= b << 9; }
            m
        }
        Color::Black => {
            let mut m = 0u64;
            if file_of(sq) > 0 { m |= b >> 9; }
            if file_of(sq) < 7 { m |= b >> 7; }
            m
        }
    }
}

const PASSED_PAWN_BONUS: [i32; 8] = [0, 5, 10, 20, 40, 70, 120, 0]; // By rank advancement

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

/// Fixed-size transposition table (≈16 MB default — 2^20 entries × 16 bytes).
/// Accessed only during single-threaded search — no locking needed.
const TT_SIZE: usize = 1 << 20; // ~1 million entries

/// Thread-local search context that holds the TT, killers, and timing info.
/// Created once per `search_best_move` call and passed down by reference.
struct SearchContext {
    tt: Vec<TTEntry>,
    killers: [[Option<crate::moves::Move>; 2]; MAX_KILLER_DEPTH],
    start_time: Instant,
    time_limit_ms: u64,
    nodes: u64,
    stopped: bool,
}

impl SearchContext {
    fn new(time_limit_ms: u64) -> Self {
        Self {
            tt: vec![TTEntry::default(); TT_SIZE],
            killers: [[None; 2]; MAX_KILLER_DEPTH],
            start_time: Instant::now(),
            time_limit_ms,
            nodes: 0,
            stopped: false,
        }
    }

    /// Reuse existing TT but clear killers for a new iterative-deepening pass.
    fn clear_killers(&mut self) {
        for k in self.killers.iter_mut() {
            *k = [None; 2];
        }
    }

    /// Check if we've run out of time (checked every 2048 nodes).
    #[inline]
    fn check_time(&mut self) {
        if self.time_limit_ms == 0 { return; }
        self.nodes += 1;
        if self.nodes & 2047 == 0 {
            if self.start_time.elapsed().as_millis() as u64 >= self.time_limit_ms {
                self.stopped = true;
            }
        }
    }
}

fn tt_index(hash: u64) -> usize {
    (hash as usize) % TT_SIZE
}

fn tt_probe(ctx: &SearchContext, hash: u64) -> Option<TTEntry> {
    let entry = ctx.tt[tt_index(hash)];
    if entry.hash == hash {
        return Some(entry);
    }
    None
}

fn tt_store(ctx: &mut SearchContext, hash: u64, depth: u8, score: i32, flag: TTFlag, best_move: Option<crate::moves::Move>) {
    let idx = tt_index(hash);
    // Always-replace strategy; prefer deeper entries
    if depth >= ctx.tt[idx].depth || ctx.tt[idx].hash != hash {
        ctx.tt[idx] = TTEntry { hash, depth, score, flag, best_move };
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

/// Killer moves (indexed by depth, 2 slots each) — stored in SearchContext.
const MAX_KILLER_DEPTH: usize = 64;

fn is_killer(ctx: &SearchContext, mv: &crate::moves::Move, depth: usize) -> bool {
    if depth >= MAX_KILLER_DEPTH { return false; }
    ctx.killers[depth][0].map_or(false, |k| k == *mv) ||
    ctx.killers[depth][1].map_or(false, |k| k == *mv)
}

fn store_killer(ctx: &mut SearchContext, mv: &crate::moves::Move, depth: usize) {
    if depth >= MAX_KILLER_DEPTH { return; }
    if ctx.killers[depth][0] != Some(*mv) {
        ctx.killers[depth][1] = ctx.killers[depth][0];
        ctx.killers[depth][0] = Some(*mv);
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
    ctx: &SearchContext,
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
        } else if is_killer(ctx, mv, depth) {
            priority = -80_000;
        }

        priority
    });
}


// ═══════════════════════════════════════════════════════════════════════
// Principal Search: Iterative Deepening + Alpha-Beta + TT + Ordering
// ═══════════════════════════════════════════════════════════════════════

/// Find the best move using iterative deepening alpha-beta search.
/// `time_limit_ms` — soft time limit in milliseconds (0 = unlimited).
pub fn search_best_move(board: &Board, depth: u8) -> Option<(crate::moves::Move, i32)> {
    search_best_move_timed(board, depth, 0)
}

/// Same as `search_best_move` but with an explicit time budget.
pub fn search_best_move_timed(board: &Board, depth: u8, time_limit_ms: u64) -> Option<(crate::moves::Move, i32)> {
    use crate::moves::{generate_legal_moves, make_move};

    let moves = generate_legal_moves(board);
    if moves.is_empty() {
        return None;
    }

    let mut ctx = SearchContext::new(time_limit_ms);
    let hash = hash_board(board);
    let mut best_move = moves[0];
    let mut best_score = i32::MIN + 1;

    // Iterative deepening: search depth 1, 2, … up to requested depth.
    // Each iteration warms the TT for the next one.
    for d in 1..=depth {
        ctx.clear_killers();
        let mut current_best = moves[0];
        let mut current_score = i32::MIN + 1;

        // Order root moves using TT from previous iteration
        let tt_move = tt_probe(&ctx, hash).and_then(|e| e.best_move);
        let mut ordered = moves.clone();
        order_moves(&mut ordered, board, tt_move, d as usize, &ctx);

        let mut aborted = false;
        for mv in &ordered {
            let mut new_board = board.clone();
            if make_move(&mut new_board, mv) {
                let score = -alpha_beta(&new_board, d - 1, -i32::MAX + 1, -current_score.max(i32::MIN + 1), &mut ctx);
                if ctx.stopped { aborted = true; break; }
                if score > current_score {
                    current_score = score;
                    current_best = *mv;
                }
            }
        }

        if aborted { break; } // Keep last complete iteration result

        best_move = current_best;
        best_score = current_score;

        // Store root position in TT
        tt_store(&mut ctx, hash, d, best_score, TTFlag::Exact, Some(best_move));

        // If we found a mate, stop early
        if best_score.abs() > 18000 { break; }
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

    let mut ctx = SearchContext::new(0);

    // Use iterative deepening for each candidate so TT warms up
    let mut scored: Vec<(crate::moves::Move, i32)> = Vec::new();
    for mv in &moves {
        let mut new_board = board.clone();
        if make_move(&mut new_board, mv) {
            let score = -alpha_beta(
                &new_board,
                depth.saturating_sub(1),
                i32::MIN + 1,
                i32::MAX - 1,
                &mut ctx,
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
                extract_pv(&pv_board, depth.saturating_sub(1), &mut pv, &ctx);
            }
            (mv, score, pv)
        })
        .collect()
}

/// Extract the principal variation from the transposition table.
fn extract_pv(board: &Board, max_depth: u8, pv: &mut Vec<crate::moves::Move>, ctx: &SearchContext) {
    use crate::moves::make_move;

    if max_depth == 0 || pv.len() >= 10 {
        return;
    }
    let hash = hash_board(board);
    if let Some(entry) = tt_probe(ctx, hash) {
        if let Some(mv) = entry.best_move {
            pv.push(mv);
            let mut next = board.clone();
            if make_move(&mut next, &mv) {
                extract_pv(&next, max_depth - 1, pv, ctx);
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════
// Alpha-Beta with Null-Move Pruning and Late-Move Reductions
// ═══════════════════════════════════════════════════════════════════════

fn alpha_beta(board: &Board, depth: u8, mut alpha: i32, beta: i32, ctx: &mut SearchContext) -> i32 {
    use crate::moves::{generate_legal_moves, make_move};

    // ── Time check ──
    ctx.check_time();
    if ctx.stopped { return 0; }

    // ── Transposition table probe ──
    let hash = hash_board(board);
    if let Some(entry) = tt_probe(ctx, hash) {
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
        return quiescence_search(board, alpha, beta, 6, ctx);
    }

    let in_check = board.is_in_check();

    // ── Null-move pruning ──
    if !in_check && depth >= 3 {
        let non_pawn = count_non_pawn_material(board);
        if non_pawn > 600 {
            let mut null_board = board.clone();
            null_board.side_to_move = board.side_to_move.opposite();
            null_board.en_passant_square = None;
            let r = if depth > 6 { 3 } else { 2 };
            let null_score = -alpha_beta(&null_board, depth - 1 - r, -beta, -beta + 1, ctx);
            if ctx.stopped { return 0; }
            if null_score >= beta {
                return beta;
            }
        }
    }

    // ── Generate & order moves ──
    let mut moves = generate_legal_moves(board);
    if moves.is_empty() {
        if in_check {
            return -19000 - depth as i32;
        }
        return 0;
    }

    let tt_move = tt_probe(ctx, hash).and_then(|e| e.best_move);
    order_moves(&mut moves, board, tt_move, depth as usize, ctx);

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

        let is_capture = board.piece_at(mv.to).is_some() || mv.is_en_passant;
        let gives_check = new_board.is_in_check();

        if moves_searched >= 4
            && depth >= 3
            && !is_capture
            && !in_check
            && !gives_check
            && mv.promotion.is_none()
        {
            let reduced = -alpha_beta(&new_board, depth - 2, -alpha - 1, -alpha, ctx);
            if ctx.stopped { return 0; }
            if reduced > alpha {
                score = -alpha_beta(&new_board, depth - 1, -beta, -alpha, ctx);
            } else {
                score = reduced;
            }
        } else {
            score = -alpha_beta(&new_board, depth - 1, -beta, -alpha, ctx);
        }

        if ctx.stopped { return 0; }
        moves_searched += 1;

        if score > best_score {
            best_score = score;
            best_move = *mv;
        }
        if score > alpha {
            alpha = score;
        }
        if alpha >= beta {
            if !is_capture {
                store_killer(ctx, mv, depth as usize);
            }
            tt_store(ctx, hash, depth, best_score, TTFlag::LowerBound, Some(best_move));
            return beta;
        }
    }

    let flag = if best_score <= original_alpha {
        TTFlag::UpperBound
    } else {
        TTFlag::Exact
    };
    tt_store(ctx, hash, depth, best_score, flag, Some(best_move));

    best_score
}

/// Quiescence search to avoid horizon effect — only searches captures.
fn quiescence_search(board: &Board, mut alpha: i32, beta: i32, max_depth: u8, ctx: &mut SearchContext) -> i32 {
    use crate::moves::{generate_legal_moves, make_move};

    ctx.check_time();
    if ctx.stopped { return 0; }

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
            let score = -quiescence_search(&new_board, -beta, -alpha, max_depth - 1, ctx);
            if ctx.stopped { return 0; }
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
