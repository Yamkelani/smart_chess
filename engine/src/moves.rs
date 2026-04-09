use crate::board::*;
use crate::piece::{Color, Piece, PieceType};
use serde::{Deserialize, Serialize};

/// Represents a chess move
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Move {
    pub from: u8,
    pub to: u8,
    pub promotion: Option<PieceType>,
    pub is_castling: bool,
    pub is_en_passant: bool,
}

impl Move {
    pub fn new(from: u8, to: u8) -> Self {
        Self {
            from,
            to,
            promotion: None,
            is_castling: false,
            is_en_passant: false,
        }
    }

    pub fn with_promotion(from: u8, to: u8, promotion: PieceType) -> Self {
        Self {
            from,
            to,
            promotion: Some(promotion),
            is_castling: false,
            is_en_passant: false,
        }
    }

    pub fn castling(from: u8, to: u8) -> Self {
        Self {
            from,
            to,
            promotion: None,
            is_castling: true,
            is_en_passant: false,
        }
    }

    pub fn en_passant(from: u8, to: u8) -> Self {
        Self {
            from,
            to,
            promotion: None,
            is_castling: false,
            is_en_passant: true,
        }
    }

    /// Convert to UCI notation (e.g., "e2e4", "e7e8q")
    pub fn to_uci(&self) -> String {
        let mut s = format!("{}{}", square_name(self.from), square_name(self.to));
        if let Some(promo) = self.promotion {
            s.push(match promo {
                PieceType::Queen => 'q',
                PieceType::Rook => 'r',
                PieceType::Bishop => 'b',
                PieceType::Knight => 'n',
                _ => unreachable!(),
            });
        }
        s
    }

    /// Parse from UCI notation
    pub fn from_uci(uci: &str) -> Option<Self> {
        if uci.len() < 4 {
            return None;
        }
        let from = square_from_name(&uci[0..2])?;
        let to = square_from_name(&uci[2..4])?;
        let promotion = if uci.len() > 4 {
            match uci.chars().nth(4)? {
                'q' => Some(PieceType::Queen),
                'r' => Some(PieceType::Rook),
                'b' => Some(PieceType::Bishop),
                'n' => Some(PieceType::Knight),
                _ => None,
            }
        } else {
            None
        };

        Some(Self {
            from,
            to,
            promotion,
            is_castling: false,
            is_en_passant: false,
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveInfo {
    pub uci: String,
    pub from_square: String,
    pub to_square: String,
    pub piece: String,
    pub captured: Option<String>,
    pub promotion: Option<String>,
    pub is_check: bool,
    pub is_castling: bool,
}

/// Generate all legal moves for the current position
pub fn generate_legal_moves(board: &Board) -> Vec<Move> {
    let pseudo_moves = generate_pseudo_legal_moves(board);
    let mut legal_moves = Vec::with_capacity(pseudo_moves.len());

    for mv in pseudo_moves {
        let mut test_board = board.clone();
        if make_move(&mut test_board, &mv) {
            // Move is legal if king is not in check after the move
            legal_moves.push(mv);
        }
    }

    legal_moves
}

/// Generate pseudo-legal moves (may leave king in check)
fn generate_pseudo_legal_moves(board: &Board) -> Vec<Move> {
    let mut moves = Vec::with_capacity(64);
    let side = board.side_to_move;
    let ci = match side { Color::White => 0, Color::Black => 1 };
    let own_pieces = board.pieces_of(side);
    let enemy_pieces = board.pieces_of(side.opposite());

    // Generate moves for each piece type
    generate_pawn_moves(board, side, own_pieces, enemy_pieces, &mut moves);
    generate_knight_moves(board, ci, own_pieces, &mut moves);
    generate_bishop_moves(board, ci, own_pieces, &mut moves);
    generate_rook_moves(board, ci, own_pieces, &mut moves);
    generate_queen_moves(board, ci, own_pieces, &mut moves);
    generate_king_moves(board, side, ci, own_pieces, &mut moves);
    generate_castling_moves(board, side, &mut moves);

    moves
}

fn generate_pawn_moves(board: &Board, side: Color, own: u64, enemy: u64, moves: &mut Vec<Move>) {
    let ci = match side { Color::White => 0, Color::Black => 1 };
    let pawns = board.bitboards[ci][5];
    let empty = !board.all_pieces;

    let (direction, start_rank, promo_rank): (i8, u8, u8) = match side {
        Color::White => (1, 1, 7),
        Color::Black => (-1, 6, 0),
    };

    let mut bb = pawns;
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        let rank = rank_of(sq_idx);
        let file = file_of(sq_idx);

        // Single push
        let target_rank = (rank as i8 + direction) as u8;
        if target_rank < 8 {
            let target = sq(target_rank, file);
            if empty & bit(target) != 0 {
                if target_rank == promo_rank {
                    // Promotion
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Queen));
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Rook));
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Bishop));
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Knight));
                } else {
                    moves.push(Move::new(sq_idx, target));

                    // Double push from starting rank
                    if rank == start_rank {
                        let double_rank = (rank as i8 + 2 * direction) as u8;
                        let double_target = sq(double_rank, file);
                        if empty & bit(double_target) != 0 {
                            moves.push(Move::new(sq_idx, double_target));
                        }
                    }
                }
            }
        }

        // Captures
        for df in [-1i8, 1] {
            let f = file as i8 + df;
            if f < 0 || f >= 8 { continue; }
            let target = sq(target_rank, f as u8);

            // Normal capture
            if enemy & bit(target) != 0 {
                if target_rank == promo_rank {
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Queen));
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Rook));
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Bishop));
                    moves.push(Move::with_promotion(sq_idx, target, PieceType::Knight));
                } else {
                    moves.push(Move::new(sq_idx, target));
                }
            }

            // En passant capture
            if let Some(ep) = board.en_passant_square {
                if target == ep {
                    moves.push(Move::en_passant(sq_idx, target));
                }
            }
        }
    }
}

