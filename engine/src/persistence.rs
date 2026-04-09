//! Simple file-based game persistence.
//!
//! Games are serialized as JSON to `GAMES_DIR` (default: `./data/games/`).
//! Each game is stored in its own `<game_id>.json` file so writes are
//! localized and concurrent reads remain fast.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::game::GameState;

fn games_dir() -> PathBuf {
    let dir = std::env::var("GAMES_DIR").unwrap_or_else(|_| "./data/games".to_string());
    PathBuf::from(dir)
}

/// Persist a single game to disk. Called after every move and on creation.
pub fn save_game(game: &GameState) -> Result<(), String> {
    let dir = games_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create games dir: {}", e))?;
    let path = dir.join(format!("{}.json", game.id));
    let json = serde_json::to_string(game).map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Write error for {}: {}", path.display(), e))
}

/// Load all persisted games from disk into a HashMap.
pub fn load_games() -> Result<HashMap<String, GameState>, String> {
    let dir = games_dir();
    if !dir.exists() {
        return Ok(HashMap::new());
    }

    let mut games = HashMap::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("Cannot read games dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match fs::read_to_string(&path) {
            Ok(json) => match serde_json::from_str::<GameState>(&json) {
                Ok(mut game) => {
                    // Rebuild derived caches that are skipped during serialization
                    game.board.rebuild_mailbox();
                    games.insert(game.id.clone(), game);
                }
                Err(e) => {
                    log::warn!("Skipping corrupt game file {}: {}", path.display(), e);
                }
            },
            Err(e) => {
                log::warn!("Cannot read {}: {}", path.display(), e);
            }
        }
    }

    Ok(games)
}

/// Load a single game by ID from disk. Returns None if not found or corrupt.
pub fn load_game(game_id: &str) -> Option<GameState> {
    let path = games_dir().join(format!("{}.json", game_id));
    let json = fs::read_to_string(&path).ok()?;
    match serde_json::from_str::<GameState>(&json) {
        Ok(mut game) => {
            game.board.rebuild_mailbox();
            Some(game)
        }
        Err(e) => {
            log::warn!("Corrupt game file {}: {}", path.display(), e);
            None
        }
    }
}

/// Delete a game file from disk (e.g. after it ends or is abandoned).
#[allow(dead_code)]
pub fn delete_game(game_id: &str) {
    let path = games_dir().join(format!("{}.json", game_id));
    if let Err(e) = fs::remove_file(&path) {
        log::warn!("Could not delete game file {}: {}", path.display(), e);
    }
}
