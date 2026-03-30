use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use std::collections::HashMap;
use std::sync::Mutex;

mod board;
mod piece;
mod moves;
mod evaluation;
mod game;
mod api;
mod persistence;
pub mod attacks;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let port = std::env::var("ENGINE_PORT").unwrap_or_else(|_| "8081".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);

    log::info!("3D Chess Rust Engine starting on {}", bind_addr);

    // Load persisted games from disk (survive restarts)
    let initial_games = persistence::load_games().unwrap_or_else(|e| {
        log::warn!("Could not load persisted games: {}", e);
        HashMap::new()
    });
    log::info!("Loaded {} persisted game(s) from disk", initial_games.len());

    let app_state = web::Data::new(api::AppState {
        games: Mutex::new(initial_games),
    });

    // Allowed CORS origins — set ALLOWED_ORIGINS env var as a comma-separated list.
    // Defaults to localhost dev origins only.
    let allowed_origins: Vec<String> = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173,http://localhost:1420,http://127.0.0.1:5173".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    HttpServer::new(move || {
        let mut cors = Cors::default()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);
        for origin in &allowed_origins {
            cors = cors.allowed_origin(origin);
        }

        App::new()
            .wrap(cors)
            .app_data(app_state.clone())
            .configure(api::configure_routes)
    })
    .bind(&bind_addr)?
    .run()
    .await
}
