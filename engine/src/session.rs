//! Guest identity: signed, stateless session tokens.
//!
//! A token is `v1.<player_id>.<expires_at>.<signature>`, where the signature
//! is HMAC-SHA256 over `v1.<player_id>.<expires_at>` with a server secret.
//! Verifying needs only the secret, so nothing is stored server-side and any
//! instance sharing the secret accepts the token.

use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const VERSION: &str = "v1";
const MIN_SECRET_LEN: usize = 32;
const DEFAULT_TTL_DAYS: u64 = 365;

#[derive(Debug, Clone, Serialize)]
pub struct Session {
    pub player_id: String,
    pub token: String,
    /// Unix seconds.
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionError {
    Malformed,
    BadSignature,
    Expired,
}

pub struct SessionConfig {
    secret: Vec<u8>,
    pub ttl_secs: u64,
}

impl SessionConfig {
    pub fn new(secret: Vec<u8>, ttl_secs: u64) -> Result<Self, String> {
        if secret.len() < MIN_SECRET_LEN {
            return Err(format!(
                "session secret must be at least {MIN_SECRET_LEN} bytes"
            ));
        }
        Ok(Self { secret, ttl_secs })
    }

    /// Reads SESSION_SECRET and SESSION_TTL_DAYS. Without a secret, a random
    /// one is generated, so tokens stop verifying when the process restarts.
    pub fn from_env() -> Result<Self, String> {
        let ttl_days =
            match std::env::var("SESSION_TTL_DAYS") {
                Ok(v) => v.parse::<u64>().ok().filter(|d| *d > 0).ok_or_else(|| {
                    format!("SESSION_TTL_DAYS must be a positive integer, got '{v}'")
                })?,
                Err(_) => DEFAULT_TTL_DAYS,
            };
        // An empty value counts as unset (compose passes `${VAR:-}` as "").
        let secret = match std::env::var("SESSION_SECRET") {
            Ok(s) if !s.is_empty() => s.into_bytes(),
            _ => {
                log::warn!(
                    "SESSION_SECRET is not set; using a random secret. \
                     Guest sessions will not survive a restart. Set it in production."
                );
                (0..MIN_SECRET_LEN).map(|_| rand::random::<u8>()).collect()
            }
        };
        Self::new(secret, ttl_days * 86_400)
    }

    pub fn issue(&self, now: u64) -> Session {
        let player_id = uuid::Uuid::new_v4().simple().to_string();
        let expires_at = now + self.ttl_secs;
        let payload = format!("{VERSION}.{player_id}.{expires_at}");
        let token = format!("{payload}.{}", hex(&self.sign(&payload)));
        Session {
            player_id,
            token,
            expires_at,
        }
    }

    /// Returns the player id if the token is genuine and unexpired.
    pub fn verify(&self, token: &str, now: u64) -> Result<String, SessionError> {
        let parts: Vec<&str> = token.split('.').collect();
        let [version, player_id, expires_at, signature] = parts[..] else {
            return Err(SessionError::Malformed);
        };
        if version != VERSION || player_id.is_empty() {
            return Err(SessionError::Malformed);
        }
        let expires_at: u64 = expires_at.parse().map_err(|_| SessionError::Malformed)?;
        let signature = unhex(signature).ok_or(SessionError::Malformed)?;

        let mut mac = self.mac();
        mac.update(format!("{version}.{player_id}.{expires_at}").as_bytes());
        // verify_slice compares in constant time.
        mac.verify_slice(&signature)
            .map_err(|_| SessionError::BadSignature)?;

        if now >= expires_at {
            return Err(SessionError::Expired);
        }
        Ok(player_id.to_string())
    }

    fn mac(&self) -> HmacSha256 {
        HmacSha256::new_from_slice(&self.secret).expect("HMAC accepts keys of any length")
    }

    fn sign(&self, payload: &str) -> Vec<u8> {
        let mut mac = self.mac();
        mac.update(payload.as_bytes());
        mac.finalize().into_bytes().to_vec()
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) || !s.is_ascii() {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}
