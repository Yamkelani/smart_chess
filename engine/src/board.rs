use crate::piece::{Color, Piece, PieceType};
use serde::{Deserialize, Serialize};

/// Bitboard-based chess board representation for maximum performance.
/// Each piece type + color combination gets its own 64-bit bitboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    // Bitboards for each piece type and color
    // Index: [color][piece_type] where color: 0=White, 1=Black
    // piece_type: 0=King, 1=Queen, 2=Rook, 3=Bishop, 4=Knight, 5=Pawn
    pub bitboards: [[u64; 6]; 2],

    // Combined occupancy bitboards
    pub white_pieces: u64,
    pub black_pieces: u64,
    pub all_pieces: u64,

    // Game state
    pub side_to_move: Color,
    pub castling_rights: CastlingRights,
    pub en_passant_square: Option<u8>, // Square index (0-63)
    pub halfmove_clock: u32,
    pub fullmove_number: u32,

    // King positions cached for quick access
    pub white_king_sq: u8,
    pub black_king_sq: u8,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CastlingRights {
    pub white_kingside: bool,
    pub white_queenside: bool,
    pub black_kingside: bool,
    pub black_queenside: bool,
}

impl CastlingRights {
    pub fn all() -> Self {
        Self {
            white_kingside: true,
            white_queenside: true,
            black_kingside: true,
            black_queenside: true,
        }
    }

    pub fn none() -> Self {
        Self {
            white_kingside: false,
            white_queenside: false,
            black_kingside: false,
            black_queenside: false,
        }
    }
}

/// Square index helpers
pub fn sq(rank: u8, file: u8) -> u8 {
    rank * 8 + file
}

pub fn rank_of(square: u8) -> u8 {
    square / 8
}

pub fn file_of(square: u8) -> u8 {
    square % 8
}

pub fn bit(square: u8) -> u64 {
    1u64 << square
}

pub fn square_name(square: u8) -> String {
    let file = (b'a' + file_of(square)) as char;
    let rank = (b'1' + rank_of(square)) as char;
    format!("{}{}", file, rank)
}

pub fn square_from_name(name: &str) -> Option<u8> {
    let chars: Vec<char> = name.chars().collect();
    if chars.len() != 2 {
        return None;
    }
    let file = (chars[0] as u8).wrapping_sub(b'a');
    let rank = (chars[1] as u8).wrapping_sub(b'1');
    if file < 8 && rank < 8 {
        Some(sq(rank, file))
    } else {
        None
    }
}

pub fn piece_type_index(pt: PieceType) -> usize {
    match pt {
        PieceType::King => 0,
        PieceType::Queen => 1,
        PieceType::Rook => 2,
        PieceType::Bishop => 3,
        PieceType::Knight => 4,
        PieceType::Pawn => 5,
    }
}

fn piece_type_from_index(idx: usize) -> PieceType {
    match idx {
        0 => PieceType::King,
        1 => PieceType::Queen,
        2 => PieceType::Rook,
        3 => PieceType::Bishop,
        4 => PieceType::Knight,
        5 => PieceType::Pawn,
        _ => unreachable!(),
    }
}

pub fn color_index(c: Color) -> usize {
    match c {
        Color::White => 0,
        Color::Black => 1,
    }
}

impl Board {
    /// Create a new board with the standard starting position
    pub fn new() -> Self {
        Self::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").unwrap()
    }

    /// Create an empty board
    pub fn empty() -> Self {
        Self {
            bitboards: [[0u64; 6]; 2],
            white_pieces: 0,
            black_pieces: 0,
            all_pieces: 0,
            side_to_move: Color::White,
            castling_rights: CastlingRights::none(),
            en_passant_square: None,
            halfmove_clock: 0,
            fullmove_number: 1,
            white_king_sq: 0,
            black_king_sq: 0,
        }
    }

    /// Set a piece on a square
    pub fn set_piece(&mut self, square: u8, piece: Piece) {
        let ci = color_index(piece.color);
        let pi = piece_type_index(piece.piece_type);
        self.bitboards[ci][pi] |= bit(square);
        self.update_occupancy();
        if piece.piece_type == PieceType::King {
            match piece.color {
                Color::White => self.white_king_sq = square,
                Color::Black => self.black_king_sq = square,
            }
        }
    }

