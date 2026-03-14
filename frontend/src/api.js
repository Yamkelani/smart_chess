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

  async engineMove(gameId) {
    if (isTauri()) {
      return invoke('engine_move', { gameId });
    }
    const resp = await fetch(`${getEngineBase()}/game/${gameId}/engine-move`, {
      method: 'POST',
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  async aiMove(fen, difficulty = 'intermediate', gameId = null, playerColor = 'white', personality = 'default') {
    const aiBase = getAiBase();
    if (!aiBase) return null; // AI not configured in native mode
    try {
      const body = { fen, difficulty, personality };
      if (gameId) {
        body.game_id = gameId;
        body.player_color = playerColor;
      }
      const resp = await fetch(`${aiBase}/ai/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) return { source: 'ai', ...(await resp.json()) };
    } catch (e) {
      console.warn('AI service unavailable, falling back to engine');
    }
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

  async reviewGame(fens, moves) {
    const aiBase = getAiBase();
    if (!aiBase) return null;
    try {
      const resp = await fetch(`${aiBase}/ai/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fens, moves }),
      });
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Review service unavailable');
    }
    return null;
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
}
