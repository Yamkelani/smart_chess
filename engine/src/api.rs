use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

use crate::attacks;
use crate::board::Board;
use crate::evaluation::{evaluate, search_best_move, search_top_moves};
use crate::game::{GameState, GameStatus};
use crate::moves::generate_legal_moves;
use crate::persistence;
use crate::chess960;
use crate::variants;

/// Maximum number of games to keep in memory.  When exceeded, the oldest
/// (by insertion/access order) are evicted.  Set via MAX_GAMES env var.
const MAX_GAMES: usize = 500;

pub struct AppState {
    pub games: Mutex<HashMap<String, GameState>>,
}

/// Acquire the games lock, returning an HTTP 500 if the mutex is poisoned.
macro_rules! lock_games {
    ($data:expr) => {
        match $data.games.lock() {
            Ok(guard) => guard,
            Err(_) => return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "Internal lock error".to_string(),
            }),
        }
    };
}

/// Evict oldest games if the map exceeds MAX_GAMES.
fn evict_old_games(games: &mut HashMap<String, GameState>) {
    if games.len() <= MAX_GAMES {
        return;
    }
    // Remove games that are finished first, then oldest by fullmove_number
    let mut ids: Vec<(String, bool, u32)> = games.iter().map(|(id, g)| {
        let is_active = g.status == crate::game::GameStatus::Active;
        (id.clone(), is_active, g.board.fullmove_number)
    }).collect();
    // Sort: finished first, then by lowest move number (oldest)
    ids.sort_by(|a, b| {
        a.1.cmp(&b.1).then(a.2.cmp(&b.2))
    });
    let to_remove = games.len() - MAX_GAMES;
    for (id, _, _) in ids.into_iter().take(to_remove) {
        games.remove(&id);
        log::info!("Evicted old game {}", id);
    }
}

// ---- Request/Response types ----

#[derive(Deserialize)]
pub struct NewGameRequest {
    pub fen: Option<String>,
}

#[derive(Deserialize)]
pub struct MakeMoveRequest {
    pub uci: String,
}

#[derive(Deserialize)]
pub struct EvalRequest {
    pub fen: String,
    pub depth: Option<u8>,
}

#[derive(Serialize)]
pub struct NewGameResponse {
    pub game_id: String,
    pub fen: String,
    pub pieces: Vec<crate::board::PieceInfo>,
    pub legal_moves: Vec<String>,
}

#[derive(Serialize)]
pub struct GameStateResponse {
    pub game_id: String,
    pub fen: String,
    pub side_to_move: String,
    pub pieces: Vec<crate::board::PieceInfo>,
    pub legal_moves: Vec<String>,
    pub status: String,
    pub move_history: Vec<String>,
    pub is_check: bool,
}

#[derive(Serialize)]
pub struct MoveResponse {
    pub success: bool,
    pub move_uci: String,
    pub fen: String,
    pub pieces: Vec<crate::board::PieceInfo>,
    pub legal_moves: Vec<String>,
    pub captured: Option<String>,
    pub is_check: bool,
    pub status: String,
}

#[derive(Serialize)]
pub struct EvalResponse {
    pub fen: String,
    pub evaluation: i32,
    pub best_move: Option<String>,
    pub legal_moves: Vec<String>,
}

#[derive(Deserialize)]
pub struct AnalyzeRequest {
    pub fen: String,
    pub depth: Option<u8>,
    pub num_moves: Option<usize>,
}

#[derive(Deserialize)]
pub struct EngineMoveQuery {
    pub depth: Option<u8>,
}

#[derive(Serialize)]
pub struct AnalyzedMove {
    pub uci: String,
    pub from: String,
    pub to: String,
    pub score: i32,
    pub score_cp: i32,
    pub mate_in: Option<i32>,
    pub is_capture: bool,
    pub is_check: bool,
    pub principal_variation: Vec<String>,
    pub resulting_fen: String,
    pub resulting_pieces: Vec<crate::board::PieceInfo>,
}

