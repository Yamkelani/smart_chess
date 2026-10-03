/**
 * Tauri/Native API bridge
 * 
 * When running inside Tauri (desktop/mobile app), calls go directly to the
 * embedded Rust chess engine via invoke(). No HTTP server needed.
 * 
 * When running in a browser (web/Docker), calls go via HTTP fetch() to the
 * backend services through the nginx proxy.
 * 
 * AI features (MCTS, puzzles, review, tutor) always use HTTP to reach the
 * AI service — either locally (Docker) or via cloud endpoint.
 */

let _invoke = null;
let _aiBaseUrl = '';

/**
 * Detect if we're running inside a Tauri app
 */
export function isTauri() {
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

/**
 * Initialize the bridge. Must be called once at startup.
 */
export async function initBridge() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      _invoke = invoke;
      // Get the configured AI base URL from the Rust side
      try {
        _aiBaseUrl = await _invoke('get_ai_base_url');
      } catch {
        _aiBaseUrl = '';
      }
      console.log('[Bridge] Running in Tauri mode (native app)');
      console.log('[Bridge] AI service URL:', _aiBaseUrl || '(disabled)');
    } catch (e) {
      console.warn('[Bridge] Tauri detected but API import failed, falling back to HTTP:', e);
      _invoke = null;
    }
  } else {
    console.log('[Bridge] Running in browser mode (HTTP)');
  }
}

/**
 * Call a Tauri command (only works in Tauri mode)
 */
export async function invoke(cmd, args = {}) {
  if (!_invoke) throw new Error('Not running in Tauri');
  return _invoke(cmd, args);
}

/**
 * Get the AI service base URL for HTTP calls
 * In browser mode: uses /api/ai (proxied by nginx)
 * In Tauri mode: uses the configured cloud URL
 */
export function getAiBaseUrl() {
  if (isTauri()) {
    return _aiBaseUrl;
  }
  return '/api/ai';
}

/**
 * Get the engine base URL for HTTP calls (browser mode only)
 */
export function getEngineBaseUrl() {
  return '/api/engine';
}

// ── Guest session ────────────────────────────────────────────────
// The engine issues a signed guest token (POST /session) that identifies this
// browser on later requests. The embedded Tauri engine is local and needs none.

const SESSION_KEY = 'chess3d_session';
const RENEW_MARGIN_MS = 24 * 60 * 60 * 1000;
let _sessionRequest = null;

function _storedSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    return s && s.token && s.expires_at * 1000 - RENEW_MARGIN_MS > Date.now() ? s : null;
  } catch {
    return null;
  }
}

async function _sessionToken() {
  if (isTauri()) return null;
  const stored = _storedSession();
  if (stored) return stored.token;
  if (!_sessionRequest) {
    _sessionRequest = fetch(`${getEngineBaseUrl()}/session`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (!s || !s.token) return null;
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
        return s.token;
      })
      .catch(() => null)
      .finally(() => { _sessionRequest = null; });
  }
  return _sessionRequest;
}

/**
 * fetch() for our own engine and AI service: attaches the guest token when
 * one is available, and otherwise sends the request unchanged.
 */
export async function apiFetch(url, options = {}) {
  const token = await _sessionToken();
  if (!token) return fetch(url, options);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}
