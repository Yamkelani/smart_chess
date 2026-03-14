/**
 * Player Rating System — Elo-based rating with localStorage persistence
 */

const STORAGE_KEY = 'chess3d_rating';
const HISTORY_KEY = 'chess3d_rating_history';

// Default starting rating
const DEFAULT_RATING = 1200;

// AI difficulty to estimated Elo mapping
const AI_RATINGS = {
  beginner: 800,
  intermediate: 1200,
  advanced: 1600,
  expert: 2000,
  master: 2400,
};

// K-factor (how much rating changes per game)
const K_FACTOR = 32;

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { rating: DEFAULT_RATING, games: 0, wins: 0, losses: 0, draws: 0, peak: DEFAULT_RATING };
}

function _save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function _loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return [];
}

function _saveHistory(history) {
  try {
    // Keep last 100 entries
    const trimmed = history.slice(-100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) { /* ignore */ }
}

/**
 * Calculate expected score using Elo formula
 */
function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/**
 * Update player rating after a game.
 * @param {string} result - 'win', 'loss', or 'draw'
 * @param {string} difficulty - AI difficulty level
 * @returns {object} { oldRating, newRating, change, data }
 */
export function updateRating(result, difficulty) {
  const data = _load();
  const oldRating = data.rating;
  const aiRating = AI_RATINGS[difficulty] || AI_RATINGS.intermediate;

  const expected = expectedScore(oldRating, aiRating);
  let actual;
  switch (result) {
    case 'win': actual = 1; data.wins++; break;
    case 'loss': actual = 0; data.losses++; break;
    default: actual = 0.5; data.draws++; break;
  }

  const change = Math.round(K_FACTOR * (actual - expected));
  data.rating = Math.max(100, oldRating + change); // Floor at 100
  data.games++;
  if (data.rating > data.peak) data.peak = data.rating;

  _save(data);

  // Save to history
  const history = _loadHistory();
  history.push({
    rating: data.rating,
    change,
    result,
    difficulty,
    timestamp: Date.now(),
  });
  _saveHistory(history);

  return { oldRating, newRating: data.rating, change, data };
}

/**
 * Get current rating data
 */
export function getRating() {
  return _load();
}

/**
 * Get rating history
 */
export function getRatingHistory() {
  return _loadHistory();
}

/**
 * Reset rating to default
 */
export function resetRating() {
  _save({ rating: DEFAULT_RATING, games: 0, wins: 0, losses: 0, draws: 0, peak: DEFAULT_RATING });
  _saveHistory([]);
}

/**
 * Get rank title based on rating
 */
export function getRankTitle(rating) {
  if (rating >= 2400) return { title: 'Grandmaster', icon: '👑', color: '#ffd700' };
  if (rating >= 2000) return { title: 'Master', icon: '⭐', color: '#ff6b6b' };
  if (rating >= 1800) return { title: 'Expert', icon: '🏆', color: '#c9a84c' };
  if (rating >= 1600) return { title: 'Advanced', icon: '🎯', color: '#00d2ff' };
  if (rating >= 1400) return { title: 'Intermediate', icon: '♟️', color: '#6c5ce7' };
  if (rating >= 1200) return { title: 'Club Player', icon: '♞', color: '#8888aa' };
  if (rating >= 1000) return { title: 'Casual', icon: '🎲', color: '#888' };
  return { title: 'Beginner', icon: '🌱', color: '#4ade80' };
}
