/**
 * Opening Explorer — Identifies chess openings from move sequences
 * Maps move sequences to named openings with descriptions.
 */

// Opening book: keyed by sequence of UCI moves (space-separated)
const OPENING_BOOK = {
  // ── Italian Game Family ──
  'e2e4 e7e5 g1f3 b8c6 f1c4': {
    name: 'Italian Game',
    eco: 'C50',
    desc: 'A classical opening aiming to control the center and develop quickly.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5': {
    name: 'Giuoco Piano',
    eco: 'C53',
    desc: 'The "Quiet Game" — both sides develop bishops to active squares.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6': {
    name: 'Two Knights Defense',
    eco: 'C55',
    desc: 'Black counterattacks immediately instead of developing the bishop.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3': {
    name: 'Evans Gambit Declined',
    eco: 'C51',
    desc: 'White prepares d4 with c3, a solid approach.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4': {
    name: 'Evans Gambit',
    eco: 'C51',
    desc: 'A bold pawn sacrifice for rapid development and center control!',
  },

  // ── Ruy Lopez Family ──
  'e2e4 e7e5 g1f3 b8c6 f1b5': {
    name: 'Ruy Lopez',
    eco: 'C60',
    desc: 'The "Spanish Game" — one of the oldest and most respected openings.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6': {
    name: 'Ruy Lopez: Morphy Defense',
    eco: 'C65',
    desc: 'Black challenges the bishop immediately. The most popular response.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6': {
    name: 'Ruy Lopez: Closed',
    eco: 'C84',
    desc: 'A rich, strategic battle with many plans for both sides.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6': {
    name: 'Ruy Lopez: Berlin Defense',
    eco: 'C65',
    desc: 'Solid and drawish at the top level, but full of subtlety.',
  },

  // ── Scotch Game ──
  'e2e4 e7e5 g1f3 b8c6 d2d4': {
    name: 'Scotch Game',
    eco: 'C45',
    desc: 'White immediately opens the center. A favorite of Kasparov.',
  },

  // ── King\'s Gambit ──
  'e2e4 e7e5 f2f4': {
    name: "King's Gambit",
    eco: 'C30',
    desc: 'A romantic gambit sacrificing a pawn for rapid attacking chances!',
  },
  'e2e4 e7e5 f2f4 e5f4': {
    name: "King's Gambit Accepted",
    eco: 'C33',
    desc: 'Black accepts the pawn. White gets open lines for attack.',
  },

  // ── Sicilian Defense Family ──
  'e2e4 c7c5': {
    name: 'Sicilian Defense',
    eco: 'B20',
    desc: "Black's most popular response to 1.e4 — fights for the center asymmetrically.",
  },
  'e2e4 c7c5 g1f3 d7d6 d2d4': {
    name: 'Sicilian: Open',
    eco: 'B32',
    desc: 'The main line Sicilian leads to sharp, unbalanced positions.',
  },
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3': {
    name: 'Sicilian: Najdorf',
    eco: 'B90',
    desc: "Bobby Fischer's weapon of choice. Extremely complex and double-edged.",
  },
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 d7d6': {
    name: 'Sicilian: Classical',
    eco: 'B56',
    desc: 'A solid system where Black develops naturally.',
  },
  'e2e4 c7c5 g1f3 e7e6': {
    name: 'Sicilian: French Variation',
    eco: 'B40',
    desc: 'Black keeps options flexible, often transposing to the Kan or Taimanov.',
  },
  'e2e4 c7c5 c2c3': {
    name: 'Sicilian: Alapin',
    eco: 'B22',
    desc: 'White plays c3 to support d4, avoiding the complex Open Sicilian.',
  },

  // ── French Defense ──
  'e2e4 e7e6': {
    name: 'French Defense',
    eco: 'C00',
    desc: "A solid, strategic defense. Black's light-squared bishop can be a challenge.",
  },
  'e2e4 e7e6 d2d4 d7d5': {
    name: 'French Defense: Main Line',
    eco: 'C00',
    desc: 'The classical French pawn structure. Both sides have clear plans.',
  },
  'e2e4 e7e6 d2d4 d7d5 b1c3': {
    name: 'French: Classical',
    eco: 'C11',
    desc: 'White develops the knight, keeping maximum flexibility.',
  },
  'e2e4 e7e6 d2d4 d7d5 e4e5': {
    name: 'French: Advance Variation',
    eco: 'C02',
    desc: 'White gains space but Black will undermine the center with c5 and f6.',
  },

  // ── Caro-Kann Defense ──
  'e2e4 c7c6': {
    name: 'Caro-Kann Defense',
    eco: 'B10',
    desc: "A solid defense. Black's light-squared bishop stays active unlike the French.",
  },
  'e2e4 c7c6 d2d4 d7d5': {
    name: 'Caro-Kann: Main Line',
    eco: 'B12',
    desc: 'The main line leads to solid, strategic positions.',
  },

  // ── Queen\'s Gambit Family ──
  'd2d4 d7d5 c2c4': {
    name: "Queen's Gambit",
    eco: 'D06',
    desc: 'Not a true gambit — White offers a pawn to control the center.',
  },
  'd2d4 d7d5 c2c4 e7e6': {
    name: "Queen's Gambit Declined",
    eco: 'D30',
    desc: 'Black declines the pawn, maintaining a solid center.',
  },
  'd2d4 d7d5 c2c4 d5c4': {
    name: "Queen's Gambit Accepted",
    eco: 'D20',
    desc: 'Black takes the pawn, planning to develop freely.',
  },
  'd2d4 d7d5 c2c4 c7c6': {
    name: 'Slav Defense',
    eco: 'D10',
    desc: 'Black supports d5 with c6, keeping the light-squared bishop free.',
  },

  // ── Indian Defenses ──
  'd2d4 g8f6': {
    name: 'Indian Defense',
    eco: 'A45',
    desc: 'Black delays ...d5, keeping the position flexible.',
  },
  'd2d4 g8f6 c2c4 g7g6': {
    name: "King's Indian Defense",
    eco: 'E60',
    desc: "A hypermodern defense: Black lets White build a center, then attacks it.",
  },
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6': {
    name: "King's Indian: Classical",
    eco: 'E90',
    desc: 'A complex system with attacking chances for both sides.',
  },
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4': {
    name: 'Nimzo-Indian Defense',
    eco: 'E20',
    desc: "One of Black's most reliable defenses. The bishop pins the knight.",
  },
  'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6': {
    name: "Queen's Indian Defense",
    eco: 'E15',
    desc: 'Black fianchettoes the queen bishop for smooth development.',
  },
  'd2d4 g8f6 c2c4 e7e6 g1f3 d7d5': {
    name: 'Queen\'s Gambit Declined: Semi-Tarrasch',
    eco: 'D40',
    desc: 'A flexible system that can transpose to many structures.',
  },

  // ── English Opening ──
  'c2c4': {
    name: 'English Opening',
    eco: 'A10',
    desc: 'A flexible, positional opening controlling the d5 square.',
  },
  'c2c4 e7e5': {
    name: 'English: Reversed Sicilian',
    eco: 'A20',
    desc: 'Like a Sicilian with an extra tempo — strategically rich.',
  },

  // ── London System ──
  'd2d4 d7d5 c1f4': {
    name: 'London System',
    eco: 'D00',
    desc: 'A solid, easy-to-learn system. The bishop goes to f4 early.',
  },
  'd2d4 g8f6 c1f4': {
    name: 'London System',
    eco: 'D00',
    desc: 'White develops the dark-squared bishop before closing the diagonal.',
  },

  // ── Pirc/Modern ──
  'e2e4 d7d6': {
    name: 'Pirc Defense',
    eco: 'B07',
    desc: 'A hypermodern defense, inviting White to build a big center.',
  },
  'e2e4 g7g6': {
    name: 'Modern Defense',
    eco: 'B06',
    desc: 'Black fianchettoes immediately, aiming for a flexible setup.',
  },

  // ── Scandinavian ──
  'e2e4 d7d5': {
    name: 'Scandinavian Defense',
    eco: 'B01',
    desc: 'Black immediately challenges e4. Simple but effective.',
  },

  // ── Vienna Game ──
  'e2e4 e7e5 b1c3': {
    name: 'Vienna Game',
    eco: 'C25',
    desc: 'White develops the knight before committing to f4 or Nf3.',
  },

  // ── Philidor ──
  'e2e4 e7e5 g1f3 d7d6': {
    name: 'Philidor Defense',
    eco: 'C41',
    desc: 'A solid but passive defense. Black supports e5 with d6.',
  },

  // ── Petrov ──
  'e2e4 e7e5 g1f3 g8f6': {
    name: "Petrov's Defense",
    eco: 'C42',
    desc: "Black mirrors White's knight move. Very solid, often drawish.",
  },

  // ── Dutch ──
  'd2d4 f7f5': {
    name: 'Dutch Defense',
    eco: 'A80',
    desc: 'An aggressive response to d4. Black fights for the e4 square.',
  },

  // ── Grünfeld ──
  'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5': {
    name: 'Grünfeld Defense',
    eco: 'D80',
    desc: 'Black lets White build a center, then destroys it. Very dynamic!',
  },

  // ── Benoni ──
  'd2d4 g8f6 c2c4 c7c5': {
    name: 'Benoni Defense',
    eco: 'A56',
    desc: 'Black creates pawn tension immediately. Sharp and tactical.',
  },

  // ── Bird Opening ──
  'f2f4': {
    name: "Bird's Opening",
    eco: 'A02',
    desc: 'An uncommon but playable system controlling e5.',
  },

  // ── Ruy Lopez Variations ──
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1': {
    name: 'Ruy Lopez: Closed Variation',
    eco: 'C84',
    desc: 'White castles, preparing a kingside attack while maintaining the pin.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1b5 f8c5': {
    name: 'Ruy Lopez: Classical Defense',
    eco: 'C64',
    desc: 'Black develops actively with the bishop, planning ...Nf6 and ...d6.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1b5 d7d6': {
    name: 'Ruy Lopez: Steinitz Defense',
    eco: 'C62',
    desc: 'A passive but solid response, keeping the center closed.',
  },

  // ── Italian Variations ──
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4': {
    name: 'Giuoco Piano: Main Line',
    eco: 'C54',
    desc: 'White opens the center with d4. A critical position full of tactics.',
  },
  'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d4': {
    name: 'Two Knights: Fried Liver Attack',
    eco: 'C57',
    desc: 'White sacrifices a knight on f7 for a fierce attacking initiative!',
  },

  // ── Sicilian Variations ──
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6': {
    name: 'Sicilian: Dragon',
    eco: 'B70',
    desc: "Black fianchettoes the king's bishop. White attacks on the queenside.",
  },
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e6': {
    name: 'Sicilian: Scheveningen',
    eco: 'B80',
    desc: 'A solid formation: Black builds a pawn chain on d6-e6.',
  },
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g7g6': {
    name: 'Sicilian: Accelerated Dragon',
    eco: 'B34',
    desc: 'Black fianchettoes immediately, hoping to avoid the Yugoslav Attack.',
  },
  'e2e4 c7c5 b1c3': {
    name: 'Sicilian: Closed',
    eco: 'B25',
    desc: 'White avoids open Sicilian theory with a solid setup.',
  },
  'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6': {
    name: 'Sicilian: Kan Variation',
    eco: 'B41',
    desc: 'A flexible system: Black prepares ...b5 and keeps many options.',
  },
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 e7e6 b1c3 d8c7': {
    name: 'Sicilian: Taimanov',
    eco: 'B44',
    desc: 'Black develops the queen to c7, planning flexible piece play.',
  },

  // ── Caro-Kann Variations ──
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4': {
    name: 'Caro-Kann: Classical',
    eco: 'B18',
    desc: 'Black exchanges on e4 and develops the light-squared bishop outside the chain.',
  },
  'e2e4 c7c6 d2d4 d7d5 e4e5': {
    name: 'Caro-Kann: Advance',
    eco: 'B12',
    desc: 'White grabs space. Black attacks the chain with ...c5 and ...Bf5.',
  },
  'e2e4 c7c6 d2d4 d7d5 b1d2': {
    name: 'Caro-Kann: Karpov System',
    eco: 'B17',
    desc: "Karpov's favorite — d2 knight avoids pins, planning f3 and e4.",
  },

  // ── French Variations ──
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5': {
    name: 'French: Classical Main Line',
    eco: 'C11',
    desc: 'White pins the knight, aiming for e5. A major theoretical battleground.',
  },
  'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5': {
    name: 'French: Advance — Main Line',
    eco: 'C02',
    desc: 'Black immediately attacks the center with ...c5. Sharp play follows.',
  },
  'e2e4 e7e6 d2d4 d7d5 b1c3 f8b4': {
    name: 'French: Winawer',
    eco: 'C15',
    desc: 'Black pins the knight immediately. Creates pawn structure imbalances.',
  },

  // ── Queen's Gambit Variations ──
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5': {
    name: "Queen's Gambit Declined: Orthodox",
    eco: 'D50',
    desc: 'The main line QGD. White pins the f6 knight, increasing pressure on d5.',
  },
  'd2d4 d7d5 c2c4 e7e6 g1f3 g8f6 b1c3 f8e7': {
    name: "Queen's Gambit Declined: Classical",
    eco: 'D55',
    desc: 'Black develops solidly. White has long-term queenside pressure.',
  },
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3': {
    name: 'Semi-Slav Defense',
    eco: 'D43',
    desc: 'A hybrid of the Slav and QGD. Leads to the famous Meran and Moscow variations.',
  },
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 e7e6 e2e3': {
    name: 'Semi-Slav: Meran',
    eco: 'D47',
    desc: 'One of the sharpest lines in all of chess. Mutual attacks on opposite wings.',
  },

  // ── King's Indian Variations ──
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e1g1': {
    name: "King's Indian: Classical",
    eco: 'E91',
    desc: 'White builds the classical center. Black will counter with ...e5 or ...c5.',
  },
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 f2f3': {
    name: "King's Indian: Sämisch",
    eco: 'E81',
    desc: 'White plays f3 to support e4 and prepare a kingside attack. Very aggressive.',
  },
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g2g3': {
    name: "King's Indian: Averbakh",
    eco: 'E73',
    desc: 'White fianchettoes and aims for long-term positional pressure.',
  },

  // ── Nimzo-Indian Variations ──
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3': {
    name: 'Nimzo-Indian: Rubinstein',
    eco: 'E40',
    desc: "White solidly reinforces the center. Black aims to exploit the doubled c-pawns.",
  },
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 d1c2': {
    name: 'Nimzo-Indian: Classical',
    eco: 'E30',
    desc: 'White avoids doubled pawns. A major theoretical battleground.',
  },
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 f2f3': {
    name: 'Nimzo-Indian: Sämisch',
    eco: 'E26',
    desc: 'An aggressive attempt to keep the bishop pair and build a strong center.',
  },

  // ── Grünfeld Variations ──
  'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4': {
    name: 'Grünfeld: Exchange',
    eco: 'D85',
    desc: 'White takes the pawn and builds a massive center. Black destroys it with ...c5.',
  },
  'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 g1f3': {
    name: 'Grünfeld: Russian System',
    eco: 'D97',
    desc: 'White plays Nf3 and prepares Qb3 to pressure d5 and b7.',
  },

  // ── English Variations ──
  'c2c4 e7e5 b1c3': {
    name: 'English: Four Knights',
    eco: 'A28',
    desc: 'Both sides develop knights naturally. Can transpose to many openings.',
  },
  'c2c4 g8f6 b1c3 e7e6 e2e4': {
    name: 'English: King\'s Indian Attack',
    eco: 'A15',
    desc: 'White builds a broad center and prepares kingside expansion.',
  },
  'c2c4 c7c5': {
    name: 'English: Symmetrical',
    eco: 'A30',
    desc: 'Mirror positions. Both sides fight for control of d4 and d5.',
  },

  // ── Other first-move options ──
  'd2d4 d7d5 g1f3': {
    name: "Queen's Pawn: Torre Attack",
    eco: 'D03',
    desc: 'White delays c4, playing Nf3 and Bg5 for a solid, pressure-based setup.',
  },
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4': {
    name: 'Scotch: Main Line',
    eco: 'C45',
    desc: 'After 3.d4 exd4 4.Nxd4 — the main battleground of the Scotch Game.',
  },
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5': {
    name: 'Scotch: Classical (Mieses–Tarrasch)',
    eco: 'C45',
    desc: "Black develops the bishop actively. A natural and ambitious response.",
  },
  'e2e4 e7e5 b1c3 g8f6 f2f4': {
    name: 'Vienna Gambit',
    eco: 'C28',
    desc: 'After Nc3, White offers the Vienna Gambit with f4 — very aggressive!',
  },
  'd2d4 f7f5 g2g3': {
    name: 'Dutch: Leningrad',
    eco: 'A81',
    desc: "White fianchettoes against the Dutch. Black's Leningrad setup is very dynamic.",
  },
  'd2d4 f7f5 c2c4 e7e6 g1f3 g8f6 g2g3': {
    name: 'Dutch: Classical',
    eco: 'A92',
    desc: 'The classical Dutch setup. Black prepares ...d6 and eventual ...e5.',
  },
  'd2d4 g8f6 c2c4 c7c5 d4d5': {
    name: 'Modern Benoni',
    eco: 'A60',
    desc: 'Black creates a queenside pawn majority. Dynamic counterplay vs. space.',
  },
  'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7': {
    name: 'Grünfeld: Exchange with 7.Bc4',
    eco: 'D86',
    desc: 'One of the sharpest Grünfeld lines. White aims for fast kingside play.',
  },
  'e2e4 d7d5 e4d5': {
    name: 'Scandinavian: Exchange',
    eco: 'B01',
    desc: 'White takes the pawn. Black usually recaptures with the queen then retreats.',
  },
  'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5': {
    name: 'Scandinavian: Classical',
    eco: 'B01',
    desc: 'Black retreats the queen to a5 — the main classical line.',
  },
  'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6': {
    name: "Petrov's Defense: Classical",
    eco: 'C42',
    desc: "After 3.Nxe5 d6 — Black chases the knight. Very solid and drawish.",
  },
  'd2d4 e7e6 c2c4 f7f5': {
    name: 'Dutch Defense',
    eco: 'A80',
    desc: 'Reaching Dutch via 1.d4 e6 2.c4 f5 — Black fights for e4.',
  },
};

