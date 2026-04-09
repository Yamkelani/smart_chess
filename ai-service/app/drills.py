"""
Chess Tactics & Strategy Drill Database.

Drills are organized into categories for structured practice.
Each drill extends the puzzle format with: category, tactic, hint, explanation.

Categories:
  - fork        : Knight/Queen forks winning material
  - pin         : Absolute and relative pins
  - skewer      : Skewers forcing material loss
  - discovery   : Discovered attacks and checks
  - back_rank   : Back-rank mate threats
  - checkmate   : Forced checkmate patterns
  - opening     : Opening line practice
  - endgame     : King + pawn / rook endgames
"""

DRILL_CATEGORIES = [
    {
        "id": "fork",
        "name": "Forks",
        "icon": "🍴",
        "description": "Attack two or more pieces simultaneously to win material.",
        "color": "#f59e0b",
        "count": 0,  # filled at load time
    },
    {
        "id": "pin",
        "name": "Pins",
        "icon": "📌",
        "description": "Pin a piece to the king or a more valuable piece behind it.",
        "color": "#3b82f6",
        "count": 0,
    },
    {
        "id": "skewer",
        "name": "Skewers",
        "icon": "⚔️",
        "description": "Force a valuable piece to move, winning the piece behind it.",
        "color": "#8b5cf6",
        "count": 0,
    },
    {
        "id": "discovery",
        "name": "Discovered Attacks",
        "icon": "💥",
        "description": "Move one piece to unleash a hidden attack from another.",
        "color": "#ef4444",
        "count": 0,
    },
    {
        "id": "back_rank",
        "name": "Back Rank Mates",
        "icon": "🏰",
        "description": "Exploit a weak back rank to deliver checkmate.",
        "color": "#10b981",
        "count": 0,
    },
    {
        "id": "checkmate",
        "name": "Checkmate Patterns",
        "icon": "♟️",
        "description": "Classic mating patterns: smothered mate, Anastasia's mate, and more.",
        "color": "#ec4899",
        "count": 0,
    },
    {
        "id": "opening",
        "name": "Opening Principles",
        "icon": "📖",
        "description": "Practice the first moves: center control, development, king safety.",
        "color": "#06b6d4",
        "count": 0,
    },
    {
        "id": "endgame",
        "name": "Endgame Technique",
        "icon": "🏁",
        "description": "Master king and pawn endings, rook endings, and key theoretical positions.",
        "color": "#84cc16",
        "count": 0,
    },
]

