use chess_engine::attacks;
use chess_engine::board::Board;
use chess_engine::evaluation::{evaluate, search_best_move, search_top_moves};
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
    pub resulting_pieces: Vec<chess_engine::board::PieceInfo>,
}

#[derive(Serialize)]
pub struct AnalyzeResponse {
    pub fen: String,
    pub evaluation: i32,
    pub top_moves: Vec<AnalyzedMove>,
    pub total_legal_moves: usize,
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

#[tauri::command]
pub fn get_attack_map(fen: String) -> Result<attacks::AttackMapResponse, String> {
    let board = Board::from_fen(&fen)?;
    Ok(attacks::compute_attack_map(&board, fen))
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

/// Notify the AI service that a game has ended so it can learn from it.
/// This is the Tauri-native equivalent of the browser `gameComplete` API call.
#[tauri::command]
pub async fn notify_game_complete(
    state: State<'_, EngineState>,
    game_id: String,
    result: String,
    player_color: String,
) -> Result<serde_json::Value, String> {
    let ai_base = state.ai_base_url.lock().map_err(|e| e.to_string())?.clone();
    if ai_base.is_empty() {
        // AI service not configured — offline mode, nothing to do.
        return Ok(serde_json::json!({ "learned": false, "reason": "AI service not configured" }));
    }

    let url = format!("{}/ai/game-complete", ai_base.trim_end_matches('/'));
    let payload = serde_json::json!({
        "game_id": game_id,
        "result": result,
        "player_color": player_color
    });

    // Use a blocking HTTP call via reqwest (added to Cargo.toml below)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    match client.post(&url).json(&payload).send().await {
        Ok(resp) if resp.status().is_success() => {
            resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
        }
        Ok(resp) => Err(format!("AI service returned status {}", resp.status())),
        Err(e) => {
            // Non-fatal: log and return gracefully so the game UI isn't blocked.
            log::warn!("Could not notify AI service of game completion: {}", e);
            Ok(serde_json::json!({ "learned": false, "reason": e.to_string() }))
        }
    }
}

#[tauri::command]
pub fn analyze_position(fen: String, depth: Option<u8>, num_moves: Option<usize>) -> Result<AnalyzeResponse, String> {
    let board = Board::from_fen(&fen)?;
    let d = depth.unwrap_or(5);
    let n = num_moves.unwrap_or(5).min(10);
    let eval = evaluate(&board);
    let top = search_top_moves(&board, d, n);
    let total_legal = generate_legal_moves(&board).len();

    let top_moves: Vec<AnalyzedMove> = top.into_iter().map(|(mv, score, pv)| {
        let mut result_board = board.clone();
        let is_capture = board.piece_at(mv.to).is_some() || mv.is_en_passant;
        chess_engine::moves::make_move(&mut result_board, &mv);
        let is_check = result_board.is_in_check();

        let mate_in = if score.abs() > 18000 {
            let plies = 19000 - score.abs();
            let mate_moves = (plies + 1) / 2;
            Some(if score > 0 { mate_moves } else { -mate_moves })
        } else {
            None
        };

        AnalyzedMove {
            uci: mv.to_uci(),
            from: chess_engine::board::square_name(mv.from),
            to: chess_engine::board::square_name(mv.to),
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

    Ok(AnalyzeResponse {
        fen,
        evaluation: eval,
        top_moves,
        total_legal_moves: total_legal,
    })
}