/**
 * Identify the current opening from a list of UCI moves.
 * Returns the most specific (longest) matching opening.
 */
export function identifyOpening(uciMoves) {
  if (!uciMoves || uciMoves.length === 0) return null;

  let bestMatch = null;
  let bestLen = 0;

  // Try progressively longer prefixes
  for (let len = uciMoves.length; len >= 1; len--) {
    const key = uciMoves.slice(0, len).join(' ');
    if (OPENING_BOOK[key]) {
      if (len > bestLen) {
        bestMatch = { ...OPENING_BOOK[key], moves: len };
        bestLen = len;
      }
    }
  }

  return bestMatch;
}

/**
 * Get a list of all openings in the book for browsing.
 */
export function getAllOpenings() {
  return Object.entries(OPENING_BOOK).map(([moves, data]) => ({
    moves: moves.split(' '),
    ...data,
  }));
}

/**
 * Opening categories for the Explorer panel.
 */
export const OPENING_CATEGORIES = [
  {
    id: 'open',
    name: 'Open Games (1.e4 e5)',
    icon: '♟️',
    color: '#f59e0b',
    firstMoves: ['e2e4 e7e5'],
  },
  {
    id: 'semi_open',
    name: 'Semi-Open (1.e4 ...)',
    icon: '🔥',
    color: '#ef4444',
    firstMoves: ['e2e4 c7c5', 'e2e4 e7e6', 'e2e4 c7c6', 'e2e4 d7d6', 'e2e4 g7g6', 'e2e4 d7d5'],
  },
  {
    id: 'closed',
    name: 'Closed Games (1.d4 d5)',
    icon: '🏰',
    color: '#3b82f6',
    firstMoves: ['d2d4 d7d5'],
  },
  {
    id: 'indian',
    name: 'Indian Defenses (1.d4 Nf6)',
    icon: '🐘',
    color: '#8b5cf6',
    firstMoves: ['d2d4 g8f6'],
  },
  {
    id: 'flank',
    name: 'Flank Openings',
    icon: '🌀',
    color: '#10b981',
    firstMoves: ['c2c4', 'f2f4', 'd2d4 f7f5'],
  },
];

/**
 * Get openings that belong to a given category by matching first-move prefixes.
 */
export function getOpeningsByCategory(categoryId) {
  const cat = OPENING_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return [];
  const all = Object.entries(OPENING_BOOK).map(([key, data]) => ({
    key,
    moves: key.split(' '),
    ...data,
  }));
  return all.filter(o =>
    cat.firstMoves.some(prefix => o.key === prefix || o.key.startsWith(prefix + ' '))
  ).sort((a, b) => a.moves.length - b.moves.length);
}
