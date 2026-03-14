use chess_engine::board::Board;
use chess_engine::evaluation::{evaluate, search_best_move};
use chess_engine::game::GameState;
use chess_engine::moves::generate_legal_moves;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

// ── Application state ──

pub struct EngineState {
    pub games: Mutex<HashMap<String, GameState>>,
    pub ai_base_url: Mutex<String>,
}

// ── Request/Response types ──

#[derive(Serialize)]
pub struct NewGameResponse {
    pub game_id: String,
    pub fen: String,
    pub pieces: Vec<chess_engine::board::PieceInfo>,
    pub legal_moves: Vec<String>,
}

#[derive(Serialize)]
pub struct GameStateResponse {
    pub game_id: String,
    pub fen: String,
    pub side_to_move: String,
    pub pieces: Vec<chess_engine::board::PieceInfo>,
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
    pub pieces: Vec<chess_engine::board::PieceInfo>,
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

// ── Tauri Commands ──

#[tauri::command]
pub fn new_game(state: State<'_, EngineState>, fen: Option<String>) -> Result<NewGameResponse, String> {
    let game = if let Some(fen_str) = fen {
        GameState::from_fen(&fen_str)?
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
    state.games.lock().map_err(|e| e.to_string())?.insert(game_id, game);
    Ok(response)
}

#[tauri::command]
pub fn get_game(state: State<'_, EngineState>, game_id: String) -> Result<GameStateResponse, String> {
    let games = state.games.lock().map_err(|e| e.to_string())?;
    let game = games.get(&game_id).ok_or("Game not found")?;

    Ok(GameStateResponse {
        game_id: game.id.clone(),
        fen: game.board.to_fen(),
        side_to_move: format!("{}", game.board.side_to_move),
        pieces: game.board.to_piece_list(),
        legal_moves: game.get_legal_moves(),
        status: format!("{:?}", game.status),
        move_history: game.move_history.clone(),
        is_check: game.board.is_in_check(),
    })
}

#[tauri::command]
pub fn make_move(state: State<'_, EngineState>, game_id: String, uci: String) -> Result<MoveResponse, String> {
    let mut games = state.games.lock().map_err(|e| e.to_string())?;
    let game = games.get_mut(&game_id).ok_or("Game not found")?;

    let result = game.make_move(&uci)?;
    Ok(MoveResponse {
        success: true,
        move_uci: result.move_uci,
        fen: game.board.to_fen(),
        pieces: game.board.to_piece_list(),
        legal_moves: game.get_legal_moves(),
        captured: result.captured,
        is_check: result.is_check,
        status: format!("{:?}", game.status),
    })
}

#[tauri::command]
pub fn get_legal_moves(state: State<'_, EngineState>, game_id: String) -> Result<Vec<String>, String> {
    let games = state.games.lock().map_err(|e| e.to_string())?;
    let game = games.get(&game_id).ok_or("Game not found")?;
    Ok(game.get_legal_moves())
}

#[tauri::command]
pub fn engine_move(state: State<'_, EngineState>, game_id: String) -> Result<MoveResponse, String> {
    let mut games = state.games.lock().map_err(|e| e.to_string())?;
    let game = games.get_mut(&game_id).ok_or("Game not found")?;

    let depth = 4;
    match search_best_move(&game.board, depth) {
        Some((best_move, _score)) => {
            let uci = best_move.to_uci();
            let result = game.make_move(&uci)?;
            Ok(MoveResponse {
                success: true,
                move_uci: result.move_uci,
                fen: game.board.to_fen(),
                pieces: game.board.to_piece_list(),
                legal_moves: game.get_legal_moves(),
                captured: result.captured,
                is_check: result.is_check,
                status: format!("{:?}", game.status),
            })
        }
        None => Err("No moves available".to_string()),
    }
}

#[tauri::command]
pub fn evaluate_position(fen: String, depth: Option<u8>) -> Result<EvalResponse, String> {
    let board = Board::from_fen(&fen)?;
    let d = depth.unwrap_or(4);
    let eval = evaluate(&board);
    let best = search_best_move(&board, d);
    let legal = generate_legal_moves(&board).iter().map(|m| m.to_uci()).collect();

    Ok(EvalResponse {
        fen,
        evaluation: eval,
        best_move: best.map(|(m, _)| m.to_uci()),
        legal_moves: legal,
    })
}

/// Get/set the AI service base URL (for cloud AI features)
#[tauri::command]
pub fn get_ai_base_url(state: State<'_, EngineState>) -> Result<String, String> {
    Ok(state.ai_base_url.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn set_ai_base_url(state: State<'_, EngineState>, url: String) -> Result<(), String> {
    *state.ai_base_url.lock().map_err(|e| e.to_string())? = url;
    Ok(())
}