fn generate_knight_moves(board: &Board, ci: usize, own: u64, moves: &mut Vec<Move>) {
    let mut bb = board.bitboards[ci][4];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        let attacks = knight_attacks(sq_idx) & !own;
        let mut atk = attacks;
        while atk != 0 {
            let target = atk.trailing_zeros() as u8;
            atk &= atk - 1;
            moves.push(Move::new(sq_idx, target));
        }
    }
}

fn generate_bishop_moves(board: &Board, ci: usize, own: u64, moves: &mut Vec<Move>) {
    let mut bb = board.bitboards[ci][3];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        let attacks = bishop_attacks(sq_idx, board.all_pieces) & !own;
        let mut atk = attacks;
        while atk != 0 {
            let target = atk.trailing_zeros() as u8;
            atk &= atk - 1;
            moves.push(Move::new(sq_idx, target));
        }
    }
}

fn generate_rook_moves(board: &Board, ci: usize, own: u64, moves: &mut Vec<Move>) {
    let mut bb = board.bitboards[ci][2];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        let attacks = rook_attacks(sq_idx, board.all_pieces) & !own;
        let mut atk = attacks;
        while atk != 0 {
            let target = atk.trailing_zeros() as u8;
            atk &= atk - 1;
            moves.push(Move::new(sq_idx, target));
        }
    }
}

fn generate_queen_moves(board: &Board, ci: usize, own: u64, moves: &mut Vec<Move>) {
    let mut bb = board.bitboards[ci][1];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        let rook_atk = rook_attacks(sq_idx, board.all_pieces);
        let bishop_atk = bishop_attacks(sq_idx, board.all_pieces);
        let attacks = (rook_atk | bishop_atk) & !own;
        let mut atk = attacks;
        while atk != 0 {
            let target = atk.trailing_zeros() as u8;
            atk &= atk - 1;
            moves.push(Move::new(sq_idx, target));
        }
    }
}

fn generate_king_moves(board: &Board, _side: Color, ci: usize, own: u64, moves: &mut Vec<Move>) {
    let mut bb = board.bitboards[ci][0];
    while bb != 0 {
        let sq_idx = bb.trailing_zeros() as u8;
        bb &= bb - 1;
        let attacks = king_attacks(sq_idx) & !own;
        let mut atk = attacks;
        while atk != 0 {
            let target = atk.trailing_zeros() as u8;
            atk &= atk - 1;
            moves.push(Move::new(sq_idx, target));
        }
    }
}

