use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use uuid::Uuid;

use crate::game::{GameState, GameStatus};
use crate::variants::{GameVariant, VariantState};

// ── Multiplayer Room System ──
// Since we're using a REST architecture (no WebSocket dependency needed),
// this implements a polling-based multiplayer system with room codes.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiplayerRoom {
    pub room_id: String,
    pub room_code: String,  // 6-char join code
    pub game_id: Option<String>,
    pub host_id: String,
    pub guest_id: Option<String>,
    pub host_name: String,
    pub guest_name: Option<String>,
    pub host_color: String,  // "white" | "black" | "random"
    pub variant: String,
    pub time_control: Option<TimeControl>,
    pub status: RoomStatus,
    pub created_at: u64,
    pub last_activity: u64,
    pub chat_messages: Vec<ChatMessage>,
    pub spectators: Vec<Spectator>,
    pub rematch_requested_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RoomStatus {
    Waiting,     // Host created, waiting for guest
    Ready,       // Both players joined
    Playing,     // Game in progress
    Finished,    // Game over
    Abandoned,   // Player left
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeControl {
    pub initial_seconds: u32,
    pub increment_seconds: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub sender_id: String,
    pub sender_name: String,
    pub content: ChatContent,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ChatContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "emote")]
    Emote { emote: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spectator {
    pub id: String,
    pub name: String,
    pub joined_at: u64,
}

// ── Shared State ──

pub struct MultiplayerState {
    pub rooms: Mutex<HashMap<String, MultiplayerRoom>>,
    pub player_rooms: Mutex<HashMap<String, String>>,  // player_id -> room_id
    pub leaderboard: Mutex<Vec<LeaderboardEntry>>,
}

impl MultiplayerState {
    pub fn new() -> Self {
        Self {
            rooms: Mutex::new(HashMap::new()),
            player_rooms: Mutex::new(HashMap::new()),
            leaderboard: Mutex::new(Vec::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub player_id: String,
    pub player_name: String,
    pub rating: i32,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub games_played: u32,
    pub last_active: u64,
}

// ── Request/Response Types ──

#[derive(Deserialize)]
pub struct CreateRoomRequest {
    pub player_id: String,
    pub player_name: String,
    pub host_color: Option<String>,
    pub variant: Option<String>,
    pub time_control: Option<TimeControl>,
}

#[derive(Deserialize)]
pub struct JoinRoomRequest {
    pub player_id: String,
    pub player_name: String,
    pub room_code: String,
}

#[derive(Deserialize)]
pub struct SpectateRequest {
    pub spectator_id: String,
    pub spectator_name: String,
}

#[derive(Deserialize)]
pub struct SendChatRequest {
    pub sender_id: String,
    pub sender_name: String,
    pub content: ChatContent,
}

#[derive(Deserialize)]
pub struct PollRequest {
    pub player_id: String,
    pub last_move_count: Option<usize>,
    pub last_chat_count: Option<usize>,
}

#[derive(Deserialize)]
pub struct RoomMoveRequest {
    pub player_id: String,
    pub uci: String,
}

#[derive(Deserialize)]
pub struct UpdateLeaderboardRequest {
    pub player_id: String,
    pub player_name: String,
    pub rating: i32,
    pub result: String,  // "win" | "loss" | "draw"
}

#[derive(Serialize)]
pub struct RoomResponse {
    pub room_id: String,
    pub room_code: String,
    pub status: String,
    pub host_name: String,
    pub guest_name: Option<String>,
    pub game_id: Option<String>,
    pub host_color: String,
    pub variant: String,
    pub spectator_count: usize,
}

#[derive(Serialize)]
pub struct PollResponse {
    pub status: String,
    pub fen: Option<String>,
    pub pieces: Option<Vec<crate::board::PieceInfo>>,
    pub legal_moves: Option<Vec<String>>,
    pub side_to_move: Option<String>,
    pub is_check: bool,
    pub game_status: Option<String>,
    pub move_history: Vec<String>,
    pub new_chat_messages: Vec<ChatMessage>,
    pub spectator_count: usize,
    pub your_turn: bool,
    pub rematch_requested_by: Option<String>,
    pub opponent_connected: bool,
}

// ── Utility ──

fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn generate_room_code() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    (0..6).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}

// ── API Handlers ──

pub async fn create_room(
    mp_state: web::Data<MultiplayerState>,
    game_state: web::Data<crate::api::AppState>,
    body: web::Json<CreateRoomRequest>,
) -> impl Responder {
    let room_id = Uuid::new_v4().to_string();
    let room_code = generate_room_code();
    let now = now_epoch();

    let room = MultiplayerRoom {
        room_id: room_id.clone(),
        room_code: room_code.clone(),
        game_id: None,
        host_id: body.player_id.clone(),
        guest_id: None,
        host_name: body.player_name.clone(),
        guest_name: None,
        host_color: body.host_color.clone().unwrap_or_else(|| "white".to_string()),
        variant: body.variant.clone().unwrap_or_else(|| "standard".to_string()),
        time_control: body.time_control.clone(),
        status: RoomStatus::Waiting,
        created_at: now,
        last_activity: now,
        chat_messages: Vec::new(),
        spectators: Vec::new(),
        rematch_requested_by: None,
    };

    mp_state.rooms.lock().unwrap().insert(room_id.clone(), room);
    mp_state.player_rooms.lock().unwrap().insert(body.player_id.clone(), room_id.clone());

    HttpResponse::Ok().json(RoomResponse {
        room_id,
        room_code,
        status: "Waiting".to_string(),
        host_name: body.player_name.clone(),
        guest_name: None,
        game_id: None,
        host_color: body.host_color.clone().unwrap_or_else(|| "white".to_string()),
        variant: body.variant.clone().unwrap_or_else(|| "standard".to_string()),
        spectator_count: 0,
    })
}

pub async fn join_room(
    mp_state: web::Data<MultiplayerState>,
    game_state: web::Data<crate::api::AppState>,
    body: web::Json<JoinRoomRequest>,
) -> impl Responder {
    let mut rooms = mp_state.rooms.lock().unwrap();

    // Find room by code
    let room_id = rooms.iter()
        .find(|(_, r)| r.room_code == body.room_code && r.status == RoomStatus::Waiting)
        .map(|(id, _)| id.clone());

    let room_id = match room_id {
        Some(id) => id,
        None => return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Room not found or already full"
        })),
    };

    let room = rooms.get_mut(&room_id).unwrap();

    if room.host_id == body.player_id {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Cannot join your own room"
        }));
    }

    room.guest_id = Some(body.player_id.clone());
    room.guest_name = Some(body.player_name.clone());
    room.status = RoomStatus::Ready;
    room.last_activity = now_epoch();

    // Create the game
    let game = GameState::new();
    let game_id = game.id.clone();
    room.game_id = Some(game_id.clone());
    room.status = RoomStatus::Playing;

    game_state.games.lock().unwrap().insert(game_id.clone(), game);
    mp_state.player_rooms.lock().unwrap().insert(body.player_id.clone(), room_id.clone());

    HttpResponse::Ok().json(RoomResponse {
        room_id: room.room_id.clone(),
        room_code: room.room_code.clone(),
        status: "Playing".to_string(),
        host_name: room.host_name.clone(),
        guest_name: room.guest_name.clone(),
        game_id: Some(game_id),
        host_color: room.host_color.clone(),
        variant: room.variant.clone(),
        spectator_count: room.spectators.len(),
    })
}