#[derive(Serialize)]
pub struct AnalyzeResponse {
    pub fen: String,
    pub evaluation: i32,
    pub top_moves: Vec<AnalyzedMove>,
    pub total_legal_moves: usize,
}

#[derive(Serialize)]
pub struct EngineInfoResponse {
    pub name: String,
    pub version: String,
    pub language: String,
    pub features: Vec<String>,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// ---- FEN Validation ----

/// Lightweight structural validation of a FEN string before it reaches the board parser.
/// Catches obvious injection or malformed inputs without needing to parse the full board.
fn validate_fen(fen: &str) -> Result<(), String> {
    // Reject absurdly long strings
    if fen.len() > 128 {
        return Err("FEN string too long".to_string());
    }
    let parts: Vec<&str> = fen.split_whitespace().collect();
    if parts.len() < 4 || parts.len() > 6 {
        return Err(format!("FEN must have 4-6 fields, got {}", parts.len()));
    }
    // Validate piece placement: must have exactly 8 ranks
    let ranks: Vec<&str> = parts[0].split('/').collect();
    if ranks.len() != 8 {
        return Err(format!("FEN piece placement must have 8 ranks, got {}", ranks.len()));
    }
    for rank in &ranks {
        let mut count = 0u8;
        for ch in rank.chars() {
            match ch {
                '1'..='8' => count += ch as u8 - b'0',
                'p' | 'n' | 'b' | 'r' | 'q' | 'k' |
                'P' | 'N' | 'B' | 'R' | 'Q' | 'K' => count += 1,
                _ => return Err(format!("Invalid character '{}' in FEN rank", ch)),
            }
        }
        if count != 8 {
            return Err(format!("FEN rank '{}' does not sum to 8 squares", rank));
        }
    }
    // Side to move
    if parts[1] != "w" && parts[1] != "b" {
        return Err(format!("Invalid side to move '{}' — must be 'w' or 'b'", parts[1]));
    }
    Ok(())
}

// ---- API Handlers ----

pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({"status": "ok", "service": "chess-engine"}))
}

pub async fn engine_info() -> impl Responder {
    HttpResponse::Ok().json(EngineInfoResponse {
        name: "3D Chess Rust Engine".to_string(),
        version: "1.0.0".to_string(),
        language: "Rust".to_string(),
        features: vec![
            "Bitboard representation".to_string(),
            "Alpha-beta pruning with quiescence search".to_string(),
            "Piece-square table evaluation".to_string(),
            "Full legal move generation".to_string(),
            "FEN support".to_string(),
            "Game state management".to_string(),
        ],
    })
}

pub async fn new_game(
    data: web::Data<AppState>,
    body: web::Json<NewGameRequest>,
) -> impl Responder {
    let game = if let Some(fen) = &body.fen {
        if let Err(e) = validate_fen(fen) {
            return HttpResponse::BadRequest().json(ErrorResponse { error: e });
        }
        match GameState::from_fen(fen) {
            Ok(g) => g,
            Err(e) => return HttpResponse::BadRequest().json(ErrorResponse { error: e }),
        }
    } else {
        GameState::new()
    };

    let response = NewGameResponse {
        game_id: game.id.clone(),
        fen: game.board.to_fen(),
        pieces: game.board.to_piece_list(),
        legal_moves: game.get_legal_moves(),
    };

    let game_id = game.id.clone();
    if let Err(e) = persistence::save_game(&game) {
        log::warn!("Could not persist new game {}: {}", game.id, e);
    }
    data.games.lock().map_err(|_| ()).ok().map(|mut g| {
        evict_old_games(&mut g);
        g.insert(game_id, game);
    });

    HttpResponse::Ok().json(response)
}

