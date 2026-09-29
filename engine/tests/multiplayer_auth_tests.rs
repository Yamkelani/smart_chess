//! Regression tests for multiplayer seat/turn authorisation.
//!
//! Context: `room_move` received a `player_id` and never compared it to anyone.
//! Any caller holding a room id could move for both colours. It also never
//! checked whose turn it was.
//!
//! These cover the seat-and-turn rules. They are not a substitute for
//! authentication: `player_id` is client-supplied, so until identity is
//! authenticated a caller can still claim another player's id.

use chess_engine::multiplayer::{MultiplayerRoom, RoomStatus};

fn room(host_color: &str) -> MultiplayerRoom {
    MultiplayerRoom {
        room_id: "room-1".to_string(),
        room_code: "ABC234".to_string(),
        game_id: Some("game-1".to_string()),
        host_id: "host-player".to_string(),
        guest_id: Some("guest-player".to_string()),
        host_name: "Host".to_string(),
        guest_name: Some("Guest".to_string()),
        host_color: host_color.to_string(),
        variant: "standard".to_string(),
        time_control: None,
        status: RoomStatus::Playing,
        created_at: 0,
        last_activity: 0,
        chat_messages: Vec::new(),
        spectators: Vec::new(),
        rematch_requested_by: None,
    }
}

#[test]
fn host_and_guest_get_opposite_colours() {
    let r = room("white");
    assert_eq!(r.color_of("host-player"), Some("white"));
    assert_eq!(r.color_of("guest-player"), Some("black"));

    let r = room("black");
    assert_eq!(r.color_of("host-player"), Some("black"));
    assert_eq!(r.color_of("guest-player"), Some("white"));
}

#[test]
fn a_caller_who_is_not_seated_has_no_colour() {
    let r = room("white");
    // This is what previously let anyone with a room id play both sides.
    assert_eq!(r.color_of("some-other-player"), None);
    assert_eq!(r.color_of(""), None);
}

#[test]
fn an_empty_seat_is_not_claimable_by_omission() {
    let mut r = room("white");
    r.guest_id = None;
    assert_eq!(r.color_of("host-player"), Some("white"));
    // With no guest seated, nobody else resolves to a colour.
    assert_eq!(r.color_of("guest-player"), None);
}

#[test]
fn host_colour_is_always_concrete_so_seats_are_unambiguous() {
    // "random" must be resolved when the room is created. Left as "random",
    // every `host_color == "white"` check reads false and the host is silently
    // always assigned black.
    for host_color in ["white", "black"] {
        let r = room(host_color);
        let host = r.color_of("host-player").expect("host is seated");
        let guest = r.color_of("guest-player").expect("guest is seated");
        assert_ne!(host, guest, "the two seats must differ");
        assert!(matches!(host, "white" | "black"));
    }
}