fn generate_castling_moves(board: &Board, side: Color, moves: &mut Vec<Move>) {
    let enemy = side.opposite();

    match side {
        Color::White => {
            // Kingside castling
            if board.castling_rights.white_kingside {
                let path_clear = board.all_pieces & (bit(5) | bit(6)) == 0;
                let path_safe = !board.is_square_attacked(4, enemy)
                    && !board.is_square_attacked(5, enemy)
                    && !board.is_square_attacked(6, enemy);
                if path_clear && path_safe {
                    moves.push(Move::castling(4, 6));
                }
            }
            // Queenside castling
            if board.castling_rights.white_queenside {
                let path_clear = board.all_pieces & (bit(1) | bit(2) | bit(3)) == 0;
                let path_safe = !board.is_square_attacked(4, enemy)
                    && !board.is_square_attacked(3, enemy)
                    && !board.is_square_attacked(2, enemy);
                if path_clear && path_safe {
                    moves.push(Move::castling(4, 2));
                }
            }
        }
        Color::Black => {
            // Kingside castling
            if board.castling_rights.black_kingside {
                let path_clear = board.all_pieces & (bit(61) | bit(62)) == 0;
                let path_safe = !board.is_square_attacked(60, enemy)
                    && !board.is_square_attacked(61, enemy)
                    && !board.is_square_attacked(62, enemy);
                if path_clear && path_safe {
                    moves.push(Move::castling(60, 62));
                }
            }
            // Queenside castling
            if board.castling_rights.black_queenside {
                let path_clear = board.all_pieces & (bit(57) | bit(58) | bit(59)) == 0;
                let path_safe = !board.is_square_attacked(60, enemy)
                    && !board.is_square_attacked(59, enemy)
                    && !board.is_square_attacked(58, enemy);
                if path_clear && path_safe {
                    moves.push(Move::castling(60, 58));
                }
            }
        }
    }
}

/// Execute a move on the board. Returns false if the move leaves the king in check (illegal).
pub fn make_move(board: &mut Board, mv: &Move) -> bool {
    let side = board.side_to_move;
    let enemy = side.opposite();
    let ci = match side { Color::White => 0, Color::Black => 1 };

    let piece = match board.piece_at(mv.from) {
        Some(p) => p,
        None => return false,
    };

    // Detect capture BEFORE moving (for halfmove clock)
    let is_capture = mv.is_en_passant || board.piece_at(mv.to).is_some();

    // Handle en passant capture
    if mv.is_en_passant {
        let captured_sq = match side {
            Color::White => mv.to - 8,
            Color::Black => mv.to + 8,
        };
        board.remove_piece(captured_sq);
    }

    // Handle castling - move the rook
    if mv.is_castling {
        let (rook_from, rook_to) = match mv.to {
            6 => (7, 5),   // White kingside
            2 => (0, 3),   // White queenside
            62 => (63, 61), // Black kingside
            58 => (56, 59), // Black queenside
            _ => return false,
        };
        let rook = board.piece_at(rook_from);
        board.remove_piece(rook_from);
        if let Some(r) = rook {
            board.set_piece(rook_to, r);
        }
    }

    // Remove captured piece
    if !mv.is_en_passant {
        board.remove_piece(mv.to);
    }

    // Move the piece
    board.remove_piece(mv.from);
    if let Some(promo) = mv.promotion {
        board.set_piece(mv.to, Piece::new(promo, side));
    } else {
        board.set_piece(mv.to, piece);
    }

    // Update en passant square
    board.en_passant_square = None;
    if piece.piece_type == PieceType::Pawn {
        let from_rank = rank_of(mv.from);
        let to_rank = rank_of(mv.to);
        if (from_rank as i8 - to_rank as i8).unsigned_abs() == 2 {
            let ep_rank = (from_rank + to_rank) / 2;
            board.en_passant_square = Some(sq(ep_rank, file_of(mv.from)));
        }
    }

    // Update castling rights
    // If king moves, lose both castling rights
    if piece.piece_type == PieceType::King {
        match side {
            Color::White => {
                board.castling_rights.white_kingside = false;
                board.castling_rights.white_queenside = false;
            }
            Color::Black => {
                board.castling_rights.black_kingside = false;
                board.castling_rights.black_queenside = false;
            }
        }
    }
    // If rook moves or is captured, lose that side's castling right
    if mv.from == 0 || mv.to == 0 { board.castling_rights.white_queenside = false; }
    if mv.from == 7 || mv.to == 7 { board.castling_rights.white_kingside = false; }
    if mv.from == 56 || mv.to == 56 { board.castling_rights.black_queenside = false; }
    if mv.from == 63 || mv.to == 63 { board.castling_rights.black_kingside = false; }

    // Update halfmove clock
    if piece.piece_type == PieceType::Pawn || is_capture {
        board.halfmove_clock = 0;
    } else {
        board.halfmove_clock += 1;
    }

    // Update fullmove number
    if side == Color::Black {
        board.fullmove_number += 1;
    }

    // Switch side
    board.side_to_move = enemy;

    // Update king position cache
    if piece.piece_type == PieceType::King {
        match side {
            Color::White => board.white_king_sq = mv.to,
            Color::Black => board.black_king_sq = mv.to,
        }
    }

    // Verify king is not in check (legality check)
    let king_sq = match side {
        Color::White => board.white_king_sq,
        Color::Black => board.black_king_sq,
    };
    !board.is_square_attacked(king_sq, enemy)
}