pub async fn spectate_room(
    mp_state: web::Data<MultiplayerState>,
    path: web::Path<String>,
    body: web::Json<SpectateRequest>,
) -> impl Responder {
    let room_id = path.into_inner();
    let mut rooms = mp_state.rooms.lock().unwrap();

    match rooms.get_mut(&room_id) {
        Some(room) => {
            // Don't add duplicate spectators
            if !room.spectators.iter().any(|s| s.id == body.spectator_id) {
                room.spectators.push(Spectator {
                    id: body.spectator_id.clone(),
                    name: body.spectator_name.clone(),
                    joined_at: now_epoch(),
                });
            }
            HttpResponse::Ok().json(serde_json::json!({
                "status": "spectating",
                "spectator_count": room.spectators.len()
            }))
        }
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Room not found"
        })),
    }
}

pub async fn room_poll(
    mp_state: web::Data<MultiplayerState>,
    game_state: web::Data<crate::api::AppState>,
    path: web::Path<String>,
    body: web::Json<PollRequest>,
) -> impl Responder {
    let room_id = path.into_inner();
    let rooms = mp_state.rooms.lock().unwrap();

    let room = match rooms.get(&room_id) {
        Some(r) => r,
        None => return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Room not found"
        })),
    };

    let games = game_state.games.lock().unwrap();

    let last_move_count = body.last_move_count.unwrap_or(0);
    let last_chat_count = body.last_chat_count.unwrap_or(0);

    let (fen, pieces, legal_moves, side_to_move, is_check, game_status, move_history) = 
        if let Some(game_id) = &room.game_id {
            if let Some(game) = games.get(game_id) {
                (
                    Some(game.board.to_fen()),
                    Some(game.board.to_piece_list()),
                    Some(game.get_legal_moves()),
                    Some(format!("{}", game.board.side_to_move)),
                    game.board.is_in_check(),
                    Some(format!("{:?}", game.status)),
                    game.move_history.clone(),
                )
            } else {
                (None, None, None, None, false, None, Vec::new())
            }
        } else {
            (None, None, None, None, false, None, Vec::new())
        };

    // Determine if it's this player's turn
    let your_turn = if let Some(ref stm) = side_to_move {
        let is_host = body.player_id == room.host_id;
        let host_is_white = room.host_color == "white";
        let white_to_move = stm == "white";
        (is_host && host_is_white && white_to_move) || 
        (is_host && !host_is_white && !white_to_move) ||
        (!is_host && host_is_white && !white_to_move) ||
        (!is_host && !host_is_white && white_to_move)
    } else {
        false
    };

    let new_messages: Vec<ChatMessage> = room.chat_messages
        .iter()
        .skip(last_chat_count)
        .cloned()
        .collect();

    let opponent_connected = room.guest_id.is_some();

    HttpResponse::Ok().json(PollResponse {
        status: format!("{:?}", room.status),
        fen,
        pieces,
        legal_moves,
        side_to_move,
        is_check,
        game_status,
        move_history,
        new_chat_messages: new_messages,
        spectator_count: room.spectators.len(),
        your_turn,
        rematch_requested_by: room.rematch_requested_by.clone(),
        opponent_connected,
    })
}

