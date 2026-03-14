mod engine;

use engine::EngineState;
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine_state = EngineState {
        games: Mutex::new(HashMap::new()),
        ai_base_url: Mutex::new("https://chess3d-ai.example.com".to_string()),
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
            engine::get_ai_base_url,
            engine::set_ai_base_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running 3D Chess");
}
