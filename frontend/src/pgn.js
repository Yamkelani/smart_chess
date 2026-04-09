/**
 * PGN Export & Game History — Save/load/export games
 * Persists game history in localStorage.
 */

const HISTORY_KEY = 'chess3d_game_history';
const MAX_HISTORY = 50;

/**
 * Convert move history to PGN format string
 */
export function toPGN(options = {}) {
  const {
    moveHistory = [],
    result = '*',
    white = 'Player',
    black = 'AI',
    date = null,
    event = '3D Chess Game',
    difficulty = 'intermediate',
    opening = null,
    playerColor = 'white',
  } = options;

  const d = date ? new Date(date) : new Date();
  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

  // PGN headers
  let pgn = '';
  pgn += `[Event "${event}"]\n`;
  pgn += `[Site "3D Chess App"]\n`;
  pgn += `[Date "${dateStr}"]\n`;
  pgn += `[White "${white}"]\n`;
  pgn += `[Black "${black}"]\n`;
  pgn += `[Result "${_pgnResult(result)}"]\n`;
  if (opening) {
    pgn += `[Opening "${opening}"]\n`;
    if (opening.eco) pgn += `[ECO "${opening.eco}"]\n`;
  }
  pgn += `[Difficulty "${difficulty}"]\n`;
  pgn += '\n';

  // Move text
  const lines = [];
  let line = '';
  for (let i = 0; i < moveHistory.length; i++) {
    if (i % 2 === 0) {
      const moveNum = Math.floor(i / 2) + 1;
      const token = `${moveNum}. ${moveHistory[i]}`;
      if (line.length + token.length > 78) {
        lines.push(line);
        line = token;
      } else {
        line += (line ? ' ' : '') + token;
      }
    } else {
      const token = moveHistory[i];
      if (line.length + token.length + 1 > 78) {
        lines.push(line);
        line = token;
      } else {
        line += ' ' + token;
      }
    }
  }
  if (line) lines.push(line);
  lines.push(_pgnResult(result, playerColor));

  pgn += lines.join('\n');
  return pgn;
}

function _pgnResult(status, playerColor) {
  if (!status) return '*';
  const s = status.toLowerCase();
  if (s.includes('checkmate')) {
    // Engine sends Checkmate("White") or Checkmate("Black") — winner name
    if (s.includes('white')) return '1-0';
    if (s.includes('black')) return '0-1';
    // Fallback: if no colour embedded, use playerColor hint
    return playerColor === 'black' ? '0-1' : '1-0';
  }
  if (s.includes('resign')) {
    // "Black wins by resignation" etc.
    if (s.includes('white')) return '1-0';
    if (s.includes('black')) return '0-1';
  }
  if (s.includes('stalemate') || s.includes('draw')) return '1/2-1/2';
  // Relative results (from history): need playerColor to resolve
  if (s === 'win')  return playerColor === 'black' ? '0-1' : '1-0';
  if (s === 'loss') return playerColor === 'black' ? '1-0' : '0-1';
  if (s === '1-0' || s === '0-1' || s === '1/2-1/2') return s;
  return '*';
}

/**
 * Download PGN as a file
 */
export function downloadPGN(pgn, filename = 'game.pgn') {
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Save a completed game to history
 */
export function saveGame(gameData) {
  const history = loadHistory();
  history.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    date: Date.now(),
    ...gameData,
  });
  // Keep only last N games
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) { /* storage full */ }
}

/**
 * Load game history
 */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return [];
}

/**
 * Delete a game from history
 */
export function deleteGame(gameId) {
  const history = loadHistory();
  const filtered = history.filter(g => g.id !== gameId);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (e) { /* ignore */ }
}

/**
 * Clear all history
 */
export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) { /* ignore */ }
}

/**
 * Format a game summary for display
 */
export function formatGameSummary(game) {
  const d = new Date(game.date);
  const dateStr = d.toLocaleDateString();
  const moves = game.moveCount || (game.moveHistory ? game.moveHistory.length : 0);
  const resultText = game.result === 'win' ? 'Won' : game.result === 'loss' ? 'Lost' : 'Draw';
  return {
    dateStr,
    moves,
    resultText,
    difficulty: game.difficulty || 'intermediate',
    opening: game.opening || null,
    ratingChange: game.ratingChange || 0,
  };
}

/**
 * Copy PGN to clipboard
 */
export async function copyPGN(pgn) {
  try {
    await navigator.clipboard.writeText(pgn);
    return true;
  } catch (e) {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = pgn;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}