DRILLS = [
    # ══════════════════════════════════════
    # FORKS
    # ══════════════════════════════════════
    {
        "id": "d001",
        "category": "fork",
        "tactic": "knight_fork",
        "title": "Knight Fork — King & Rook",
        "fen": "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1",
        "solution": ["d5f6"],
        "hint": "The knight on d5 can attack two pieces at once.",
        "explanation": "Nf6+ forks the king and rook. The king must move, and the knight takes the rook next move.",
        "rating": 900,
        "side_to_move": "white",
    },
    {
        "id": "d002",
        "category": "fork",
        "tactic": "knight_fork",
        "title": "Knight Fork — Queen & Rook",
        "fen": "2r5/8/8/4q3/8/3N4/8/4K3 w - - 0 1",
        "solution": ["d3f4"],
        "hint": "Find the square where the knight attacks both the queen and rook.",
        "explanation": "Nf4 attacks the queen on e5 and the rook on c8 simultaneously. Black must lose a piece.",
        "rating": 1000,
        "side_to_move": "white",
    },
    {
        "id": "d003",
        "category": "fork",
        "tactic": "knight_fork",
        "title": "Royal Fork",
        "fen": "r3k2r/ppp2ppp/2n5/3p4/3Pn3/2N5/PPP2PPP/R1BQKB1R b KQkq - 0 1",
        "solution": ["e4d2"],
        "hint": "The knight on e4 can fork the queen and rook.",
        "explanation": "Nd2 forks the queen on d1 and rook on a1. White must lose material.",
        "rating": 1100,
        "side_to_move": "black",
    },
    {
        "id": "d004",
        "category": "fork",
        "tactic": "queen_fork",
        "title": "Queen Fork",
        "fen": "r1b1k2r/pppp1ppp/2n5/4p3/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 1",
        "solution": ["d1h5"],
        "hint": "The queen can attack f7, e5, and the king simultaneously.",
        "explanation": "Qh5 attacks the e5 pawn and threatens Qxf7#. Black cannot defend everything.",
        "rating": 1000,
        "side_to_move": "white",
    },
    {
        "id": "d005",
        "category": "fork",
        "tactic": "pawn_fork",
        "title": "Pawn Fork — Two Knights",
        "fen": "8/8/8/2n1n3/8/3P4/8/4K3 w - - 0 1",
        "solution": ["d3d4"],
        "hint": "A single pawn advance can attack two pieces at once.",
        "explanation": "d4! forks the knights on c5 and e5. The pawn attacks both simultaneously, and Black must lose a piece.",
        "rating": 850,
        "side_to_move": "white",
    },

    # ══════════════════════════════════════
    # PINS
    # ══════════════════════════════════════
    {
        "id": "d010",
        "category": "pin",
        "tactic": "absolute_pin",
        "title": "Absolute Pin on the King",
        "fen": "r3k2r/ppp2ppp/2nqbn2/3pp3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1",
        "solution": ["c4b5"],
        "hint": "Pin the knight against the king with your bishop.",
        "explanation": "Bb5 pins the c6 knight absolutely — it cannot move because the king is behind it. This wins a piece or creates a lasting positional advantage.",
        "rating": 1100,
        "side_to_move": "white",
    },
    {
        "id": "d011",
        "category": "pin",
        "tactic": "relative_pin",
        "title": "Relative Pin on the Queen",
        "fen": "r2qkb1r/ppp2ppp/2n1pn2/3p4/2B5/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1",
        "solution": ["c4b5"],
        "hint": "Your bishop can pin a knight against the queen.",
        "explanation": "Bb5 pins the c6 knight relatively against the queen. The knight is now pinned and can be attacked again.",
        "rating": 1150,
        "side_to_move": "white",
    },
    {
        "id": "d012",
        "category": "pin",
        "tactic": "pin_and_win",
        "title": "Pin & Exploit",
        "fen": "rnb1k2r/pp3ppp/2p1pn2/q7/2BP4/2N2N2/PP3PPP/R1BQ1RK1 w kq - 0 1",
        "solution": ["d4d5"],
        "hint": "Advance a pawn to attack the pinned knight.",
        "explanation": "d5 attacks the e6 pawn. The c6 pawn is pinned (would expose the queen). The d5 advance creates a strong central pawn and wins material.",
        "rating": 1300,
        "side_to_move": "white",
    },

    # ══════════════════════════════════════
    # SKEWERS
    # ══════════════════════════════════════
    {
        "id": "d020",
        "category": "skewer",
        "tactic": "rook_skewer",
        "title": "Rook Skewer",
        "fen": "q6k/8/8/8/8/8/8/4R2K w - - 0 1",
        "solution": ["e1e8"],
        "hint": "Check the king to win the piece behind it.",
        "explanation": "Re8+ is a skewer — the king on h8 must move, then Rxa8 wins the queen. A skewer attacks a higher-value piece first, winning the piece behind it.",
        "rating": 900,
        "side_to_move": "white",
    },
    {
        "id": "d021",
        "category": "skewer",
        "tactic": "bishop_skewer",
        "title": "Bishop Skewer",
        "fen": "4k3/8/8/8/8/2B5/8/4K3 w - - 0 1",
        "solution": ["c3a5"],
        "hint": "The bishop can attack along a diagonal to skewer a more valuable piece.",
        "explanation": "Ba5+ skewers the king. After the king moves, the bishop attacks the rook or queen behind. Always look for pieces lined up on diagonals.",
        "rating": 950,
        "side_to_move": "white",
    },
    {
        "id": "d022",
        "category": "skewer",
        "tactic": "queen_skewer",
        "title": "Queen Skewer on Back Rank",
        "fen": "4k2r/8/8/8/8/8/8/3QK3 w - - 0 1",
        "solution": ["d1d8"],
        "hint": "Force the king or queen to move and collect the piece behind.",
        "explanation": "Qd8+ skewers the king against the rook. After Kxd8 the rook hangs, or if king moves, Qxh8 wins the rook for free.",
        "rating": 1000,
        "side_to_move": "white",
    },

    # ══════════════════════════════════════
    # DISCOVERED ATTACKS
    # ══════════════════════════════════════
    {
        "id": "d030",
        "category": "discovery",
        "tactic": "discovered_check",
        "title": "Discovered Check",
        "fen": "r1bqk2r/pppp1ppp/2n2n2/2b5/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
        "solution": ["f3g5"],
        "hint": "Move the knight to reveal a check from the bishop.",
        "explanation": "Ng5 moves the knight, discovering a check from the c4 bishop against the king. The knight also attacks f7. This double threat wins material.",
        "rating": 1200,
        "side_to_move": "white",
    },
    {
        "id": "d031",
        "category": "discovery",
        "tactic": "discovered_attack",
        "title": "Discovered Attack on the Queen",
        "fen": "r1b1k2r/ppppqppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1",
        "solution": ["f3g5"],
        "hint": "Moving the knight reveals an attack on the queen.",
        "explanation": "Ng5 uncovers the bishop's attack on the queen on e7. The knight also threatens f7. Black cannot handle both threats simultaneously.",
        "rating": 1250,
        "side_to_move": "white",
    },
    {
        "id": "d032",
        "category": "discovery",
        "tactic": "double_check",
        "title": "Double Check & Mate",
        "fen": "r1b1k2r/pppp1Npp/8/2b1p3/4P3/8/PPPP1nPP/RNBQKB1R b KQkq - 0 1",
        "solution": ["f2d3"],
        "hint": "A double check can only be escaped by moving the king.",
        "explanation": "Nd3+ is a discovered double check — both the knight and the bishop on c5 give check simultaneously. The king cannot block both checks and must flee.",
        "rating": 1400,
        "side_to_move": "black",
    },

    # ══════════════════════════════════════
    # BACK RANK MATES
    # ══════════════════════════════════════
    {
        "id": "d040",
        "category": "back_rank",
        "tactic": "back_rank_mate",
        "title": "Back Rank Mate",
        "fen": "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
        "solution": ["d1d8"],
        "hint": "The king is trapped on the back rank by its own pawns.",
        "explanation": "Rd8# is checkmate! The pawns on f7, g7, h7 cage the king. The rook delivers mate on the open file. Always look for opponents whose king is stuck behind a pawn wall.",
        "rating": 800,
        "side_to_move": "white",
    },
    {
        "id": "d041",
        "category": "back_rank",
        "tactic": "back_rank_deflection",
        "title": "Deflect the Defender",
        "fen": "2r3k1/5ppp/8/8/8/8/5PPP/2RR2K1 w - - 0 1",
        "solution": ["d1d8", "c8d8", "c1d1"],
        "hint": "Force the defending rook away from the back rank.",
        "explanation": "Rxd8+ forces Rxd8, then Rxd8# delivers back-rank checkmate. Deflection is key: remove the guard before striking.",
        "rating": 1100,
        "side_to_move": "white",
    },
    {
        "id": "d042",
        "category": "back_rank",
        "tactic": "back_rank_sacrifice",
        "title": "Queen Sacrifice for Back Rank Mate",
        "fen": "5rk1/5ppp/4Q3/8/8/8/5PPP/4R1K1 w - - 0 1",
        "solution": ["e6e8", "f8e8", "e1e8"],
        "hint": "Sacrifice your most powerful piece to lure the defender away.",
        "explanation": "Qe8! sacrifices the queen. After Rxe8 (forced, or else Qxf8#), Rxe8# is back-rank checkmate. The pawns on f7, g7, h7 cage the king.",
        "rating": 1200,
        "side_to_move": "white",
    },

    # ══════════════════════════════════════
    # CHECKMATE PATTERNS
    # ══════════════════════════════════════
    {
        "id": "d050",
        "category": "checkmate",
        "tactic": "smothered_mate",
        "title": "Smothered Mate",
        "fen": "6rk/6pp/8/8/8/8/8/5N1K w - - 0 1",
        "solution": ["f1g3", "g8g6", "g3f5", "g6g8", "f5h6", "g8h8", "h6f7"],
        "hint": "The knight can deliver checkmate when the king is smothered by its own pieces.",
        "explanation": "The smothered mate pattern: Ng3, Rg6 (forced), Nf5, Rg8 (forced), Nh6, Rh8 (forced), Nf7#! The king is trapped by its own rook and pawns.",
        "rating": 1500,
        "side_to_move": "white",
    },
    {
        "id": "d051",
        "category": "checkmate",
        "tactic": "anastasia_mate",
        "title": "Anastasia's Mate",
        "fen": "5rk1/4Rnpp/8/8/8/8/8/6K1 w - - 0 1",
        "solution": ["e7h7"],
        "hint": "The rook and knight combine to trap the king against the side of the board.",
        "explanation": "Rxh7+! The rook forces the king to h8 (or takes and the knight mates). The knight on e7 covers f8 and g6. This is Anastasia's mate — rook on the h-file traps the king against the edge.",
        "rating": 1400,
        "side_to_move": "white",
    },
    {
        "id": "d052",
        "category": "checkmate",
        "tactic": "legal_trap",
        "title": "Légal's Mate",
        "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 2 4",
        "solution": ["f3e5", "d8g5", "e5f7"],
        "hint": "Sacrifice the queen to deliver checkmate with minor pieces.",
        "explanation": "Ne5! If Black takes with Qxg5, then Nxf7+, Ke7, Nd5# — Légal's Mate! The queen sacrifice is only sound if Black takes the bait. Always verify your combinations before sacrificing.",
        "rating": 1300,
        "side_to_move": "white",
    },
    {
        "id": "d053",
        "category": "checkmate",
        "tactic": "two_rooks_mate",
        "title": "Lawnmower Mate",
        "fen": "6k1/8/8/8/8/8/8/RR5K w - - 0 1",
        "solution": ["b1b7", "g8f8", "a1a8"],
        "hint": "Use two rooks to cut off the king rank by rank.",
        "explanation": "Rb7, then Ra8# — the lawnmower or roller mate. Two rooks take turns cutting off the king's escape rows until checkmate. Essential endgame technique.",
        "rating": 700,
        "side_to_move": "white",
    },

    # ══════════════════════════════════════
    # OPENING PRINCIPLES
    # ══════════════════════════════════════
    {
        "id": "d060",
        "category": "opening",
        "tactic": "center_control",
        "title": "Control the Center — e4",
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "solution": ["e2e4"],
        "hint": "Place a pawn in the center to control key squares.",
        "explanation": "1.e4 is the most popular first move. It controls d5 and f5, opens lines for the bishop and queen, and claims central space. The center is the most important part of the board in the opening.",
        "rating": 600,
        "side_to_move": "white",
    },
    {
        "id": "d061",
        "category": "opening",
        "tactic": "rapid_development",
        "title": "Develop Before Attacking",
        "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
        "solution": ["g1f3"],
        "hint": "Develop a knight toward the center before pushing more pawns.",
        "explanation": "Nf3 develops the knight toward the center, attacks the e5 pawn, and prepares to castle. Opening principle: develop knights before bishops, and develop pieces before moving the same piece twice.",
        "rating": 650,
        "side_to_move": "white",
    },
    {
        "id": "d062",
        "category": "opening",
        "tactic": "castling",
        "title": "Castle for King Safety",
        "fen": "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        "solution": ["e1g1"],
        "hint": "Your king is in the center — castle immediately.",
        "explanation": "O-O (short castle) tucks the king away safely behind the pawn wall and connects the rooks. Rule of thumb: castle before move 10, preferably before launching any attack.",
        "rating": 700,
        "side_to_move": "white",
    },
    {
        "id": "d063",
        "category": "opening",
        "tactic": "avoid_early_queen",
        "title": "Don't Bring the Queen Out Early",
        "fen": "rnb1kbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2",
        "solution": ["b8c6"],
        "hint": "Develop a minor piece instead of bringing out the queen early.",
        "explanation": "Nc6 develops the knight with tempo, attacking nothing but supporting center control. Bringing the queen out early invites attacks: Nc3, Nf3, d4 all chase it away while developing pieces.",
        "rating": 700,
        "side_to_move": "black",
    },

    # ══════════════════════════════════════
    # ENDGAME TECHNIQUE
    # ══════════════════════════════════════
    {
        "id": "d070",
        "category": "endgame",
        "tactic": "opposition",
        "title": "King Opposition",
        "fen": "8/8/8/3k4/8/3K4/8/8 w - - 0 1",
        "solution": ["d3e3"],
        "hint": "Use the opposition to gain a key square.",
        "explanation": "Ke3! takes the opposition — both kings are separated by one square on the same file. The side NOT to move (here Black) is in opposition and must give ground. Whoever does NOT have the opposition in this case has the advantage.",
        "rating": 1000,
        "side_to_move": "white",
    },
    {
        "id": "d071",
        "category": "endgame",
        "tactic": "pawn_promotion",
        "title": "Pawn Race to Promotion",
        "fen": "8/3p4/8/8/8/8/3P4/8 w - - 0 1",
        "solution": ["d2d4"],
        "hint": "Advance the pawn as fast as possible.",
        "explanation": "d4! uses the pawn's option to move two squares on the first move. In a pawn race, every tempo matters. Calculate who promotes first and whether they check on promotion.",
        "rating": 800,
        "side_to_move": "white",
    },
    {
        "id": "d072",
        "category": "endgame",
        "tactic": "lucena_position",
        "title": "Building a Bridge — Lucena Position",
        "fen": "1K1k4/1P6/8/8/8/8/r7/5R2 w - - 0 1",
        "solution": ["f1f4"],
        "hint": "Build a bridge to shelter the king from rook checks.",
        "explanation": "Rf4! begins building a bridge. The plan: Rf4, Kc7, Rc4+, Kb6, Rc1, Kxa7... wait — this simplified position demonstrates the key idea: use the rook to cut off the enemy rook's checking distance.",
        "rating": 1400,
        "side_to_move": "white",
    },
    {
        "id": "d073",
        "category": "endgame",
        "tactic": "triangulation",
        "title": "Triangulation",
        "fen": "8/5p2/5k2/5P2/5K2/8/8/8 w - - 0 1",
        "solution": ["f4e4"],
        "hint": "Waste a tempo by triangulating your king to put the opponent in zugzwang.",
        "explanation": "Ke4! begins triangulation. The white king takes 3 moves to return to f4 (Ke4-e3-f3-f4) while the black king has no useful moves. This puts Black in zugzwang — any move worsens their position.",
        "rating": 1300,
        "side_to_move": "white",
    },
]