    /// Remove a piece from a square
    pub fn remove_piece(&mut self, square: u8) {
        let b = bit(square);
        for ci in 0..2 {
            for pi in 0..6 {
                self.bitboards[ci][pi] &= !b;
            }
        }
        self.update_occupancy();
    }

    /// Get the piece at a square
    pub fn piece_at(&self, square: u8) -> Option<Piece> {
        let b = bit(square);
        for ci in 0..2 {
            for pi in 0..6 {
                if self.bitboards[ci][pi] & b != 0 {
                    let color = if ci == 0 { Color::White } else { Color::Black };
                    return Some(Piece::new(piece_type_from_index(pi), color));
                }
            }
        }
        None
    }

    /// Update combined occupancy bitboards
    fn update_occupancy(&mut self) {
        self.white_pieces = self.bitboards[0].iter().fold(0u64, |acc, &b| acc | b);
        self.black_pieces = self.bitboards[1].iter().fold(0u64, |acc, &b| acc | b);
        self.all_pieces = self.white_pieces | self.black_pieces;
    }

    /// Get pieces of a specific color
    pub fn pieces_of(&self, color: Color) -> u64 {
        match color {
            Color::White => self.white_pieces,
            Color::Black => self.black_pieces,
        }
    }

    /// Get pieces of a specific type and color
    pub fn pieces_of_type(&self, color: Color, piece_type: PieceType) -> u64 {
        self.bitboards[color_index(color)][piece_type_index(piece_type)]
    }

    /// Check if a square is attacked by a given color
    pub fn is_square_attacked(&self, square: u8, by_color: Color) -> bool {
        let ci = color_index(by_color);
        
        // Knight attacks
        if knight_attacks(square) & self.bitboards[ci][4] != 0 {
            return true;
        }

        // King attacks
        if king_attacks(square) & self.bitboards[ci][0] != 0 {
            return true;
        }

        // Pawn attacks
        let pawn_attackers = match by_color {
            Color::White => {
                let sq_bit = bit(square);
                let mut attackers = 0u64;
                if file_of(square) > 0 {
                    attackers |= sq_bit >> 9; // attacked from bottom-right
                }
                if file_of(square) < 7 {
                    attackers |= sq_bit >> 7; // attacked from bottom-left
                }
                attackers
            }
            Color::Black => {
                let sq_bit = bit(square);
                let mut attackers = 0u64;
                if file_of(square) > 0 {
                    attackers |= sq_bit << 7; // attacked from top-right
                }
                if file_of(square) < 7 {
                    attackers |= sq_bit << 9; // attacked from top-left
                }
                attackers
            }
        };
        if pawn_attackers & self.bitboards[ci][5] != 0 {
            return true;
        }

        // Sliding pieces - Rook/Queen (horizontal/vertical)
        let rook_queen = self.bitboards[ci][2] | self.bitboards[ci][1];
        if rook_queen != 0 && rook_attacks(square, self.all_pieces) & rook_queen != 0 {
            return true;
        }

        // Sliding pieces - Bishop/Queen (diagonal)
        let bishop_queen = self.bitboards[ci][3] | self.bitboards[ci][1];
        if bishop_queen != 0 && bishop_attacks(square, self.all_pieces) & bishop_queen != 0 {
            return true;
        }

        false
    }

    /// Check if the current side's king is in check
    pub fn is_in_check(&self) -> bool {
        let king_sq = match self.side_to_move {
            Color::White => self.white_king_sq,
            Color::Black => self.black_king_sq,
        };
        self.is_square_attacked(king_sq, self.side_to_move.opposite())
    }

