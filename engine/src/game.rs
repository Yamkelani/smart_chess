use crate::board::Board;
use crate::moves::{generate_legal_moves, make_move, Move};
use crate::piece::Color;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GameStatus {
    Active,
    Checkmate(String),   // Winner color
    Stalemate,
    Draw,                // By repetition, 50-move rule, etc.
    Resigned(String),    // Color that resigned
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub id: String,
    pub board: Board,
    pub status: GameStatus,
    pub move_history: Vec<String>,     // UCI move strings
    pub fen_history: Vec<String>,      // FEN after each move
    pub white_player: String,
    pub black_player: String,
}

impl GameState {
    pub fn new() -> Self {
        let board = Board::new();
        let initial_fen = board.to_fen();
        Self {
            id: Uuid::new_v4().to_string(),
            board,
            status: GameStatus::Active,
            move_history: Vec::new(),
            fen_history: vec![initial_fen],
            white_player: "human".to_string(),
            black_player: "ai".to_string(),
        }
    }

    pub fn from_fen(fen: &str) -> Result<Self, String> {
        let board = Board::from_fen(fen)?;
        let initial_fen = board.to_fen();
        Ok(Self {
            id: Uuid::new_v4().to_string(),
            board,
            status: GameStatus::Active,
            move_history: Vec::new(),
            fen_history: vec![initial_fen],
            white_player: "human".to_string(),
            black_player: "ai".to_string(),
        })
    }

    /// Get all legal moves in UCI notation
    pub fn get_legal_moves(&self) -> Vec<String> {
        generate_legal_moves(&self.board)
            .iter()
            .map(|m| m.to_uci())
            .collect()
    }

    /// Make a move given UCI notation. Returns Ok(()) on success.
    pub fn make_move(&mut self, uci: &str) -> Result<MoveResult, String> {
        if self.status != GameStatus::Active {
            return Err("Game is not active".to_string());
        }

        let mv = Move::from_uci(uci).ok_or("Invalid UCI notation")?;
        let legal_moves = generate_legal_moves(&self.board);

        // Find matching legal move (which has correct flags)
        let legal_move = legal_moves
            .iter()
            .find(|lm| lm.from == mv.from && lm.to == mv.to && lm.promotion == mv.promotion)
            .ok_or("Illegal move")?;

        let captured = self.board.piece_at(legal_move.to);
        let mut new_board = self.board.clone();

        if !make_move(&mut new_board, legal_move) {
            return Err("Move leaves king in check".to_string());
        }

        self.board = new_board;
        self.move_history.push(uci.to_string());
        self.fen_history.push(self.board.to_fen());

        // Check for game-ending conditions
        let next_legal_moves = generate_legal_moves(&self.board);
        if next_legal_moves.is_empty() {
            if self.board.is_in_check() {
                let winner = self.board.side_to_move.opposite();
                self.status = GameStatus::Checkmate(format!("{}", winner));
            } else {
                self.status = GameStatus::Stalemate;
            }
        } else if self.board.halfmove_clock >= 100 {
            self.status = GameStatus::Draw;
        } else if self.is_threefold_repetition() {
            self.status = GameStatus::Draw;
        } else if self.board.has_insufficient_material() {
            self.status = GameStatus::Draw;
        }

        let is_check = self.board.is_in_check();

        Ok(MoveResult {
            success: true,
            move_uci: uci.to_string(),
            captured: captured.map(|p| format!("{:?}", p.piece_type).to_lowercase()),
            is_check,
            status: self.status.clone(),
            fen: self.board.to_fen(),
        })
    }

    fn is_threefold_repetition(&self) -> bool {
        if self.fen_history.len() < 6 {
            return false;
        }
        let current = &self.fen_history[self.fen_history.len() - 1];
        // Compare piece placement, side to move, castling rights, and en passant (first 4 FEN parts)
        // per FIDE Article 9.2: positions are identical only when all four match
        let current_pos: String = current.split_whitespace().take(4).collect::<Vec<_>>().join(" ");
        let count = self.fen_history.iter().filter(|fen| {
            let pos: String = fen.split_whitespace().take(4).collect::<Vec<_>>().join(" ");
            pos == current_pos
        }).count();
        count >= 3
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveResult {
    pub success: bool,
    pub move_uci: String,
    pub captured: Option<String>,
    pub is_check: bool,
    pub status: GameStatus,
    pub fen: String,
}