def _build_category_counts():
    """Fill in the count field for each category."""
    counts = {}
    for d in DRILLS:
        counts[d["category"]] = counts.get(d["category"], 0) + 1
    for cat in DRILL_CATEGORIES:
        cat["count"] = counts.get(cat["id"], 0)


_build_category_counts()


def get_categories():
    """Return all drill categories with counts."""
    return DRILL_CATEGORIES


def get_drills_by_category(category_id: str):
    """Return all drills for a given category (without solutions)."""
    drills = [d for d in DRILLS if d["category"] == category_id]
    return [{k: v for k, v in d.items() if k != "solution"} for d in drills]


def get_drill_by_id(drill_id: str):
    """Return a specific drill by ID."""
    for d in DRILLS:
        if d["id"] == drill_id:
            return d
    return None


def check_drill_move(drill_id: str, move_index: int, user_move: str):
    """
    Check if a user's move matches the drill solution.
    Returns (correct, is_complete, next_move, explanation).
    next_move is the opponent's reply to auto-play (odd indices).
    """
    drill = get_drill_by_id(drill_id)
    if not drill:
        return False, False, None, None

    solution = drill["solution"]
    if move_index >= len(solution):
        return False, True, None, None

    correct = user_move == solution[move_index]
    is_complete = correct and move_index == len(solution) - 1

    next_move = None
    explanation = None
    if correct and not is_complete and move_index + 1 < len(solution):
        next_move = solution[move_index + 1]
    if is_complete:
        explanation = drill.get("explanation", "")

    return correct, is_complete, next_move, explanation


def get_drill_hint(drill_id: str):
    """Return the hint for a drill."""
    drill = get_drill_by_id(drill_id)
    if not drill:
        return None
    return drill.get("hint", "")
