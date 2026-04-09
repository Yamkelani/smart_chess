/// Zobrist hashing for transposition table support.
///
/// Generates random 64-bit keys for every (piece, color, square) combination
/// plus castling rights, en-passant file, and side to move.  These are XOR-ed
/// together to produce a position hash that can be incrementally updated.

use crate::board::Board;
use crate::piece::Color;

/// Pre-computed Zobrist keys (initialised once at startup via `lazy_static`).
pub struct ZobristKeys {
    /// keys[color 0..2][piece 0..6][square 0..64]
    pub pieces: [[[u64; 64]; 6]; 2],
    /// One key per castling combination (4 bits → 16 entries)
    pub castling: [u64; 16],
    /// One key per en-passant file (0..8); index 8 = no EP
    pub en_passant: [u64; 9],
    /// XOR when it is black's turn
    pub side: u64,
}

impl ZobristKeys {
    /// Deterministic PRNG (xorshift64) seeded so hashes are reproducible.
    fn new() -> Self {
        let mut state: u64 = 0x3D_C0DE_20B1_A57Bu64.wrapping_add(0xBEEF_CAFE);
        // Fixed seed that spells out the intent ;)
        // Using a simple xorshift64* to fill all keys.
        let mut next = || -> u64 {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };

        let mut pieces = [[[0u64; 64]; 6]; 2];
        for c in 0..2 {
            for p in 0..6 {
                for sq in 0..64 {
                    pieces[c][p][sq] = next();
                }
            }
        }

        let mut castling = [0u64; 16];
        for i in 0..16 {
            castling[i] = next();
        }

        let mut en_passant = [0u64; 9];
        for i in 0..9 {
            en_passant[i] = next();
        }

        let side = next();

        Self { pieces, castling, en_passant, side }
    }
}

lazy_static::lazy_static! {
    pub static ref ZOBRIST: ZobristKeys = ZobristKeys::new();
}

/// Compute the full Zobrist hash for a board position from scratch.
pub fn hash_board(board: &Board) -> u64 {
    let mut h: u64 = 0;

    // Piece placement
    for ci in 0..2 {
        for pi in 0..6 {
            let mut bb = board.bitboards[ci][pi];
            while bb != 0 {
                let sq = bb.trailing_zeros() as usize;
                bb &= bb - 1;
                h ^= ZOBRIST.pieces[ci][pi][sq];
            }
        }
    }

    // Castling rights → 4-bit index
    let cr = &board.castling_rights;
    let ci = (cr.white_kingside as usize)
        | ((cr.white_queenside as usize) << 1)
        | ((cr.black_kingside as usize) << 2)
        | ((cr.black_queenside as usize) << 3);
    h ^= ZOBRIST.castling[ci];

    // En-passant file (0–7) or 8 for none
    let ep_idx = board.en_passant_square
        .map(|sq| (sq % 8) as usize)
        .unwrap_or(8);
    h ^= ZOBRIST.en_passant[ep_idx];

    // Side to move
    if board.side_to_move == Color::Black {
        h ^= ZOBRIST.side;
    }

    h
}