    /// Check for insufficient material to deliver checkmate (FIDE Article 5.2.2).
    /// Returns true for these dead positions:
    /// - K vs K
    /// - K+B vs K
    /// - K+N vs K
    /// - K+B vs K+B (bishops on same color squares)
    pub fn has_insufficient_material(&self) -> bool {
        // If any pawns, rooks, or queens exist, material is sufficient
        for ci in 0..2 {
            if self.bitboards[ci][1] != 0 { return false; } // Queens
            if self.bitboards[ci][2] != 0 { return false; } // Rooks
            if self.bitboards[ci][5] != 0 { return false; } // Pawns
        }

        let white_knights = self.bitboards[0][4].count_ones();
        let white_bishops = self.bitboards[0][3].count_ones();
        let black_knights = self.bitboards[1][4].count_ones();
        let black_bishops = self.bitboards[1][3].count_ones();

        let white_minor = white_knights + white_bishops;
        let black_minor = black_knights + black_bishops;

        // K vs K
        if white_minor == 0 && black_minor == 0 {
            return true;
        }

        // K+N vs K or K+B vs K
        if (white_minor == 1 && black_minor == 0) || (white_minor == 0 && black_minor == 1) {
            return true;
        }

        // K+B vs K+B with bishops on the same color square
        if white_bishops == 1 && black_bishops == 1 && white_knights == 0 && black_knights == 0 {
            let w_bishop_sq = self.bitboards[0][3].trailing_zeros() as u8;
            let b_bishop_sq = self.bitboards[1][3].trailing_zeros() as u8;
            // Square color is determined by (rank + file) % 2
            let w_color = (rank_of(w_bishop_sq) + file_of(w_bishop_sq)) % 2;
            let b_color = (rank_of(b_bishop_sq) + file_of(b_bishop_sq)) % 2;
            if w_color == b_color {
                return true;
            }
        }

        false
    }

    /// Parse a FEN string into a Board
    pub fn from_fen(fen: &str) -> Result<Self, String> {
        let parts: Vec<&str> = fen.split_whitespace().collect();
        if parts.len() < 4 {
            return Err("Invalid FEN: too few parts".to_string());
        }

        let mut board = Board::empty();

        // Parse piece placement
        let mut rank = 7u8;
        let mut file = 0u8;
        for ch in parts[0].chars() {
            match ch {
                '/' => {
                    if rank == 0 {
                        return Err("Invalid FEN: too many ranks".to_string());
                    }
                    rank -= 1;
                    file = 0;
                }
                '1'..='8' => {
                    file += (ch as u8) - b'0';
                }
                _ => {
                    if let Some((pt, color)) = PieceType::from_char(ch) {
                        let square = sq(rank, file);
                        board.set_piece(square, Piece::new(pt, color));
                        file += 1;
                    } else {
                        return Err(format!("Invalid FEN: unknown piece '{}'", ch));
                    }
                }
            }
        }

        // Parse side to move
        board.side_to_move = match parts[1] {
            "w" => Color::White,
            "b" => Color::Black,
            _ => return Err("Invalid FEN: bad side to move".to_string()),
        };

        // Parse castling rights
        let castling = parts[2];
        board.castling_rights = CastlingRights {
            white_kingside: castling.contains('K'),
            white_queenside: castling.contains('Q'),
            black_kingside: castling.contains('k'),
            black_queenside: castling.contains('q'),
        };

        // Parse en passant
        board.en_passant_square = if parts[3] == "-" {
            None
        } else {
            square_from_name(parts[3])
        };

        // Parse halfmove clock and fullmove number
        if parts.len() > 4 {
            board.halfmove_clock = parts[4].parse().unwrap_or(0);
        }
        if parts.len() > 5 {
            board.fullmove_number = parts[5].parse().unwrap_or(1);
        }

        Ok(board)
    }

    /// Convert board to FEN string
    pub fn to_fen(&self) -> String {
        let mut fen = String::new();

        // Piece placement
        for rank in (0..8).rev() {
            let mut empty_count = 0;
            for file in 0..8 {
                let square = sq(rank, file);
                if let Some(piece) = self.piece_at(square) {
                    if empty_count > 0 {
                        fen.push_str(&empty_count.to_string());
                        empty_count = 0;
                    }
                    fen.push(piece.symbol());
                } else {
                    empty_count += 1;
                }
            }
            if empty_count > 0 {
                fen.push_str(&empty_count.to_string());
            }
            if rank > 0 {
                fen.push('/');
            }
        }

        // Side to move
        fen.push(' ');
        fen.push(match self.side_to_move {
            Color::White => 'w',
            Color::Black => 'b',
        });

        // Castling rights
        fen.push(' ');
        let mut castling = String::new();
        if self.castling_rights.white_kingside { castling.push('K'); }
        if self.castling_rights.white_queenside { castling.push('Q'); }
        if self.castling_rights.black_kingside { castling.push('k'); }
        if self.castling_rights.black_queenside { castling.push('q'); }
        if castling.is_empty() { castling.push('-'); }
        fen.push_str(&castling);

        // En passant
        fen.push(' ');
        match self.en_passant_square {
            Some(sq) => fen.push_str(&square_name(sq)),
            None => fen.push('-'),
        }

        // Halfmove clock and fullmove number
        fen.push_str(&format!(" {} {}", self.halfmove_clock, self.fullmove_number));

        fen
    }

