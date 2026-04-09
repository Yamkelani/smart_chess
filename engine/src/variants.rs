use serde::{Deserialize, Serialize};

/// Supported chess game variants
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameVariant {
    /// Standard chess
    Standard,
    /// Chess960 (Fischer Random Chess) — randomized starting positions
    Chess960,
    /// King of the Hill — win by moving your king to d4, d5, e4, or e5
    KingOfTheHill,
    /// Three-Check — win by giving check three times
    ThreeCheck,
    /// Atomic — captures cause explosions that destroy surrounding pieces
    Atomic,
    /// Crazyhouse — captured pieces can be dropped back on the board
    Crazyhouse,
}

impl Default for GameVariant {
    fn default() -> Self {
        GameVariant::Standard
    }
}

impl GameVariant {
    pub fn name(&self) -> &str {
        match self {
            GameVariant::Standard => "Standard",
            GameVariant::Chess960 => "Chess960",
            GameVariant::KingOfTheHill => "King of the Hill",
            GameVariant::ThreeCheck => "Three-Check",
            GameVariant::Atomic => "Atomic",
            GameVariant::Crazyhouse => "Crazyhouse",
        }
    }

    pub fn description(&self) -> &str {
        match self {
            GameVariant::Standard => "Classic chess with standard rules.",
            GameVariant::Chess960 => "Randomized starting positions. Bishops on opposite colors, king between rooks.",
            GameVariant::KingOfTheHill => "Win by moving your king to one of the four center squares (d4, d5, e4, e5).",
            GameVariant::ThreeCheck => "Give check three times to win the game.",
            GameVariant::Atomic => "Captures cause explosions! All pieces in a 1-square radius are destroyed (except pawns).",
            GameVariant::Crazyhouse => "Captured pieces switch sides and can be dropped onto empty squares.",
        }
    }

    pub fn from_str(s: &str) -> Option<GameVariant> {
        match s.to_lowercase().as_str() {
            "standard" => Some(GameVariant::Standard),
            "chess960" | "fischerrandom" | "fischer_random" => Some(GameVariant::Chess960),
            "kingofthehill" | "king_of_the_hill" | "koth" => Some(GameVariant::KingOfTheHill),
            "threecheck" | "three_check" | "3check" => Some(GameVariant::ThreeCheck),
            "atomic" => Some(GameVariant::Atomic),
            "crazyhouse" => Some(GameVariant::Crazyhouse),
            _ => None,
        }
    }
}

/// Variant-specific game state extensions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantState {
    pub variant: GameVariant,
    
    /// Three-Check: track number of checks given by each side
    pub white_checks: u8,
    pub black_checks: u8,
    
    /// Crazyhouse: piece reserves (captured pieces available for dropping)
    /// [pawns, knights, bishops, rooks, queens]
    pub white_reserve: [u8; 5],
    pub black_reserve: [u8; 5],
    
    /// Chess960: original rook files for castling
    pub chess960_king_file: Option<u8>,
    pub chess960_rook_a_file: Option<u8>,
    pub chess960_rook_h_file: Option<u8>,
}

impl Default for VariantState {
    fn default() -> Self {
        Self {
            variant: GameVariant::Standard,
            white_checks: 0,
            black_checks: 0,
            white_reserve: [0; 5],
            black_reserve: [0; 5],
            chess960_king_file: None,
            chess960_rook_a_file: None,
            chess960_rook_h_file: None,
        }
    }
}

impl VariantState {
    pub fn new(variant: GameVariant) -> Self {
        Self {
            variant,
            ..Default::default()
        }
    }
    
    /// Check if the game is won by variant-specific rules
    pub fn check_variant_win(&self, king_sq: u8, is_check: bool) -> Option<String> {
        match self.variant {
            GameVariant::KingOfTheHill => {
                // Center squares: d4=27, d5=35, e4=28, e5=36
                let center = [27, 28, 35, 36];
                if center.contains(&king_sq) {
                    return Some("King reached the hill!".to_string());
                }
                None
            }
            GameVariant::ThreeCheck => {
                if is_check {
                    // This check would increment the counter, checked in caller
                    if self.white_checks >= 3 {
                        return Some("White gave three checks!".to_string());
                    }
                    if self.black_checks >= 3 {
                        return Some("Black gave three checks!".to_string());
                    }
                }
                None
            }
            _ => None,
        }
    }
    
    /// Get piece reserve index for Crazyhouse
    pub fn piece_reserve_index(piece_name: &str) -> Option<usize> {
        match piece_name.to_lowercase().as_str() {
            "pawn" => Some(0),
            "knight" => Some(1),
            "bishop" => Some(2),
            "rook" => Some(3),
            "queen" => Some(4),
            _ => None,
        }
    }
    
    /// Add a captured piece to reserve (Crazyhouse)
    pub fn add_to_reserve(&mut self, is_white_capturing: bool, piece_name: &str) {
        if self.variant != GameVariant::Crazyhouse { return; }
        if let Some(idx) = Self::piece_reserve_index(piece_name) {
            if is_white_capturing {
                self.white_reserve[idx] += 1;
            } else {
                self.black_reserve[idx] += 1;
            }
        }
    }
    
    /// Remove a piece from reserve for dropping (Crazyhouse)
    pub fn remove_from_reserve(&mut self, is_white: bool, piece_name: &str) -> bool {
        if self.variant != GameVariant::Crazyhouse { return false; }
        if let Some(idx) = Self::piece_reserve_index(piece_name) {
            let reserve = if is_white { &mut self.white_reserve } else { &mut self.black_reserve };
            if reserve[idx] > 0 {
                reserve[idx] -= 1;
                return true;
            }
        }
        false
    }
    
    /// Record a check (Three-Check)
    pub fn record_check(&mut self, checking_side_is_white: bool) {
        if self.variant != GameVariant::ThreeCheck { return; }
        if checking_side_is_white {
            self.white_checks += 1;
        } else {
            self.black_checks += 1;
        }
    }
}

/// Info about all available variants for the API
#[derive(Serialize)]
pub struct VariantInfo {
    pub id: String,
    pub name: String,
    pub description: String,
}

pub fn list_variants() -> Vec<VariantInfo> {
    vec![
        VariantInfo { id: "standard".into(), name: "Standard".into(), description: GameVariant::Standard.description().into() },
        VariantInfo { id: "chess960".into(), name: "Chess960".into(), description: GameVariant::Chess960.description().into() },
        VariantInfo { id: "kingofthehill".into(), name: "King of the Hill".into(), description: GameVariant::KingOfTheHill.description().into() },
        VariantInfo { id: "threecheck".into(), name: "Three-Check".into(), description: GameVariant::ThreeCheck.description().into() },
        VariantInfo { id: "atomic".into(), name: "Atomic".into(), description: GameVariant::Atomic.description().into() },
        VariantInfo { id: "crazyhouse".into(), name: "Crazyhouse".into(), description: GameVariant::Crazyhouse.description().into() },
    ]
}
