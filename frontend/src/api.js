/**
 * API client for communicating with the Rust engine and Python AI service
 */
const ENGINE_BASE = '/api/engine';
const AI_BASE = '/api/ai';

export class ChessAPI {
  /**
   * Create a new game on the engine
   */
  async newGame(fen = null) {
    const body = fen ? { fen } : {};
    const resp = await fetch(`${ENGINE_BASE}/game/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Get current game state
   */
  async getGame(gameId) {
    const resp = await fetch(`${ENGINE_BASE}/game/${gameId}`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Make a move (UCI format like "e2e4")
   */
  async makeMove(gameId, uci) {
    const resp = await fetch(`${ENGINE_BASE}/game/${gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uci }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Get legal moves
   */
  async getLegalMoves(gameId) {
    const resp = await fetch(`${ENGINE_BASE}/game/${gameId}/moves`);
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Ask the engine to play a move (alpha-beta)
   */
  async engineMove(gameId) {
    const resp = await fetch(`${ENGINE_BASE}/game/${gameId}/engine-move`, {
      method: 'POST',
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Request AI move (neural network + MCTS)
   * Falls back to engine alpha-beta if AI service is unavailable
   */
  async aiMove(fen, difficulty = 'intermediate') {
    try {
      const resp = await fetch(`${AI_BASE}/ai/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, difficulty }),
      });
      if (resp.ok) return { source: 'ai', ...(await resp.json()) };
    } catch (e) {
      console.warn('AI service unavailable, falling back to engine');
    }
    return null;
  }

  /**
   * Evaluate a position
   */
  async evaluate(fen, depth = 4) {
    const resp = await fetch(`${ENGINE_BASE}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, depth }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  }

  /**
   * Get AI learning status
   */
  async getLearningStatus() {
    try {
      const resp = await fetch(`${AI_BASE}/ai/learning`);
      if (resp.ok) return resp.json();
    } catch (e) {
      // Service unavailable
    }
    return null;
  }

  // ── Chess Tutor / Coach API ──

  /**
   * Ask the AI tutor a chess question
   */
  async askTutor(question, fen = null) {
    try {
      const body = { question };
      if (fen) body.fen = fen;
      const resp = await fetch(`${AI_BASE}/ai/tutor/ask`, {
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

  /**
   * Get all lesson categories for the Learn tab
   */
  async getTutorLessons() {
    try {
      const resp = await fetch(`${AI_BASE}/ai/tutor/lessons`);
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Tutor lessons unavailable');
    }
    return null;
  }

  /**
   * Get full content for a specific lesson
   */
  async getTutorLessonDetail(lessonId) {
    try {
      const resp = await fetch(`${AI_BASE}/ai/tutor/lesson/${lessonId}`);
      if (resp.ok) return resp.json();
    } catch (e) {
      console.warn('Lesson detail unavailable');
    }
    return null;
  }
}
