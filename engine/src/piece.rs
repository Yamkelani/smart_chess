use serde::{Deserialize, Serialize};
use std::fmt;

/// Piece colors
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Color {
    White,
    Black,
}

impl Color {
    pub fn opposite(&self) -> Color {
        match self {
            Color::White => Color::Black,
            Color::Black => Color::White,
        }
    }
}

impl fmt::Display for Color {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Color::White => write!(f, "white"),
            Color::Black => write!(f, "black"),
        }
    }
}

/// Piece types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PieceType {
    King,
    Queen,
    Rook,
    Bishop,
    Knight,
    Pawn,
}

impl PieceType {
    /// Material value for static evaluation (centipawns)
    pub fn value(&self) -> i32 {
        match self {
            PieceType::King => 20000,
            PieceType::Queen => 900,
            PieceType::Rook => 500,
            PieceType::Bishop => 330,
            PieceType::Knight => 320,
            PieceType::Pawn => 100,
        }
    }

    pub fn symbol(&self, color: Color) -> char {
        match (self, color) {
            (PieceType::King, Color::White) => 'K',
            (PieceType::Queen, Color::White) => 'Q',
            (PieceType::Rook, Color::White) => 'R',
            (PieceType::Bishop, Color::White) => 'B',
            (PieceType::Knight, Color::White) => 'N',
            (PieceType::Pawn, Color::White) => 'P',
            (PieceType::King, Color::Black) => 'k',
            (PieceType::Queen, Color::Black) => 'q',
            (PieceType::Rook, Color::Black) => 'r',
            (PieceType::Bishop, Color::Black) => 'b',
            (PieceType::Knight, Color::Black) => 'n',
            (PieceType::Pawn, Color::Black) => 'p',
        }
    }

    pub fn from_char(c: char) -> Option<(PieceType, Color)> {
        match c {
            'K' => Some((PieceType::King, Color::White)),
            'Q' => Some((PieceType::Queen, Color::White)),
            'R' => Some((PieceType::Rook, Color::White)),
            'B' => Some((PieceType::Bishop, Color::White)),
            'N' => Some((PieceType::Knight, Color::White)),
            'P' => Some((PieceType::Pawn, Color::White)),
            'k' => Some((PieceType::King, Color::Black)),
            'q' => Some((PieceType::Queen, Color::Black)),
            'r' => Some((PieceType::Rook, Color::Black)),
            'b' => Some((PieceType::Bishop, Color::Black)),
            'n' => Some((PieceType::Knight, Color::Black)),
            'p' => Some((PieceType::Pawn, Color::Black)),
            _ => None,
        }
    }
}

/// A piece on the board
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Piece {
    pub piece_type: PieceType,
    pub color: Color,
}

impl Piece {
    pub fn new(piece_type: PieceType, color: Color) -> Self {
        Self { piece_type, color }
    }

    pub fn symbol(&self) -> char {
        self.piece_type.symbol(self.color)
    }
}
