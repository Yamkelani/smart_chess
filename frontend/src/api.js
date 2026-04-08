/**
 * API client for communicating with the Rust engine and Python AI service.
 * 
 * Supports two modes:
 *   - Browser/Docker: HTTP fetch via nginx proxy
 *   - Tauri (native app): Engine calls via invoke(), AI calls via configured cloud URL
 */
import { isTauri, invoke, getAiBaseUrl, getEngineBaseUrl } from './bridge.js';

function getEngineBase() { return getEngineBaseUrl(); }
function getAiBase() { return getAiBaseUrl(); }

export class ChessAPI {
  /**
   * Create a new game on the engine
   */
  async newGame(fen = null) {
    if (isTauri()) {
      return invoke('new_game', { fen: fen || null });
    }
    const body = fen ? { fen } : {};
    const resp = await fetch(`${getEngineBase()}/game/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async getGame(gameId) {
    if (isTauri()) {
      return invoke('get_game', { gameId });
    }
    const resp = await fetch(`${getEngineBase()}/game/${gameId}`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async makeMove(gameId, uci) {
    if (isTauri()) {
      return invoke('make_move', { gameId, uci });
    }
    const resp = await fetch(`${getEngineBase()}/game/${gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uci }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async getLegalMoves(gameId) {
    if (isTauri()) {
      return invoke('get_legal_moves', { gameId });
    }
    const resp = await fetch(`${getEngineBase()}/game/${gameId}/moves`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async engineMove(gameId, depth = 4) {
    if (isTauri()) {
      return invoke('engine_move', { gameId, depth });
    }
    const resp = await fetch(`${getEngineBase()}/game/${gameId}/engine-move?depth=${depth}`, {
      method: 'POST',
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Request an AI move. Retries up to MAX_AI_RETRIES times with exponential backoff
   * before giving up and returning null (caller falls back to the Rust engine).
   *
   * Dispatches a custom 'ai-status' event on window so the UI can show a
   * "AI thinking…" / "AI unavailable" banner without coupling this module to the DOM.
   *   event.detail = { status: 'thinking' | 'unavailable' | 'ready', attempt: number }
   */
  async aiMove(fen, difficulty = 'intermediate', gameId = null, playerColor = 'white', personality = 'default') {
    const aiBase = getAiBase();
    if (!aiBase) return null; // AI not configured in native mode

    const MAX_RETRIES = 2;
    const BASE_DELAY_MS = 500;

    const body = { fen, difficulty, personality };
    if (gameId) {
      body.game_id = gameId;
      body.player_color = playerColor;
    }

    window.dispatchEvent(new CustomEvent('ai-status', { detail: { status: 'thinking', attempt: 1 } }));

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        const resp = await fetch(`${aiBase}/ai/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000), // 15 s per attempt
        });
        if (resp.ok) {
          window.dispatchEvent(new CustomEvent('ai-status', { detail: { status: 'ready', attempt } }));
          return { source: 'ai', ...(await resp.json()) };
        }
        // Non-2xx response — don't retry (bad request, auth error, etc.)
        console.warn(`AI service returned ${resp.status}, falling back to engine`);
        break;
      } catch (e) {
        if (attempt <= MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`AI service attempt ${attempt} failed (${e.message}), retrying in ${delay}ms…`);
          window.dispatchEvent(new CustomEvent('ai-status', { detail: { status: 'thinking', attempt: attempt + 1 } }));
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.warn('AI service unavailable after retries, falling back to engine');
        }
      }
    }

    window.dispatchEvent(new CustomEvent('ai-status', { detail: { status: 'unavailable', attempt: MAX_RETRIES + 1 } }));
    return null;
  }

  async gameComplete(gameId, result, playerColor = 'white') {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/game-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, result, player_color: playerColor }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.learned) {
          console.log(`AI learned from game: ${data.positions_added} positions, buffer: ${data.buffer_size}`);
        }
        return data;
      }
    } catch (e) {
      console.warn('Could not signal game completion to AI service');
    }
    return null;
  }

  async evaluate(fen, depth = 4) {
    if (isTauri()) {
      return invoke('evaluate_position', { fen, depth });
    }
    const resp = await fetch(`${getEngineBase()}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, depth }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Analyze a position and return top N moves with evaluations and principal variations.
   * Each move includes: uci, from, to, score, mate_in, is_capture, is_check,
   * principal_variation (UCI strings), resulting_fen, resulting_pieces.
   * @param {string} fen - Position FEN
   * @param {number} [depth=5] - Search depth
   * @param {number} [numMoves=5] - Number of top moves to return
   * @returns {Promise<{fen, evaluation, top_moves: AnalyzedMove[], total_legal_moves}>}
   */
  async analyzePosition(fen, depth = 5, numMoves = 5) {
    if (isTauri()) {
      return invoke('analyze_position', { fen, depth, numMoves });
    }
    const resp = await fetch(`${getEngineBase()}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, depth, num_moves: numMoves }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Compute the full attack & defense map for a position.
   * Returns { fen, squares: SquareInfo[], hanging_pieces: HangingPiece[],
   *           white_controlled, black_controlled, contested }
   * where each SquareInfo has: square, white_attackers[], black_attackers[],
   * white_count, black_count, control ("white"|"black"|"contested"|"neutral").
   */
  async getAttackMap(fen) {
    if (isTauri()) {
      return invoke('get_attack_map', { fen });
    }
    const resp = await fetch(`${getEngineBase()}/attack-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async getLearningStatus() {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/learning`);
      if (resp.ok) return resp.json();
    } catch (e) { /* Service unavailable */ }
    return null;
  }

  // ── Chess Tutor / Coach API ──

  async askTutor(question, fen = null) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const body = { question };
      if (fen) body.fen = fen;
      const resp = await fetch(`${aiBase}/ai/tutor/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Tutor service unavailable');
    }
    return null;
  }

  async getTutorLessons() {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/tutor/lessons`);
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Tutor lessons unavailable');
    }
    return null;
  }

  async getTutorLessonDetail(lessonId) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/tutor/lesson/${lessonId}`);
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Lesson detail unavailable');
    }
    return null;
  }

  // ── Puzzle API ──

  async getPuzzles(minRating = 0, maxRating = 3000, theme = null, limit = 10) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const body = { min_rating: minRating, max_rating: maxRating, limit };
      if (theme) body.theme = theme;
      const resp = await fetch(`${aiBase}/ai/puzzles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Puzzle service unavailable');
    }
    return null;
  }

  async checkPuzzleMove(puzzleId, moveIndex, move) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/puzzles/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzle_id: puzzleId, move_index: moveIndex, move }),
      });
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Puzzle check unavailable');
    }
    return null;
  }

  // ── Game Review API ──

  async reviewGame(fens, moves, onProgress) {
    const aiBase = getAiBase();
    if (aiBase) {
      try {
        const resp = await fetch(`${aiBase}/ai/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fens, moves }),
        });
        if (resp.ok) return resp.json();
      } catch (e) {
        console.warn('AI review service unavailable, using engine review');
      }
    }
    // Fall back to local engine-based review
    return this._localReview(fens, moves, onProgress);
  }

  /**
   * Local game review using the engine's evaluate endpoint.
   * Evaluates each position before and after each move to classify quality.
   * @param {string[]} fens - FEN strings for each position
   * @param {string[]} moves - Move strings (SAN or UCI)
   * @param {Function} [onProgress] - optional callback(current, total)
   */
  async _localReview(fens, moves, onProgress) {
    if (!fens || fens.length < 2) return null;
    const depth = 6;
    const evaluations = [];
    let totalCpl = 0;
    let playerMoves = 0;

    // Evaluate all positions (before each move and after the last move)
    const scores = [];
    for (let i = 0; i < fens.length; i++) {
      try {
        const result = await this.evaluate(fens[i], depth);
        // Normalise: score from white's perspective in centipawns
        scores.push(typeof result.score === 'number' ? result.score : 0);
      } catch {
        scores.push(0);
      }
      if (onProgress) onProgress(i + 1, fens.length);
    }

    // Compare consecutive evaluations to classify each move
    for (let i = 0; i < moves.length && i < fens.length - 1; i++) {
      const before = scores[i];
      const after = scores[i + 1];
      const isWhite = i % 2 === 0;

      // centipawn loss: how much worse the position got for the side that moved
      const cpl = isWhite ? (before - after) : (after - before);
      const absCpl = Math.max(0, cpl);

      let classification;
      if (cpl < -50) classification = 'brilliant';
      else if (absCpl <= 10) classification = 'good';
      else if (absCpl <= 30) classification = 'book';
      else if (absCpl <= 80) classification = 'inaccuracy';
      else if (absCpl <= 200) classification = 'mistake';
      else classification = 'blunder';

      evaluations.push({
        move: moves[i] || '',
        evaluation: after / 100,
        classification,
        cpl: absCpl,
      });

      totalCpl += absCpl;
      playerMoves++;
    }

    // Accuracy: rough formula inspired by Lichess (capped 0-100)
    const avgCpl = playerMoves > 0 ? totalCpl / playerMoves : 0;
    const accuracy = Math.round(Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avgCpl))));

    return { accuracy, evaluations, source: 'engine' };
  }

  // ── AI Personality API ──

  async getPersonalities() {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/personalities`);
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Personalities unavailable');
    }
    return null;
  }

  // ── Practice / Drill API ──

  async getDrillCategories() {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/drills/categories`);
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Drill categories unavailable');
    }
    return null;
  }

  async getDrillsByCategory(categoryId) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/drills/category/${encodeURIComponent(categoryId)}`);
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Drills unavailable');
    }
    return null;
  }

  async getDrill(drillId) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/drills/${encodeURIComponent(drillId)}`);
      if (resp.ok) return resp.json();
    } catch (e) {}
    return null;
  }

  async getDrillHint(drillId) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/drills/${encodeURIComponent(drillId)}/hint`);
      if (resp.ok) return resp.json();
    } catch (e) {}
    return null;
  }

  async importPGN(pgnText) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/pgn/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: pgnText }),
      });
      if (resp.ok) return resp.json();
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'PGN parse failed');
    } catch (e) {
      throw e;
    }
  }

  async checkDrillMove(drillId, moveIndex, move) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/drills/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drill_id: drillId, move_index: moveIndex, move }),
      });
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Drill check unavailable');
    }
    return null;
  }

  // ── Chess960 ──

  async chess960Random() {
    if (isTauri()) {
      return invoke('chess960_random', {});
    }
    const resp = await fetch(`${getEngineBase()}/chess960/random`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async chess960Position(id) {
    if (isTauri()) {
      return invoke('chess960_position', { id });
    }
    const resp = await fetch(`${getEngineBase()}/chess960/${id}`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  // ── Variants ──

  async listVariants() {
    if (isTauri()) {
      return invoke('list_variants', {});
    }
    const resp = await fetch(`${getEngineBase()}/variants`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async newVariantGame(variant, fen = null) {
    if (isTauri()) {
      return invoke('new_variant_game', { variant, fen: fen || null });
    }
    const body = { variant };
    if (fen) body.fen = fen;
    const resp = await fetch(`${getEngineBase()}/game/new-variant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  // ── Multiplayer ──

  async mpCreateRoom(options = {}) {
    const resp = await fetch(`${getEngineBase()}/multiplayer/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async mpJoinRoom(code, playerName) {
    const resp = await fetch(`${getEngineBase()}/multiplayer/room/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_name: playerName }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async mpGetRoom(code) {
    const resp = await fetch(`${getEngineBase()}/multiplayer/room/${code}`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async mpMakeMove(code, playerId, uci) {
    const resp = await fetch(`${getEngineBase()}/multiplayer/room/${code}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId, uci }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async mpChat(code, playerId, content) {
    const resp = await fetch(`${getEngineBase()}/multiplayer/room/${code}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: playerId, content }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async mpListRooms() {
    const resp = await fetch(`${getEngineBase()}/multiplayer/room/list`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async mpLeaveRoom(code, playerId) {
    const resp = await fetch(`${getEngineBase()}/multiplayer/room/${code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async getLeaderboard() {
    const resp = await fetch(`${getEngineBase()}/leaderboard`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }
}
