use crate::board::Board;
use crate::chess960;
use crate::evaluation::SearchRules;
use crate::moves::{generate_legal_moves, make_move, Move};
use crate::piece::Color;
use crate::variants::GameVariant;
use crate::zobrist::hash_board;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GameStatus {
    Active,
    Checkmate(String), // Winner color
    Stalemate,
    Draw,             // By repetition, 50-move rule, etc.
    Resigned(String), // Color that resigned
    /// Won by the variant's own rule (King of the Hill, Three-Check). Holds
    /// the winning colour.
    VariantWin(String),
}

impl GameStatus {
    /// The winning colour ("white"/"black"), or None for an unfinished or drawn game.
    ///
    /// Consumers must use this rather than parsing the `Debug` rendering of the
    /// status. `format!("{:?}", ..)` produces `Checkmate("white")` — quotes
    /// included — which is a display form, not a wire contract.
    pub fn winner(&self) -> Option<&str> {
        match self {
            GameStatus::Checkmate(winner) | GameStatus::VariantWin(winner) => Some(winner.as_str()),
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
    pub move_history: Vec<String>, // UCI move strings
    pub fen_history: Vec<String>,  // FEN after each move
    pub white_player: String,
    pub black_player: String,
    #[serde(default)]
    pub hash_history: Vec<u64>, // Zobrist hashes for fast repetition detection
    /// True once an arbitrary position has been loaded into this game.
    ///
    /// A hand-placed position did not arise from play, so the game must not
    /// produce a rated result. Defaults to false so existing saved games load.
    #[serde(default)]
    pub is_analysis: bool,
    /// Player id of the guest session that created the game; only they may
    /// change it. None for games saved before ownership, which are read-only.
    #[serde(default)]
    pub owner: Option<String>,
    /// Which rules this game is played under. Games saved before variants
    /// existed load as standard.
    #[serde(default)]
    pub variant: GameVariant,
    /// Three-Check: checks given so far, indexed [white, black]. Always zero
    /// in other variants.
    #[serde(default)]
    pub checks_given: [u8; 2],
}

/// Three-Check counts as sent to clients.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct CheckCount {
    pub white: u8,
    pub black: u8,
}

/// Index of a colour in per-colour arrays such as `checks_given`.
fn color_index(color: Color) -> usize {
    match color {
        Color::White => 0,
        Color::Black => 1,
    }
}

impl Default for GameState {
    fn default() -> Self {
        Self::new()
    }
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
            owner: None,
            variant: GameVariant::Standard,
            checks_given: [0, 0],
        }
    }

    /// Start a game from a position the caller chose (editor, FEN, puzzle).
    /// It did not arise from play, so like `load_position` it is unrated.
    pub fn from_custom_position(fen: &str) -> Result<Self, String> {
        let mut game = Self::from_fen(fen)?;
        game.is_analysis = true;
        Ok(game)
    }

    /// Start a game of `variant`. Chess960 starts from position `chess960_id`
    /// (0-959), or a random one when None; every other variant starts from the
    /// standard position.
    pub fn new_variant(variant: GameVariant, chess960_id: Option<u16>) -> Self {
        let mut game = match variant {
            GameVariant::Chess960 => {
                let pos =
                    chess960_id.map_or_else(chess960::random_position, chess960::generate_position);
                Self::from_fen(&pos.fen).expect("generated Chess960 positions are valid FEN")
            }
            _ => Self::new(),
        };
        game.variant = variant;
        game
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
            owner: None,
            variant: GameVariant::Standard,
            checks_given: [0, 0],
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

        let mover = self.board.side_to_move.opposite();
        if self.variant == GameVariant::ThreeCheck && self.board.is_in_check() {
            self.checks_given[color_index(mover)] += 1;
        }

        // Check for game-ending conditions. A variant's own win comes first:
        // reaching the hill or giving the third check ends the game even if
        // the opponent is also left without a move.
        let next_legal_moves = generate_legal_moves(&self.board);
        if let Some(winner) = self.variant.winner_by_rule(&self.board, self.checks_given) {
            self.status = GameStatus::VariantWin(format!("{}", winner));
        } else if next_legal_moves.is_empty() {
            if self.board.is_in_check() {
                let winner = self.board.side_to_move.opposite();
                self.status = GameStatus::Checkmate(format!("{}", winner));
            } else {
                self.status = GameStatus::Stalemate;
            }
        } else if self.board.halfmove_clock >= 150 // FIDE 9.6.2: automatic draw at 75 moves (150 half-moves)
            || self.is_fivefold_repetition() // FIDE 9.6.1: automatic draw at 5 repetitions
            || self.is_threefold_repetition()
            || self.board.has_insufficient_material()
        {
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
        self.recount_checks()
    }

    /// Rebuild the Three-Check counts from the recorded positions: a position
    /// that is in check after a move is a check given by the side that moved.
    fn recount_checks(&mut self) -> Result<(), String> {
        self.checks_given = [0, 0];
        if self.variant != GameVariant::ThreeCheck {
            return Ok(());
        }
        for fen in self.fen_history.iter().skip(1) {
            let board = Board::from_fen(fen)?;
            if board.is_in_check() {
                self.checks_given[color_index(board.side_to_move.opposite())] += 1;
            }
        }
        Ok(())
    }

    /// The check count for clients to display: Three-Check games only.
    pub fn check_count(&self) -> Option<CheckCount> {
        (self.variant == GameVariant::ThreeCheck).then_some(CheckCount {
            white: self.checks_given[0],
            black: self.checks_given[1],
        })
    }

    /// What the engine's search needs to know to play this game's variant.
    pub fn search_rules(&self) -> SearchRules {
        SearchRules {
            variant: self.variant,
            checks_given: self.checks_given,
        }
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
        self.checks_given = [0, 0];
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
        let current_pos: String = current
            .split_whitespace()
            .take(4)
            .collect::<Vec<_>>()
            .join(" ");
        self.fen_history
            .iter()
            .filter(|fen| {
                let pos: String = fen.split_whitespace().take(4).collect::<Vec<_>>().join(" ");
                pos == current_pos
            })
            .count()
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
