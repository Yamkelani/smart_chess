/**
 * Daily Puzzle System — A new puzzle every day with streak tracking.
 * Uses a deterministic seed based on the date to select the puzzle of the day.
 * Persists solve state and streaks in localStorage.
 */

const STORAGE_KEY = 'chess3d_daily_puzzle';

// Extended puzzle bank for daily puzzles (50+ puzzles)
const DAILY_PUZZLE_BANK = [
  { id: 'dp001', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['h5f7'], rating: 800, theme: 'checkmate', title: "Scholar's Mate", desc: 'Deliver checkmate in one move!' },
  { id: 'dp002', fen: 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/3B4/PPPP1PPP/RNBQK1NR w KQkq d6 0 3', solution: ['e4d5'], rating: 800, theme: 'capture', title: 'Free Pawn', desc: 'Capture the undefended center pawn.' },
  { id: 'dp003', fen: '6k1/5ppp/8/8/8/8/r4PPP/1R4K1 w - - 0 1', solution: ['b1b8'], rating: 900, theme: 'back_rank', title: 'Back Rank Mate', desc: 'Exploit the weak back rank!' },
  { id: 'dp004', fen: 'r2qk2r/ppp2ppp/2n2n2/3pp1B1/1b2P3/2NP1N2/PPP2PPP/R2QKB1R w KQkq - 0 6', solution: ['g5f6', 'd8f6', 'c3d5'], rating: 1200, theme: 'tactics', title: 'Pin and Win', desc: 'Use the pin to win material.' },
  { id: 'dp005', fen: 'r1b1kb1r/ppppqppp/5n2/4N3/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 5', solution: ['e5f7'], rating: 1000, theme: 'fork', title: 'Royal Fork', desc: 'Fork the king and queen!' },
  { id: 'dp006', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', solution: ['g8f6', 'f3g5', 'd7d5'], rating: 1100, theme: 'defense', title: 'Defend the Fork', desc: 'How should Black defend against the Italian Game?' },
  { id: 'dp007', fen: 'rnb1k2r/pppp1ppp/4pn2/8/1bPq4/2N2N2/PP1PPPPP/R1BQKB1R w KQkq - 4 5', solution: ['c3d5'], rating: 1300, theme: 'tactics', title: 'Central Strike', desc: 'Strike in the center to gain advantage.' },
  { id: 'dp008', fen: 'r2qr1k1/ppp2ppp/2n1b3/3nN3/3P4/2P5/PP3PPP/RNBQR1K1 w - - 0 11', solution: ['e5f7'], rating: 1400, theme: 'sacrifice', title: 'Knight Sacrifice', desc: 'Sacrifice the knight to expose the king!' },
  { id: 'dp009', fen: '2rr2k1/pp3ppp/2n1bn2/4p3/4P3/1NN1BP2/PPP3PP/2KR3R w - - 0 13', solution: ['b3d2', 'c6d4', 'd1d4'], rating: 1500, theme: 'positional', title: 'Knight Maneuver', desc: 'Reposition your knight to a better square.' },
  { id: 'dp010', fen: 'r4rk1/1bq1bppp/p2ppn2/1p6/3BPP2/2NB4/PPPQ2PP/R4RK1 w - - 0 13', solution: ['f4f5', 'e6f5', 'e4f5'], rating: 1500, theme: 'pawn_break', title: 'Kingside Attack', desc: 'Break through on the kingside!' },
  { id: 'dp011', fen: 'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4', solution: ['d7d6'], rating: 900, theme: 'opening', title: 'Solid Development', desc: 'What is the best developing move?' },
  { id: 'dp012', fen: '5rk1/pp2ppbp/6p1/2p5/2P5/1P2B3/P4PPP/3R2K1 w - - 0 20', solution: ['d1d7'], rating: 1100, theme: 'invasion', title: 'Rook to the 7th', desc: 'Invade with the rook on the 7th rank!' },
  { id: 'dp013', fen: 'r3kb1r/pbqn1ppp/1p1ppn2/8/2PNP3/2N1B3/PP2BPPP/R2Q1RK1 w kq - 0 9', solution: ['d4c6'], rating: 1350, theme: 'tactics', title: 'Knight Outpost', desc: 'Plant the knight on an unassailable outpost.' },
  { id: 'dp014', fen: '2kr3r/ppp2ppp/2n1bn2/2b1p3/4P3/2NP1N2/PPP1BPPP/R1B2RK1 w - - 0 8', solution: ['d3d4', 'e5d4', 'f3d4'], rating: 1400, theme: 'center', title: 'Central Break', desc: 'Open the center to exploit your development lead.' },
  { id: 'dp015', fen: 'r1bq1rk1/1pp2ppp/p1np1n2/2b1p3/2B1P3/2NPBN2/PPP2PPP/R2Q1RK1 w - - 0 8', solution: ['d3d4'], rating: 1200, theme: 'opening', title: 'Classical Center', desc: 'Claim the center with a pawn push.' },
  { id: 'dp016', fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5', solution: ['e4e5'], rating: 1300, theme: 'space', title: 'Space Advantage', desc: 'Gain a space advantage in the center.' },
  { id: 'dp017', fen: '3r2k1/ppp2ppp/6n1/3q4/3P4/5N2/PP3PPP/R2Q2K1 b - - 0 16', solution: ['d5a2'], rating: 1100, theme: 'tactics', title: 'Queen Raid', desc: 'The queen can safely grab a pawn.' },
  { id: 'dp018', fen: 'r1b1k1nr/ppppqppp/2n5/1Bb1p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', solution: ['b5c6', 'd7c6', 'f3e5'], rating: 1250, theme: 'tactics', title: 'Exchange & Win', desc: 'Exchange the bishop to win material.' },
  { id: 'dp019', fen: 'r1b1r1k1/ppq2ppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 9', solution: ['d4c5', 'd5d4', 'e3d4'], rating: 1500, theme: 'pawn_structure', title: 'Pawn Structure', desc: 'Improve your pawn structure while gaining space.' },
  { id: 'dp020', fen: 'r2q1rk1/pppb1ppp/2n2n2/3pp1B1/3PP3/2NB1N2/PPP2PPP/R2Q1RK1 b - - 0 8', solution: ['d5e4', 'c3e4', 'f6e4'], rating: 1400, theme: 'exchange', title: 'Simplify to Win', desc: 'Exchange pieces to reach a favorable position.' },
  { id: 'dp021', fen: '8/8/4k3/8/4K3/4P3/8/8 w - - 0 1', solution: ['e4d5'], rating: 850, theme: 'endgame', title: 'King + Pawn', desc: 'Find the winning king move in this key endgame.' },
  { id: 'dp022', fen: '8/5pk1/6p1/8/5PP1/8/6K1/8 w - - 0 1', solution: ['f4f5', 'g6f5', 'g4f5'], rating: 1100, theme: 'endgame', title: 'Pawn Breakthrough', desc: 'Create a passed pawn with the right pawn break.' },
  { id: 'dp023', fen: 'r5k1/5ppp/1q6/8/8/5Q2/5PPP/4R1K1 w - - 0 1', solution: ['e1e8'], rating: 950, theme: 'back_rank', title: 'Back Rank Checkmate', desc: 'Deliver checkmate on the back rank!' },
  { id: 'dp024', fen: '2r3k1/pp3pp1/2n4p/3Np3/4P3/1B6/PPP2PPP/3R2K1 w - - 0 17', solution: ['d5e7'], rating: 1300, theme: 'fork', title: 'Knight Fork', desc: 'Fork two pieces with the knight.' },
  { id: 'dp025', fen: 'rnb1k2r/pppp1ppp/5n2/4p1q1/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 5', solution: ['d2d4', 'e5d4', 'f3d4'], rating: 1150, theme: 'opening', title: 'Center Control', desc: 'Challenge the center to gain initiative.' },
  { id: 'dp026', fen: 'r3r1k1/ppq2ppp/2pb4/3n4/3P4/2P1BN2/P1Q2PPP/R3R1K1 b - - 0 15', solution: ['d6h2'], rating: 1600, theme: 'attack', title: 'Greek Gift', desc: 'Sacrifice the bishop to crack open the king!' },
  { id: 'dp027', fen: '5rk1/1p3ppp/p2p4/2qPn3/4P3/1P3N2/1P3PPP/R2Q1RK1 b - - 0 18', solution: ['e5f3', 'g2f3', 'c5g5'], rating: 1500, theme: 'tactics', title: 'Remove the Defender', desc: 'Eliminate the key defender to break through.' },
  { id: 'dp028', fen: 'r2qkb1r/pp2pppp/2n2n2/3p4/3P1Bb1/2N1PN2/PPP2PPP/R2QKB1R b KQkq - 0 5', solution: ['e7e6'], rating: 900, theme: 'development', title: 'Solid Move', desc: 'Develop naturally and solidify the center.' },
  { id: 'dp029', fen: '2rq1rk1/pp1bppbp/2np1np1/8/2PNP3/2N1BP2/PP1QB1PP/R4RK1 w - - 0 11', solution: ['d4c6', 'd7c6', 'e4e5'], rating: 1550, theme: 'advanced', title: 'Positional Sacrifice', desc: 'Sacrifice the knight for a lasting positional advantage.' },
  { id: 'dp030', fen: 'r1b5/ppp3pp/2n1pk2/3p4/3P4/2PB4/PP3PPP/R3K2R w KQ - 0 13', solution: ['d3h7'], rating: 1200, theme: 'attack', title: 'Bishop Attack', desc: 'The bishop attacks the weakened kingside.' },
  { id: 'dp031', fen: '8/8/1p6/1Pk5/8/1K6/8/8 w - - 0 1', solution: ['b3a4'], rating: 800, theme: 'endgame', title: 'Opposition', desc: 'Gain the opposition to win the pawn.' },
  { id: 'dp032', fen: 'r4rk1/1b1q1ppp/p2p1n2/1ppPp3/4P3/1BP2N2/PP1N1PPP/R2Q1RK1 w - c6 0 14', solution: ['d5c6'], rating: 1100, theme: 'en_passant', title: 'En Passant', desc: 'Take en passant to create a passed pawn!' },
  { id: 'dp033', fen: 'rn1qkbnr/ppp2ppp/4p3/3pPb2/3P4/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4', solution: ['c2c4'], rating: 1250, theme: 'opening', title: 'Advance Variation', desc: 'Challenge Black\'s pawn chain immediately.' },
  { id: 'dp034', fen: 'r2qkb1r/1bpn1ppp/p3pn2/1p2P3/3P4/2NB1N2/PPP2PPP/R1BQ1RK1 w kq - 0 8', solution: ['e5f6', 'd7f6', 'd3h7'], rating: 1600, theme: 'sacrifice', title: 'Classic Bishop Sacrifice', desc: 'The famous Bxh7+ sacrifice pattern!' },
  { id: 'dp035', fen: '4r1k1/pp3ppp/2p5/3n4/3P4/4BN2/PP3PPP/4R1K1 w - - 0 20', solution: ['e3d2'], rating: 1050, theme: 'positional', title: 'Bishop Retreat', desc: 'Reposition the bishop to a better diagonal.' },
  { id: 'dp036', fen: 'rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR w KQ - 0 5', solution: ['f1d3'], rating: 950, theme: 'development', title: 'Develop with Tempo', desc: 'Develop the bishop to a natural square.' },
  { id: 'dp037', fen: '2r2rk1/1p1b1ppp/p2ppn2/8/3NP3/2N5/PPP1BPPP/1K1R3R w - - 0 14', solution: ['d4f5'], rating: 1350, theme: 'outpost', title: 'Knight on f5', desc: 'Plant the knight on the powerful f5 outpost!' },
  { id: 'dp038', fen: 'r1bqr1k1/pp1n1pbp/2pp1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQR1K1 w - - 0 9', solution: ['d4d5', 'c6c5', 'c3b5'], rating: 1400, theme: 'strategy', title: 'Pawn Storm Prep', desc: 'Lock the center before attacking on the wing.' },
  { id: 'dp039', fen: '8/5pk1/4p1p1/3pP1P1/2pP1P2/2P3K1/8/8 w - - 0 40', solution: ['f4f5'], rating: 1450, theme: 'endgame', title: 'Pawn Endgame', desc: 'Find the key pawn break to win.' },
  { id: 'dp040', fen: '3r1rk1/1pq2ppp/p1b1pn2/8/N1P5/1P3NP1/PB2QP1P/3RR1K1 w - - 0 19', solution: ['f3e5'], rating: 1250, theme: 'centralization', title: 'Knight to the Center', desc: 'Centralize the knight for maximum impact.' },
  { id: 'dp041', fen: 'rnbqkb1r/ppp1pppp/3p1n2/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3', solution: ['b1c3'], rating: 850, theme: 'development', title: 'Natural Development', desc: 'Develop the knight to its best square.' },
  { id: 'dp042', fen: 'r1b1k2r/2qnbppp/p2ppn2/1p4B1/3NPP2/2N2Q2/PPP3PP/R3KB1R w KQkq - 0 10', solution: ['e4e5', 'd6e5', 'f4e5'], rating: 1500, theme: 'attack', title: 'Open Lines', desc: 'Open lines towards the king.' },
  { id: 'dp043', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', solution: ['b4b1'], rating: 1200, theme: 'endgame', title: 'Rook Endgame', desc: 'Find the only winning rook move.' },
  { id: 'dp044', fen: 'r2q1rk1/pp1b1ppp/2n1pn2/2bp4/8/1P1BPN2/PBPN1PPP/R2Q1RK1 w - - 0 9', solution: ['e3e4'], rating: 1300, theme: 'center', title: 'Pawn Center Push', desc: 'Seize the center with a bold pawn push.' },
  { id: 'dp045', fen: 'r1bqk2r/pp1pppbp/2n2np1/2p5/2P5/2N2NP1/PP1PPPBP/R1BQK2R w KQkq - 0 5', solution: ['e1g1'], rating: 850, theme: 'castling', title: 'Castle Early', desc: 'Castle to safety and connect the rooks.' },
  { id: 'dp046', fen: 'r2qnrk1/pp2ppbp/2p2np1/3p4/2PP4/1QN1PN2/PP3PPP/R1B2RK1 w - - 0 9', solution: ['c4d5', 'c6d5', 'c3b5'], rating: 1400, theme: 'tactics', title: 'Capture and Attack', desc: 'Capture to open lines, then invade.' },
  { id: 'dp047', fen: '5r2/pp2k1pp/8/3Rp3/4P3/1P4P1/P4P1P/6K1 w - - 0 25', solution: ['d5d7'], rating: 1050, theme: 'endgame', title: 'Active Rook', desc: 'Activate the rook on the 7th rank.' },
  { id: 'dp048', fen: 'r3k2r/pppb1ppp/2n1pn2/3p4/3P1B2/2NBPN2/PPP2PPP/R3K2R b KQkq - 5 7', solution: ['f6e4'], rating: 1350, theme: 'tactics', title: 'Central Knight', desc: 'Jump to the center with a strong knight move.' },
  { id: 'dp049', fen: '1k1r3r/ppq2ppp/2nbpn2/3p4/3P4/2N1PN2/PPQB1PPP/R3K2R w KQ - 0 10', solution: ['e1c1'], rating: 1000, theme: 'castling', title: 'Queenside Castle', desc: 'Castle long and connect the rooks.' },
  { id: 'dp050', fen: 'r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 0 8', solution: ['e1c1'], rating: 1100, theme: 'attack', title: 'Opposite-side Castling', desc: 'Castle opposite and prepare the pawn storm!' },
];

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { currentStreak: 0, bestStreak: 0, totalSolved: 0, lastSolvedDate: null, history: {} };
}

function _save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Deterministic hash from a string → number
 */
function hashDate(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const ch = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get today's daily puzzle
 */
export function getDailyPuzzle() {
  const today = todayStr();
  const idx = hashDate(today) % DAILY_PUZZLE_BANK.length;
  const puzzle = { ...DAILY_PUZZLE_BANK[idx] };
  puzzle.date = today;
  puzzle.puzzleNumber = hashDate(today) % 9999 + 1;
  return puzzle;
}

/**
 * Check if today's puzzle has been solved
 */
export function isDailySolved() {
  const data = _load();
  return data.lastSolvedDate === todayStr();
}

/**
 * Mark today's puzzle as solved
 */
export function solveDailyPuzzle() {
  const data = _load();
  const today = todayStr();

  if (data.lastSolvedDate === today) return data; // already solved

  // Check streak continuity (yesterday or first-ever)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (data.lastSolvedDate === yStr) {
    data.currentStreak += 1;
  } else {
    data.currentStreak = 1;
  }

  if (data.currentStreak > data.bestStreak) {
    data.bestStreak = data.currentStreak;
  }

  data.totalSolved += 1;
  data.lastSolvedDate = today;
  data.history[today] = true;

  _save(data);
  return data;
}

/**
 * Get daily puzzle stats
 */
export function getDailyStats() {
  return _load();
}

/**
 * Get the puzzle for a specific date (for browsing history)
 */
export function getPuzzleForDate(dateStr) {
  const idx = hashDate(dateStr) % DAILY_PUZZLE_BANK.length;
  const puzzle = { ...DAILY_PUZZLE_BANK[idx] };
  puzzle.date = dateStr;
  return puzzle;
}
