use crate::board::*;
use crate::piece::{Color, Piece, PieceType};
use rand::Rng;
use serde::{Deserialize, Serialize};

/// Chess960 (Fischer Random) support.
/// Generates random starting positions following Chess960 rules:
/// - Bishops must be on opposite-colored squares
/// - King must be between the two rooks
/// - Pawns on rank 2/7 as usual
/// - Black mirrors White's setup

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chess960Position {
    pub position_id: u16,  // 0-959
    pub fen: String,
    pub piece_order: [PieceType; 8],  // White back rank order (files a-h)
}

/// All 960 valid back-rank configurations can be indexed 0–959.
/// This generates a specific position by ID using the standard Chess960 numbering.
pub fn generate_position(id: u16) -> Chess960Position {
    let id = id.min(959);
    let pieces = id_to_back_rank(id);
    let fen = build_fen(&pieces);
    Chess960Position {
        position_id: id,
        fen,
        piece_order: pieces,
    }
}

/// Generate a random Chess960 position
pub fn random_position() -> Chess960Position {
    let mut rng = rand::thread_rng();
    let id = rng.gen_range(0..960);
    generate_position(id)
}

/// Convert a Chess960 position ID (0-959) to the back rank piece configuration.
/// Uses the standard Chess960 numbering scheme.
fn id_to_back_rank(id: u16) -> [PieceType; 8] {
    let mut n = id as usize;
    let mut pieces = [PieceType::Pawn; 8]; // placeholder
    let mut empty: Vec<usize> = (0..8).collect();

    // Place bishops on opposite colored squares
    // First bishop: one of the 4 dark squares (b, d, f, h → indices 1,3,5,7)
    let b1 = (n % 4) * 2 + 1;
    n /= 4;
    // Second bishop: one of the 4 light squares (a, c, e, g → indices 0,2,4,6)
    let b2 = (n % 4) * 2;
    n /= 4;

    pieces[b1] = PieceType::Bishop;
    pieces[b2] = PieceType::Bishop;
    empty.retain(|&x| x != b1 && x != b2);

    // Place queen on one of the 6 remaining squares
    let q_pos = n % 6;
    n /= 6;
    pieces[empty[q_pos]] = PieceType::Queen;
    empty.remove(q_pos);

    // Place knights on 2 of the 5 remaining squares using combination index
    let (n1, n2) = KNIGHT_PLACEMENTS[n.min(9)];
    pieces[empty[n1]] = PieceType::Knight;
    pieces[empty[n2]] = PieceType::Knight;

    // Remove knight positions from empty (in reverse order to maintain indices)
    let pos1 = empty[n1];
    let pos2 = empty[n2];
    empty.retain(|&x| x != pos1 && x != pos2);

    // Remaining 3 squares: Rook, King, Rook (king between rooks)
    assert_eq!(empty.len(), 3);
    pieces[empty[0]] = PieceType::Rook;
    pieces[empty[1]] = PieceType::King;
    pieces[empty[2]] = PieceType::Rook;

    pieces
}

/// The 10 ways to choose 2 out of 5 remaining positions for knights
const KNIGHT_PLACEMENTS: [(usize, usize); 10] = [
    (0, 1), (0, 2), (0, 3), (0, 4),
    (1, 2), (1, 3), (1, 4),
    (2, 3), (2, 4),
    (3, 4),
];

/// Build FEN string from a back-rank piece configuration
fn build_fen(pieces: &[PieceType; 8]) -> String {
    let mut fen = String::new();

    // Rank 8 (Black pieces) — mirror of white
    for pt in pieces.iter() {
        fen.push(pt.symbol(Color::Black));
    }
    fen.push('/');

    // Rank 7 (Black pawns)
    fen.push_str("pppppppp/");

    // Ranks 6-3 (empty)
    fen.push_str("8/8/8/8/");

    // Rank 2 (White pawns)
    fen.push_str("PPPPPPPP/");

    // Rank 1 (White pieces)
    for pt in pieces.iter() {
        fen.push(pt.symbol(Color::White));
    }

    // Determine castling rights based on rook positions
    let mut castling = String::new();
    let mut king_file = 0u8;
    let mut rook_files: Vec<u8> = Vec::new();

    for (i, pt) in pieces.iter().enumerate() {
        if *pt == PieceType::King {
            king_file = i as u8;
        }
        if *pt == PieceType::Rook {
            rook_files.push(i as u8);
        }
    }

    // Use Shredder-FEN style castling (file letters) for Chess960
    // Or standard K/Q/k/q when positions match standard chess
    if rook_files.len() == 2 {
        let (rook_a, rook_h) = if rook_files[0] < rook_files[1] {
            (rook_files[0], rook_files[1])
        } else {
            (rook_files[1], rook_files[0])
        };

        // White castling
        if rook_h > king_file {
            if rook_h == 7 && king_file == 4 {
                castling.push('K');
            } else {
                castling.push((b'A' + rook_h) as char);
            }
        }
        if rook_a < king_file {
            if rook_a == 0 && king_file == 4 {
                castling.push('Q');
            } else {
                castling.push((b'A' + rook_a) as char);
            }
        }
        // Black castling (mirrors white)
        if rook_h > king_file {
            if rook_h == 7 && king_file == 4 {
                castling.push('k');
            } else {
                castling.push((b'a' + rook_h) as char);
            }
        }
        if rook_a < king_file {
            if rook_a == 0 && king_file == 4 {
                castling.push('q');
            } else {
                castling.push((b'a' + rook_a) as char);
            }
        }
    }

    if castling.is_empty() {
        castling = "-".to_string();
    }

    format!("{} w {} - 0 1", fen, castling)
}

/// Check if a position ID corresponds to standard chess (position 518)
pub fn is_standard_chess(id: u16) -> bool {
    id == 518
}

/// Get the standard chess position ID
pub fn standard_position_id() -> u16 {
    518
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standard_position() {
        let pos = generate_position(518);
        assert_eq!(pos.piece_order, [
            PieceType::Rook, PieceType::Knight, PieceType::Bishop, PieceType::Queen,
            PieceType::King, PieceType::Bishop, PieceType::Knight, PieceType::Rook,
        ]);
    }

    #[test]
    fn test_all_positions_valid() {
        for id in 0..960 {
            let pos = generate_position(id);
            // Verify bishops on opposite colors
            let mut bishop_files = Vec::new();
            let mut king_file = 0;
            let mut rook_files = Vec::new();
            for (i, pt) in pos.piece_order.iter().enumerate() {
                match pt {
                    PieceType::Bishop => bishop_files.push(i),
                    PieceType::King => king_file = i,
                    PieceType::Rook => rook_files.push(i),
                    _ => {}
                }
            }
            assert_eq!(bishop_files.len(), 2, "Position {} doesn't have 2 bishops", id);
            assert_ne!(bishop_files[0] % 2, bishop_files[1] % 2, "Position {} bishops on same color", id);
            assert_eq!(rook_files.len(), 2, "Position {} doesn't have 2 rooks", id);
            assert!(rook_files[0] < king_file && king_file < rook_files[1],
                "Position {} king not between rooks", id);
        }
    }

    #[test]
    fn test_random_position() {
        let pos = random_position();
        assert!(pos.position_id < 960);
        assert!(!pos.fen.is_empty());
    }
}
