/**
 * Timed Drill System — "Solve N puzzles in X seconds" challenges
 * with scoring and personal best tracking.
 */

const STORAGE_KEY = 'chess3d_timed_drills';

// Drill configurations
export const TIMED_DRILL_CONFIGS = [
  { id: 'rush_easy', name: 'Puzzle Rush: Easy', puzzleCount: 10, timeLimitSec: 120, ratingRange: [700, 1100], icon: '⏱️' },
  { id: 'rush_medium', name: 'Puzzle Rush: Medium', puzzleCount: 10, timeLimitSec: 90, ratingRange: [1100, 1500], icon: '🔥' },
  { id: 'rush_hard', name: 'Puzzle Rush: Hard', puzzleCount: 10, timeLimitSec: 60, ratingRange: [1400, 1800], icon: '💀' },
  { id: 'survival', name: 'Survival Mode', puzzleCount: 999, timeLimitSec: 300, ratingRange: [800, 1600], icon: '❤️' },
  { id: 'blitz_tactics', name: 'Blitz Tactics', puzzleCount: 20, timeLimitSec: 60, ratingRange: [900, 1400], icon: '⚡' },
];

// Quick puzzle bank (for timed drills — shorter puzzles, 1-2 move solutions)
const DRILL_PUZZLES = [
  { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['h5f7'], rating: 800 },
  { fen: '6k1/5ppp/8/8/8/8/r4PPP/1R4K1 w - - 0 1', solution: ['b1b8'], rating: 900 },
  { fen: 'r1b1kb1r/ppppqppp/5n2/4N3/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 5', solution: ['e5f7'], rating: 1000 },
  { fen: '3r2k1/ppp2ppp/6n1/3q4/3P4/5N2/PP3PPP/R2Q2K1 b - - 0 16', solution: ['d5a2'], rating: 1100 },
  { fen: 'r5k1/5ppp/1q6/8/8/5Q2/5PPP/4R1K1 w - - 0 1', solution: ['e1e8'], rating: 950 },
  { fen: '5rk1/pp2ppbp/6p1/2p5/2P5/1P2B3/P4PPP/3R2K1 w - - 0 20', solution: ['d1d7'], rating: 1100 },
  { fen: 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/3B4/PPPP1PPP/RNBQK1NR w KQkq d6 0 3', solution: ['e4d5'], rating: 800 },
  { fen: '8/8/4k3/8/4K3/4P3/8/8 w - - 0 1', solution: ['e4d5'], rating: 850 },
  { fen: '5r2/pp2k1pp/8/3Rp3/4P3/1P4P1/P4P1P/6K1 w - - 0 25', solution: ['d5d7'], rating: 1050 },
  { fen: 'r2qk2r/ppp2ppp/2n2n2/3pp1B1/1b2P3/2NP1N2/PPP2PPP/R2QKB1R w KQkq - 0 6', solution: ['g5f6'], rating: 1200 },
  { fen: '2r3k1/pp3pp1/2n4p/3Np3/4P3/1B6/PPP2PPP/3R2K1 w - - 0 17', solution: ['d5e7'], rating: 1300 },
  { fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', solution: ['d8h4'], rating: 850 },
  { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', solution: ['f3g5'], rating: 900 },
  { fen: 'r2qr1k1/ppp2ppp/2n1b3/3nN3/3P4/2P5/PP3PPP/RNBQR1K1 w - - 0 11', solution: ['e5f7'], rating: 1400 },
  { fen: 'r1b1k1nr/ppppqppp/2n5/1Bb1p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 4 4', solution: ['b5c6'], rating: 1250 },
  { fen: '2rr2k1/pp3ppp/2n1bn2/4p3/4P3/1NN1BP2/PPP3PP/2KR3R w - - 0 13', solution: ['b3d2'], rating: 1500 },
  { fen: 'r4rk1/1bq1bppp/p2ppn2/1p6/3BPP2/2NB4/PPPQ2PP/R4RK1 w - - 0 13', solution: ['f4f5'], rating: 1500 },
  { fen: '8/5pk1/4p1p1/3pP1P1/2pP1P2/2P3K1/8/8 w - - 0 40', solution: ['f4f5'], rating: 1450 },
  { fen: 'r3kb1r/pbqn1ppp/1p1ppn2/8/2PNP3/2N1B3/PP2BPPP/R2Q1RK1 w kq - 0 9', solution: ['d4c6'], rating: 1350 },
  { fen: 'rnb1k2r/pppp1ppp/4pn2/8/1bPq4/2N2N2/PP1PPPPP/R1BQKB1R w KQkq - 4 5', solution: ['c3d5'], rating: 1300 },
];

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { bestScores: {}, totalCompleted: 0, history: [] };
}

function _save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

export class TimedDrillSession {
  constructor(configId) {
    const config = TIMED_DRILL_CONFIGS.find(c => c.id === configId);
    if (!config) throw new Error(`Unknown drill config: ${configId}`);

    this.config = config;
    this.puzzles = this._selectPuzzles();
    this.currentIndex = 0;
    this.solved = 0;
    this.mistakes = 0;
    this.startTime = null;
    this.endTime = null;
    this.timeRemaining = config.timeLimitSec;
    this.active = false;
    this._timer = null;
    this._onTick = null;
    this._onComplete = null;
  }

  _selectPuzzles() {
    const [minR, maxR] = this.config.ratingRange;
    const eligible = DRILL_PUZZLES.filter(p => p.rating >= minR && p.rating <= maxR);

    // Shuffle and pick
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const count = Math.min(this.config.puzzleCount, shuffled.length);
    return shuffled.slice(0, count);
  }

  onTick(cb) { this._onTick = cb; }
  onComplete(cb) { this._onComplete = cb; }

  start() {
    this.startTime = Date.now();
    this.active = true;
    this._timer = setInterval(() => {
      const elapsed = (Date.now() - this.startTime) / 1000;
      this.timeRemaining = Math.max(0, this.config.timeLimitSec - elapsed);
      if (this._onTick) this._onTick(this.timeRemaining, this.solved, this.currentIndex);
      if (this.timeRemaining <= 0) {
        this.finish('timeout');
      }
    }, 100);
  }

  getCurrentPuzzle() {
    if (this.currentIndex >= this.puzzles.length) return null;
    return this.puzzles[this.currentIndex];
  }

  submitMove(uci) {
    const puzzle = this.getCurrentPuzzle();
    if (!puzzle) return { correct: false, finished: true };

    const expected = puzzle.solution[0];
    if (uci === expected) {
      this.solved++;
      this.currentIndex++;
      if (this.currentIndex >= this.puzzles.length) {
        this.finish('completed');
        return { correct: true, finished: true };
      }
      return { correct: true, finished: false, nextPuzzle: this.getCurrentPuzzle() };
    } else {
      this.mistakes++;
      // In survival mode, a mistake ends the run
      if (this.config.id === 'survival') {
        this.finish('mistake');
        return { correct: false, finished: true };
      }
      // Otherwise, skip to next puzzle
      this.currentIndex++;
      if (this.currentIndex >= this.puzzles.length) {
        this.finish('completed');
        return { correct: false, finished: true };
      }
      return { correct: false, finished: false, nextPuzzle: this.getCurrentPuzzle() };
    }
  }

  finish(reason) {
    this.active = false;
    this.endTime = Date.now();
    if (this._timer) { clearInterval(this._timer); this._timer = null; }

    const elapsed = (this.endTime - this.startTime) / 1000;
    const result = {
      configId: this.config.id,
      configName: this.config.name,
      solved: this.solved,
      total: this.puzzles.length,
      mistakes: this.mistakes,
      timeTaken: elapsed,
      timeRemaining: this.timeRemaining,
      reason,
      score: this._calculateScore(),
    };

    // Save to history
    const data = _load();
    const prev = data.bestScores[this.config.id] || 0;
    if (result.score > prev) {
      data.bestScores[this.config.id] = result.score;
    }
    data.totalCompleted++;
    data.history.push({
      ...result,
      timestamp: Date.now(),
    });
    // Keep last 50 history entries
    if (data.history.length > 50) data.history = data.history.slice(-50);
    _save(data);

    if (this._onComplete) this._onComplete(result);
    return result;
  }

  _calculateScore() {
    // Score = solved * 100 + time bonus
    const timeBonus = Math.max(0, Math.floor(this.timeRemaining * 2));
    return this.solved * 100 + timeBonus - this.mistakes * 25;
  }

  destroy() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}

export function getTimedDrillStats() {
  return _load();
}

export function getBestScore(configId) {
  const data = _load();
  return data.bestScores[configId] || 0;
}