pub async fn get_game(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let game_id = path.into_inner();
    let games = lock_games!(data);

    match games.get(&game_id) {
        Some(game) => {
            let response = GameStateResponse {
                game_id: game.id.clone(),
                fen: game.board.to_fen(),
                side_to_move: format!("{}", game.board.side_to_move),
                pieces: game.board.to_piece_list(),
                legal_moves: game.get_legal_moves(),
                status: format!("{:?}", game.status),
                move_history: game.move_history.clone(),
                is_check: game.board.is_in_check(),
            };
            HttpResponse::Ok().json(response)
        }
        None => HttpResponse::NotFound().json(ErrorResponse {
            error: "Game not found".to_string(),
        }),
    }
}

pub async fn make_move(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<MakeMoveRequest>,
) -> impl Responder {
    let game_id = path.into_inner();
    let mut games = lock_games!(data);

    match games.get_mut(&game_id) {
        Some(game) => {
            match game.make_move(&body.uci) {
                Ok(result) => {
                    if let Err(e) = persistence::save_game(game) {
                        log::warn!("Could not persist game after move: {}", e);
                    }
                    let response = MoveResponse {
                        success: true,
                        move_uci: result.move_uci,
                        fen: game.board.to_fen(),
                        pieces: game.board.to_piece_list(),
                        legal_moves: game.get_legal_moves(),
                        captured: result.captured,
                        is_check: result.is_check,
                        status: format!("{:?}", game.status),
                    };
                    HttpResponse::Ok().json(response)
                }
                Err(e) => HttpResponse::BadRequest().json(ErrorResponse { error: e }),
            }
        }
        None => HttpResponse::NotFound().json(ErrorResponse {
            error: "Game not found".to_string(),
        }),
    }
}

pub async fn get_legal_moves(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let game_id = path.into_inner();
    let games = lock_games!(data);

    match games.get(&game_id) {
        Some(game) => HttpResponse::Ok().json(game.get_legal_moves()),
        None => HttpResponse::NotFound().json(ErrorResponse {
            error: "Game not found".to_string(),
        }),
    }
}

pub async fn evaluate_position(body: web::Json<EvalRequest>) -> impl Responder {
    if let Err(e) = validate_fen(&body.fen) {
        return HttpResponse::BadRequest().json(ErrorResponse { error: e });
    }
    let board = match Board::from_fen(&body.fen) {
        Ok(b) => b,
        Err(e) => return HttpResponse::BadRequest().json(ErrorResponse { error: e }),
    };

    let depth = body.depth.unwrap_or(4);
    let eval = evaluate(&board);
    let best = search_best_move(&board, depth);
    let legal = generate_legal_moves(&board)
        .iter()
        .map(|m| m.to_uci())
        .collect();

    HttpResponse::Ok().json(EvalResponse {
        fen: body.fen.clone(),
        evaluation: eval,
        best_move: best.map(|(m, _)| m.to_uci()),
        legal_moves: legal,
    })
}

pub async fn engine_move(
    data: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<EngineMoveQuery>,
) -> impl Responder {
    let game_id = path.into_inner();
    let mut games = lock_games!(data);

    match games.get_mut(&game_id) {
        Some(game) => {
            let depth = query.depth.unwrap_or(4).min(12);
            match search_best_move(&game.board, depth) {
                Some((best_move, score)) => {
                    let uci = best_move.to_uci();
                    match game.make_move(&uci) {
                        Ok(result) => {
                            if let Err(e) = persistence::save_game(game) {
                                log::warn!("Could not persist game after engine move: {}", e);
                            }
                            let response = MoveResponse {
                                success: true,
                                move_uci: result.move_uci,
                                fen: game.board.to_fen(),
                                pieces: game.board.to_piece_list(),
                                legal_moves: game.get_legal_moves(),
                                captured: result.captured,
                                is_check: result.is_check,
                                status: format!("{:?}", game.status),
                            };
                            HttpResponse::Ok().json(response)
                        }
                        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse { error: e }),
                    }
                }
                None => HttpResponse::Ok().json(serde_json::json!({
                    "error": "No moves available",
                    "status": format!("{:?}", game.status)
                })),
            }
        }
        None => HttpResponse::NotFound().json(ErrorResponse {
            error: "Game not found".to_string(),
        }),
    }
}

