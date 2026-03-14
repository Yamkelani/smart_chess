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
