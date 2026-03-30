mod engine;

use engine::EngineState;
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // AI service URL is read from the environment at startup.
    // Leave AI_SERVICE_URL unset (or empty) for fully offline / local play.
    let ai_base_url = std::env::var("AI_SERVICE_URL").unwrap_or_default();

    let engine_state = EngineState {
        games: Mutex::new(HashMap::new()),
        ai_base_url: Mutex::new(ai_base_url),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(engine_state)
        .invoke_handler(tauri::generate_handler![
            engine::new_game,
            engine::get_game,
            engine::make_move,
            engine::get_legal_moves,
            engine::engine_move,
            engine::evaluate_position,
            engine::analyze_position,
            engine::get_attack_map,
            engine::get_ai_base_url,
            engine::set_ai_base_url,
            engine::notify_game_complete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running 3D Chess");
}