pub async fn analyze_position(body: web::Json<AnalyzeRequest>) -> impl Responder {
    if let Err(e) = validate_fen(&body.fen) {
        return HttpResponse::BadRequest().json(ErrorResponse { error: e });
    }
    let board = match Board::from_fen(&body.fen) {
        Ok(b) => b,
        Err(e) => return HttpResponse::BadRequest().json(ErrorResponse { error: e }),
    };

    let depth = body.depth.unwrap_or(5);
    let num_moves = body.num_moves.unwrap_or(5).min(10);
    let eval = evaluate(&board);
    let top = search_top_moves(&board, depth, num_moves);
    let total_legal = generate_legal_moves(&board).len();

    let top_moves: Vec<AnalyzedMove> = top.into_iter().map(|(mv, score, pv)| {
        // Make the move to get the resulting position
        let mut result_board = board.clone();
        let is_capture = board.piece_at(mv.to).is_some() || mv.is_en_passant;
        crate::moves::make_move(&mut result_board, &mv);
        let is_check = result_board.is_in_check();

        // Detect mate scores
        let mate_in = if score.abs() > 18000 {
            let plies = 19000 - score.abs();
            let mate_moves = (plies + 1) / 2;
            Some(if score > 0 { mate_moves } else { -mate_moves })
        } else {
            None
        };

        AnalyzedMove {
            uci: mv.to_uci(),
            from: crate::board::square_name(mv.from),
            to: crate::board::square_name(mv.to),
            score,
            score_cp: score,
            mate_in,
            is_capture,
            is_check,
            principal_variation: pv.iter().map(|m| m.to_uci()).collect(),
            resulting_fen: result_board.to_fen(),
            resulting_pieces: result_board.to_piece_list(),
        }
    }).collect();

    HttpResponse::Ok().json(AnalyzeResponse {
        fen: body.fen.clone(),
        evaluation: eval,
        top_moves,
        total_legal_moves: total_legal,
    })
}

pub async fn attack_map(body: web::Json<EvalRequest>) -> impl Responder {
    if let Err(e) = validate_fen(&body.fen) {
        return HttpResponse::BadRequest().json(ErrorResponse { error: e });
    }
    let board = match Board::from_fen(&body.fen) {
        Ok(b) => b,
        Err(e) => return HttpResponse::BadRequest().json(ErrorResponse { error: e }),
    };
    HttpResponse::Ok().json(attacks::compute_attack_map(&board, body.fen.clone()))
}

/// Get a Chess960 random starting position
pub async fn chess960_random() -> impl Responder {
    let pos = chess960::random_position();
    HttpResponse::Ok().json(pos)
}

/// Get a specific Chess960 position by ID (0-959)
pub async fn chess960_position(path: web::Path<u16>) -> impl Responder {
    let id = path.into_inner();
    if id >= 960 {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "Position ID must be 0-959".to_string(),
        });
    }
    let pos = chess960::generate_position(id);
    HttpResponse::Ok().json(pos)
}

/// List all available game variants
pub async fn list_variants() -> impl Responder {
    HttpResponse::Ok().json(variants::list_variants())
}

/// Create a new game with a specific variant
#[derive(Deserialize)]
pub struct NewVariantGameRequest {
    pub variant: String,
    pub chess960_id: Option<u16>,
    pub fen: Option<String>,
}

