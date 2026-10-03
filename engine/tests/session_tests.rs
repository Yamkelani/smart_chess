//! Guest session tokens: a token proves "same player as before" only if it
//! was signed with the server secret and has not expired.

use actix_web::{test as actix_test, web, App};
use chess_engine::api::configure_routes;
use chess_engine::session::{SessionConfig, SessionError};
use serde_json::Value;

const SECRET: &[u8] = b"test-secret-that-is-at-least-32-bytes!!";
const NOW: u64 = 1_800_000_000;
const DAY: u64 = 86_400;

fn config() -> SessionConfig {
    SessionConfig::new(SECRET.to_vec(), 365 * DAY).unwrap()
}

/// Replace one dot-separated field of a token.
fn with_field(token: &str, index: usize, value: &str) -> String {
    let mut parts: Vec<String> = token.split('.').map(String::from).collect();
    parts[index] = value.to_string();
    parts.join(".")
}

#[test]
fn issued_token_verifies_to_its_player() {
    let cfg = config();
    let s = cfg.issue(NOW);
    assert_eq!(s.expires_at, NOW + 365 * DAY);
    assert_eq!(cfg.verify(&s.token, NOW), Ok(s.player_id.clone()));
    assert_ne!(
        cfg.issue(NOW).player_id,
        s.player_id,
        "player ids must be unique"
    );
}

#[test]
fn tampered_tokens_are_rejected() {
    let cfg = config();
    let token = cfg.issue(NOW).token;
    let other = cfg.issue(NOW).player_id;

    // Claim someone else's id, extend the expiry, or alter the signature.
    assert_eq!(
        cfg.verify(&with_field(&token, 1, &other), NOW),
        Err(SessionError::BadSignature)
    );
    let later = (NOW + 3650 * DAY).to_string();
    assert_eq!(
        cfg.verify(&with_field(&token, 2, &later), NOW),
        Err(SessionError::BadSignature)
    );
    let sig = token.rsplit('.').next().unwrap();
    let flipped = format!(
        "{}{}",
        if sig.starts_with('0') { '1' } else { '0' },
        &sig[1..]
    );
    assert_eq!(
        cfg.verify(&with_field(&token, 3, &flipped), NOW),
        Err(SessionError::BadSignature)
    );
}

#[test]
fn token_from_another_secret_is_rejected() {
    let other =
        SessionConfig::new(b"a-completely-different-32-byte-secret!".to_vec(), DAY).unwrap();
    let token = other.issue(NOW).token;
    assert_eq!(
        config().verify(&token, NOW),
        Err(SessionError::BadSignature)
    );
}

#[test]
fn expired_token_is_rejected() {
    let cfg = SessionConfig::new(SECRET.to_vec(), DAY).unwrap();
    let token = cfg.issue(NOW).token;
    assert!(cfg.verify(&token, NOW + DAY - 1).is_ok());
    assert_eq!(cfg.verify(&token, NOW + DAY), Err(SessionError::Expired));
}

#[test]
fn malformed_tokens_are_rejected() {
    let cfg = config();
    let good = cfg.issue(NOW).token;
    for bad in [
        "",
        "not-a-token",
        "v1.abc.123",
        "v1.abc.123.zz",
        "v1..123.00",
        "v1.abc.notanumber.00",
        &with_field(&good, 0, "v2"),
        &format!("{good}.extra"),
    ] {
        assert_eq!(
            cfg.verify(bad, NOW),
            Err(SessionError::Malformed),
            "{bad:?}"
        );
    }
}

#[test]
fn short_secret_is_refused() {
    assert!(SessionConfig::new(b"too-short".to_vec(), DAY).is_err());
}

#[actix_web::test]
async fn session_endpoint_issues_a_verifiable_token() {
    let app = actix_test::init_service(
        App::new()
            .app_data(web::Data::new(config()))
            .configure(configure_routes),
    )
    .await;
    let req = actix_test::TestRequest::post().uri("/session").to_request();
    let body: Value = actix_test::call_and_read_body_json(&app, req).await;

    let token = body["token"].as_str().unwrap();
    let player_id = body["player_id"].as_str().unwrap();
    let expires_at = body["expires_at"].as_u64().unwrap();
    assert_eq!(
        config().verify(token, expires_at - 1).as_deref(),
        Ok(player_id)
    );
}
