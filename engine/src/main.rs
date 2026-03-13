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

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let port = std::env::var("ENGINE_PORT").unwrap_or_else(|_| "8081".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);

    log::info!("🏁 3D Chess Rust Engine starting on {}", bind_addr);

    let app_state = web::Data::new(api::AppState {
        games: Mutex::new(HashMap::new()),
    });

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(app_state.clone())
            .configure(api::configure_routes)
    })
    .bind(&bind_addr)?
    .run()
    .await
}