pub async fn new_variant_game(
    data: web::Data<AppState>,
    body: web::Json<NewVariantGameRequest>,
) -> impl Responder {
    let variant = variants::GameVariant::from_str(&body.variant)
        .unwrap_or(variants::GameVariant::Standard);

    let game = match variant {
        variants::GameVariant::Chess960 => {
            let pos = if let Some(id) = body.chess960_id {
                chess960::generate_position(id)
            } else {
                chess960::random_position()
            };
            match GameState::from_fen(&pos.fen) {
                Ok(g) => g,
                Err(e) => return HttpResponse::BadRequest().json(ErrorResponse { error: e }),
            }
        }
        _ => {
            if let Some(ref fen) = body.fen {
                match GameState::from_fen(fen) {
                    Ok(g) => g,
                    Err(e) => return HttpResponse::BadRequest().json(ErrorResponse { error: e }),
                }
            } else {
                GameState::new()
            }
        }
    };

    let response = NewGameResponse {
        game_id: game.id.clone(),
        fen: game.board.to_fen(),
        pieces: game.board.to_piece_list(),
        legal_moves: game.get_legal_moves(),
    };

    let game_id = game.id.clone();
    data.games.lock().map_err(|_| ()).ok().map(|mut g| {
        evict_old_games(&mut g);
        g.insert(game_id, game);
    });

    HttpResponse::Ok().json(response)
}

// ---- Resign / Offer-Draw endpoints ----

#[derive(Deserialize)]
pub struct ResignRequest {
    /// "white" or "black"
    pub color: String,
}

pub async fn resign_game(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<ResignRequest>,
) -> impl Responder {
    let game_id = path.into_inner();
    let mut games = lock_games!(data);
    let game = match games.get_mut(&game_id) {
        Some(g) => g,
        None => return HttpResponse::NotFound().json(ErrorResponse {
            error: "Game not found".to_string(),
        }),
    };
    if game.status != GameStatus::Active {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "Game is already over".to_string(),
        });
    }
    let color = body.color.to_lowercase();
    if color != "white" && color != "black" {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "color must be 'white' or 'black'".to_string(),
        });
    }
    game.status = GameStatus::Resigned(color.clone());
    let stm = if game.board.side_to_move == crate::piece::Color::White { "white" } else { "black" };
    HttpResponse::Ok().json(GameStateResponse {
        game_id: game.id.clone(),
        fen: game.board.to_fen(),
        side_to_move: stm.to_string(),
        pieces: game.board.to_piece_list(),
        status: format!("{:?}", game.status),
        legal_moves: vec![],
        move_history: game.move_history.clone(),
        is_check: false,
    })
}

pub async fn draw_game(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let game_id = path.into_inner();
    let mut games = lock_games!(data);
    let game = match games.get_mut(&game_id) {
        Some(g) => g,
        None => return HttpResponse::NotFound().json(ErrorResponse {
            error: "Game not found".to_string(),
        }),
    };
    if game.status != GameStatus::Active {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "Game is already over".to_string(),
        });
    }
    game.status = GameStatus::Draw;
    let stm = if game.board.side_to_move == crate::piece::Color::White { "white" } else { "black" };
    HttpResponse::Ok().json(GameStateResponse {
        game_id: game.id.clone(),
        fen: game.board.to_fen(),
        side_to_move: stm.to_string(),
        pieces: game.board.to_piece_list(),
        status: format!("{:?}", game.status),
        legal_moves: vec![],
        move_history: game.move_history.clone(),
        is_check: false,
    })
}

/// Configure API routes
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/health", web::get().to(health_check))
        .route("/info", web::get().to(engine_info))
        .route("/game/new", web::post().to(new_game))
        .route("/game/{id}", web::get().to(get_game))
        .route("/game/{id}/move", web::post().to(make_move))
        .route("/game/{id}/moves", web::get().to(get_legal_moves))
        .route("/game/{id}/engine-move", web::post().to(engine_move))
        .route("/game/{id}/resign", web::post().to(resign_game))
        .route("/game/{id}/draw", web::post().to(draw_game))
        .route("/evaluate", web::post().to(evaluate_position))
        .route("/analyze", web::post().to(analyze_position))
        .route("/attack-map", web::post().to(attack_map))
        .route("/chess960/random", web::get().to(chess960_random))
        .route("/chess960/{id}", web::get().to(chess960_position))
        .route("/variants", web::get().to(list_variants))
        .route("/game/new-variant", web::post().to(new_variant_game));
}
