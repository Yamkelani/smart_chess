use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

use crate::board::Board;
use crate::evaluation::{evaluate, search_best_move};
use crate::game::GameState;
use crate::moves::generate_legal_moves;

pub struct AppState {
    pub games: Mutex<HashMap<String, GameState>>,
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
    data.games.lock().unwrap().insert(game_id, game);

    HttpResponse::Ok().json(response)
}

pub async fn get_game(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let game_id = path.into_inner();
    let games = data.games.lock().unwrap();

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
    let mut games = data.games.lock().unwrap();

    match games.get_mut(&game_id) {
        Some(game) => {
            match game.make_move(&body.uci) {
                Ok(result) => {
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
    let games = data.games.lock().unwrap();

    match games.get(&game_id) {
        Some(game) => HttpResponse::Ok().json(game.get_legal_moves()),
        None => HttpResponse::NotFound().json(ErrorResponse {
            error: "Game not found".to_string(),
        }),
    }
}

pub async fn evaluate_position(body: web::Json<EvalRequest>) -> impl Responder {
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
) -> impl Responder {
    let game_id = path.into_inner();
    let mut games = data.games.lock().unwrap();

    match games.get_mut(&game_id) {
        Some(game) => {
            let depth = 4;
            match search_best_move(&game.board, depth) {
                Some((best_move, score)) => {
                    let uci = best_move.to_uci();
                    match game.make_move(&uci) {
                        Ok(result) => {
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
        .route("/evaluate", web::post().to(evaluate_position));
}
