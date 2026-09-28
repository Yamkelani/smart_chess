use crate::board::Board;
use crate::moves::{generate_legal_moves, make_move, Move};
use crate::zobrist::hash_board;
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

impl GameStatus {
    /// The winning colour ("white"/"black"), or None for an unfinished or drawn game.
    ///
    /// Consumers must use this rather than parsing the `Debug` rendering of the
    /// status. `format!("{:?}", ..)` produces `Checkmate("white")` — quotes
    /// included — which is a display form, not a wire contract.
    pub fn winner(&self) -> Option<&str> {
        match self {
            GameStatus::Checkmate(winner) => Some(winner.as_str()),
            // The colour recorded is the one that resigned, so the winner is the other.
            GameStatus::Resigned(loser) => match loser.as_str() {
                "white" => Some("black"),
                "black" => Some("white"),
                _ => None,
            },
            _ => None,
        }
    }

    /// True once the game can accept no further moves.
    pub fn is_terminal(&self) -> bool {
        !matches!(self, GameStatus::Active)
    }
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
    #[serde(default)]
    pub hash_history: Vec<u64>,        // Zobrist hashes for fast repetition detection
    /// True once an arbitrary position has been loaded into this game.
    ///
    /// A hand-placed position did not arise from play, so the game must not
    /// produce a rated result. Defaults to false so existing saved games load.
    #[serde(default)]
    pub is_analysis: bool,
}

impl GameState {
    pub fn new() -> Self {
        let board = Board::new();
        let initial_fen = board.to_fen();
        let initial_hash = hash_board(&board);
        Self {
            id: Uuid::new_v4().to_string(),
            board,
            status: GameStatus::Active,
            move_history: Vec::new(),
            fen_history: vec![initial_fen],
            white_player: "human".to_string(),
            black_player: "ai".to_string(),
            hash_history: vec![initial_hash],
            is_analysis: false,
        }
    }

    pub fn from_fen(fen: &str) -> Result<Self, String> {
        let board = Board::from_fen(fen)?;
        let initial_fen = board.to_fen();
        let initial_hash = hash_board(&board);
        Ok(Self {
            id: Uuid::new_v4().to_string(),
            board,
            status: GameStatus::Active,
            move_history: Vec::new(),
            fen_history: vec![initial_fen],
            white_player: "human".to_string(),
            black_player: "ai".to_string(),
            hash_history: vec![initial_hash],
            is_analysis: false,
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
        self.hash_history.push(hash_board(&self.board));

        // Check for game-ending conditions
        let next_legal_moves = generate_legal_moves(&self.board);
        if next_legal_moves.is_empty() {
            if self.board.is_in_check() {
                let winner = self.board.side_to_move.opposite();
                self.status = GameStatus::Checkmate(format!("{}", winner));
            } else {
                self.status = GameStatus::Stalemate;
            }
        } else if self.board.halfmove_clock >= 150 {
            // FIDE 9.6.2: automatic draw at 75 moves (150 half-moves)
            self.status = GameStatus::Draw;
        } else if self.is_fivefold_repetition() {
            // FIDE 9.6.1: automatic draw at 5 repetitions
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

    /// Rewind `count` half-moves, restoring the position that actually occurred.
    ///
    /// This is the safe counterpart to `load_position`: it can only move
    /// backwards through this game's own recorded history, so it cannot be used
    /// to inject a position that was never played.  The board and all three
    /// parallel histories are truncated together, keeping them consistent.
    ///
    /// Rewinding out of a terminal status reactivates the game, which is correct
    /// because the earlier position genuinely was active.
    pub fn undo_moves(&mut self, count: usize) -> Result<(), String> {
        if count == 0 {
            return Err("Must undo at least one move".to_string());
        }
        if count > self.move_history.len() {
            return Err(format!(
                "Cannot undo {} move(s); only {} have been played",
                count,
                self.move_history.len()
            ));
        }

        let keep = self.move_history.len() - count;
        self.move_history.truncate(keep);
        // fen_history and hash_history carry the initial position as well, so
        // they always hold one more entry than move_history.
        self.fen_history.truncate(keep + 1);
        self.hash_history.truncate(keep + 1);

        let target = self
            .fen_history
            .last()
            .ok_or("History is empty; cannot restore a position")?;
        self.board = Board::from_fen(target)?;
        self.status = GameStatus::Active;
        Ok(())
    }

    /// Replace the position with an arbitrary one, discarding all history.
    ///
    /// Used for board setup and opening exploration.  Because the resulting
    /// position did not arise from play, the game is flagged as analysis and
    /// must not yield a rated result.  All histories are reset together so the
    /// recorded game can never describe moves that were not played — leaving
    /// them in place also corrupted repetition detection, because stale Zobrist
    /// hashes from the abandoned line were still counted.
    pub fn load_position(&mut self, fen: &str) -> Result<(), String> {
        let board = Board::from_fen(fen)?;
        let canonical_fen = board.to_fen();
        let hash = hash_board(&board);

        self.board = board;
        self.move_history.clear();
        self.fen_history = vec![canonical_fen];
        self.hash_history = vec![hash];
        self.status = GameStatus::Active;
        self.is_analysis = true;
        Ok(())
    }

    fn position_repetition_count(&self) -> usize {
        // Use Zobrist hashes for O(n) repetition detection instead of O(n²) FEN parsing.
        // Falls back to FEN comparison if hash_history is empty (legacy saved games).
        if !self.hash_history.is_empty() {
            let current = *self.hash_history.last().unwrap();
            return self.hash_history.iter().filter(|&&h| h == current).count();
        }
        // Fallback: FEN-based comparison for games without hash_history
        if self.fen_history.len() < 2 {
            return 1;
        }
        let current = &self.fen_history[self.fen_history.len() - 1];
        let current_pos: String = current.split_whitespace().take(4).collect::<Vec<_>>().join(" ");
        self.fen_history.iter().filter(|fen| {
            let pos: String = fen.split_whitespace().take(4).collect::<Vec<_>>().join(" ");
            pos == current_pos
        }).count()
    }

    fn is_threefold_repetition(&self) -> bool {
        self.position_repetition_count() >= 3
    }

    fn is_fivefold_repetition(&self) -> bool {
        self.position_repetition_count() >= 5
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