pub async fn room_move(
    mp_state: web::Data<MultiplayerState>,
    game_state: web::Data<crate::api::AppState>,
    path: web::Path<String>,
    body: web::Json<RoomMoveRequest>,
) -> impl Responder {
    let room_id = path.into_inner();
    let mut rooms = mp_state.rooms.lock().unwrap();

    let room = match rooms.get_mut(&room_id) {
        Some(r) => r,
        None => return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Room not found"
        })),
    };

    if room.status != RoomStatus::Playing {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Game is not in progress"
        }));
    }

    // Verify it's the player's turn
    let game_id = match &room.game_id {
        Some(id) => id.clone(),
        None => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No game in progress"
        })),
    };

    let mut games = game_state.games.lock().unwrap();
    let game = match games.get_mut(&game_id) {
        Some(g) => g,
        None => return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Game not found"
        })),
    };

    match game.make_move(&body.uci) {
        Ok(result) => {
            room.last_activity = now_epoch();

            // Check if game is over
            if game.status != GameStatus::Active {
                room.status = RoomStatus::Finished;
            }

            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "move_uci": result.move_uci,
                "fen": game.board.to_fen(),
                "pieces": game.board.to_piece_list(),
                "legal_moves": game.get_legal_moves(),
                "captured": result.captured,
                "is_check": result.is_check,
                "status": format!("{:?}", game.status),
            }))
        }
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e
        })),
    }
}

pub async fn send_chat(
    mp_state: web::Data<MultiplayerState>,
    path: web::Path<String>,
    body: web::Json<SendChatRequest>,
) -> impl Responder {
    let room_id = path.into_inner();
    let mut rooms = mp_state.rooms.lock().unwrap();

    match rooms.get_mut(&room_id) {
        Some(room) => {
            let msg = ChatMessage {
                id: Uuid::new_v4().to_string(),
                sender_id: body.sender_id.clone(),
                sender_name: body.sender_name.clone(),
                content: body.content.clone(),
                timestamp: now_epoch(),
            };
            room.chat_messages.push(msg.clone());
            room.last_activity = now_epoch();

            HttpResponse::Ok().json(msg)
        }
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Room not found"
        })),
    }
}

pub async fn request_rematch(
    mp_state: web::Data<MultiplayerState>,
    path: web::Path<String>,
    body: web::Json<serde_json::Value>,
) -> impl Responder {
    let room_id = path.into_inner();
    let mut rooms = mp_state.rooms.lock().unwrap();

    match rooms.get_mut(&room_id) {
        Some(room) => {
            let player_id = body.get("player_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if room.rematch_requested_by.is_some() && room.rematch_requested_by.as_deref() != Some(player_id) {
                // Both players want rematch — start new game
                let game = GameState::new();
                let game_id = game.id.clone();
                room.game_id = Some(game_id.clone());
                room.status = RoomStatus::Playing;
                room.rematch_requested_by = None;
                room.last_activity = now_epoch();

                // Swap colors
                if room.host_color == "white" {
                    room.host_color = "black".to_string();
                } else {
                    room.host_color = "white".to_string();
                }

                HttpResponse::Ok().json(serde_json::json!({
                    "status": "rematch_started",
                    "game_id": game_id,
                    "host_color": room.host_color,
                }))
            } else {
                room.rematch_requested_by = Some(player_id.to_string());
                room.last_activity = now_epoch();

                HttpResponse::Ok().json(serde_json::json!({
                    "status": "rematch_requested"
                }))
            }
        }
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Room not found"
        })),
    }
}