    /// Get board state as an 8x8 array for neural network input
    pub fn to_array(&self) -> [[Option<Piece>; 8]; 8] {
        let mut result = [[None; 8]; 8];
        for rank in 0..8 {
            for file in 0..8 {
                result[rank as usize][file as usize] = self.piece_at(sq(rank, file));
            }
        }
        result
    }

    /// Serialize board state for API responses
    pub fn to_piece_list(&self) -> Vec<PieceInfo> {
        let mut pieces = Vec::new();
        for rank in 0..8 {
            for file in 0..8 {
                let square = sq(rank, file);
                if let Some(piece) = self.piece_at(square) {
                    pieces.push(PieceInfo {
                        piece_type: format!("{:?}", piece.piece_type).to_lowercase(),
                        color: format!("{}", piece.color),
                        rank: rank as i32,
                        file: file as i32,
                        square: square_name(square),
                    });
                }
            }
        }
        pieces
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PieceInfo {
    pub piece_type: String,
    pub color: String,
    pub rank: i32,
    pub file: i32,
    pub square: String,
}

// ---- Attack generation functions (used for move generation and check detection) ----

/// Knight attack bitboard for a given square
pub fn knight_attacks(square: u8) -> u64 {
    let mut attacks = 0u64;
    let rank = rank_of(square) as i8;
    let file = file_of(square) as i8;

    let offsets: [(i8, i8); 8] = [
        (-2, -1), (-2, 1), (-1, -2), (-1, 2),
        (1, -2), (1, 2), (2, -1), (2, 1),
    ];

    for (dr, df) in offsets {
        let r = rank + dr;
        let f = file + df;
        if r >= 0 && r < 8 && f >= 0 && f < 8 {
            attacks |= bit(sq(r as u8, f as u8));
        }
    }
    attacks
}

/// King attack bitboard for a given square
pub fn king_attacks(square: u8) -> u64 {
    let mut attacks = 0u64;
    let rank = rank_of(square) as i8;
    let file = file_of(square) as i8;

    for dr in -1..=1 {
        for df in -1..=1 {
            if dr == 0 && df == 0 { continue; }
            let r = rank + dr;
            let f = file + df;
            if r >= 0 && r < 8 && f >= 0 && f < 8 {
                attacks |= bit(sq(r as u8, f as u8));
            }
        }
    }
    attacks
}

/// Rook attack bitboard (horizontal + vertical sliding), considering blockers
pub fn rook_attacks(square: u8, occupied: u64) -> u64 {
    let mut attacks = 0u64;
    let rank = rank_of(square) as i8;
    let file = file_of(square) as i8;

    // Four directions: up, down, left, right
    let directions: [(i8, i8); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];

    for (dr, df) in directions {
        let mut r = rank + dr;
        let mut f = file + df;
        while r >= 0 && r < 8 && f >= 0 && f < 8 {
            let sq_bit = bit(sq(r as u8, f as u8));
            attacks |= sq_bit;
            if occupied & sq_bit != 0 {
                break; // Blocked
            }
            r += dr;
            f += df;
        }
    }
    attacks
}

/// Bishop attack bitboard (diagonal sliding), considering blockers
pub fn bishop_attacks(square: u8, occupied: u64) -> u64 {
    let mut attacks = 0u64;
    let rank = rank_of(square) as i8;
    let file = file_of(square) as i8;

    let directions: [(i8, i8); 4] = [(1, 1), (1, -1), (-1, 1), (-1, -1)];

    for (dr, df) in directions {
        let mut r = rank + dr;
        let mut f = file + df;
        while r >= 0 && r < 8 && f >= 0 && f < 8 {
            let sq_bit = bit(sq(r as u8, f as u8));
            attacks |= sq_bit;
            if occupied & sq_bit != 0 {
                break;
            }
            r += dr;
            f += df;
        }
    }
    attacks
}