pub async fn leave_room(
    mp_state: web::Data<MultiplayerState>,
    path: web::Path<String>,
    body: web::Json<serde_json::Value>,
) -> impl Responder {
    let room_id = path.into_inner();
    let player_id = body.get("player_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut rooms = mp_state.rooms.lock().unwrap();

    match rooms.get_mut(&room_id) {
        Some(room) => {
            room.status = RoomStatus::Abandoned;
            room.last_activity = now_epoch();
            mp_state.player_rooms.lock().unwrap().remove(&player_id);

            HttpResponse::Ok().json(serde_json::json!({
                "status": "left"
            }))
        }
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Room not found"
        })),
    }
}

pub async fn list_rooms(
    mp_state: web::Data<MultiplayerState>,
) -> impl Responder {
    let rooms = mp_state.rooms.lock().unwrap();
    let active: Vec<RoomResponse> = rooms.values()
        .filter(|r| r.status == RoomStatus::Waiting)
        .map(|r| RoomResponse {
            room_id: r.room_id.clone(),
            room_code: r.room_code.clone(),
            status: format!("{:?}", r.status),
            host_name: r.host_name.clone(),
            guest_name: r.guest_name.clone(),
            game_id: r.game_id.clone(),
            host_color: r.host_color.clone(),
            variant: r.variant.clone(),
            spectator_count: r.spectators.len(),
        })
        .collect();

    HttpResponse::Ok().json(active)
}

// ── Leaderboard ──

pub async fn get_leaderboard(
    mp_state: web::Data<MultiplayerState>,
) -> impl Responder {
    let lb = mp_state.leaderboard.lock().unwrap();
    let mut sorted = lb.clone();
    sorted.sort_by(|a, b| b.rating.cmp(&a.rating));
    sorted.truncate(100);
    HttpResponse::Ok().json(sorted)
}

pub async fn update_leaderboard(
    mp_state: web::Data<MultiplayerState>,
    body: web::Json<UpdateLeaderboardRequest>,
) -> impl Responder {
    let mut lb = mp_state.leaderboard.lock().unwrap();

    // Find or create entry
    let entry = lb.iter_mut().find(|e| e.player_id == body.player_id);

    match entry {
        Some(e) => {
            e.player_name = body.player_name.clone();
            e.rating = body.rating;
            match body.result.as_str() {
                "win" => e.wins += 1,
                "loss" => e.losses += 1,
                "draw" => e.draws += 1,
                _ => {}
            }
            e.games_played += 1;
            e.last_active = now_epoch();
        }
        None => {
            let mut entry = LeaderboardEntry {
                player_id: body.player_id.clone(),
                player_name: body.player_name.clone(),
                rating: body.rating,
                wins: 0,
                losses: 0,
                draws: 0,
                games_played: 1,
                last_active: now_epoch(),
            };
            match body.result.as_str() {
                "win" => entry.wins = 1,
                "loss" => entry.losses = 1,
                "draw" => entry.draws = 1,
                _ => {}
            }
            lb.push(entry);
        }
    }

    HttpResponse::Ok().json(serde_json::json!({ "status": "updated" }))
}

// ── Tournament System ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tournament {
    pub id: String,
    pub name: String,
    pub format: TournamentFormat,
    pub variant: String,
    pub time_control: Option<TimeControl>,
    pub players: Vec<TournamentPlayer>,
    pub rounds: Vec<TournamentRound>,
    pub status: TournamentStatus,
    pub current_round: usize,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TournamentFormat {
    Swiss,
    RoundRobin,
    Elimination,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TournamentStatus {
    Registration,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TournamentPlayer {
    pub player_id: String,
    pub player_name: String,
    pub rating: i32,
    pub score: f32,
    pub tiebreak: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TournamentRound {
    pub round_number: usize,
    pub pairings: Vec<TournamentPairing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TournamentPairing {
    pub white_id: String,
    pub black_id: String,
    pub result: Option<String>,  // "1-0", "0-1", "1/2-1/2"
    pub room_id: Option<String>,
}

/// Configure multiplayer routes
pub fn configure_multiplayer_routes(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/multiplayer/rooms", web::get().to(list_rooms))
        .route("/multiplayer/room/create", web::post().to(create_room))
        .route("/multiplayer/room/join", web::post().to(join_room))
        .route("/multiplayer/room/{id}/spectate", web::post().to(spectate_room))
        .route("/multiplayer/room/{id}/poll", web::post().to(room_poll))
        .route("/multiplayer/room/{id}/move", web::post().to(room_move))
        .route("/multiplayer/room/{id}/chat", web::post().to(send_chat))
        .route("/multiplayer/room/{id}/rematch", web::post().to(request_rematch))
        .route("/multiplayer/room/{id}/leave", web::post().to(leave_room))
        .route("/leaderboard", web::get().to(get_leaderboard))
        .route("/leaderboard/update", web::post().to(update_leaderboard));
}
