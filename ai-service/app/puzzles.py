"""
Chess Puzzle Database — Curated puzzles for training.
Each puzzle has a FEN, solution moves (UCI), difficulty rating, and theme.
"""

PUZZLES = [
    # ── Beginner Puzzles (800-1200) ──
    {
        "id": "p001",
        "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        "solution": ["h5f7"],
        "rating": 800,
        "theme": "checkmate",
        "title": "Scholar's Mate",
        "description": "White can deliver checkmate in one move!",
    },
    {
        "id": "p002",
        "fen": "rnbqkbnr/ppp2ppp/8/3pp3/4P3/3B4/PPPP1PPP/RNBQK1NR w KQkq d6 0 3",
        "solution": ["e4d5"],
        "rating": 800,
        "theme": "capture",
        "title": "Free Pawn",
        "description": "Capture the undefended pawn in the center.",
    },
    {
        "id": "p003",
        "fen": "rnb1kbnr/ppppqppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 3",
        "solution": ["f3e5"],
        "rating": 850,
        "theme": "tactics",
        "title": "Undefended Pawn",
        "description": "The e5 pawn is only defended by the queen. Win material!",
    },
    {
        "id": "p004",
        "fen": "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        "solution": ["f3g5"],
        "rating": 900,
        "theme": "attack",
        "title": "Knight Attack",
        "description": "Attack the weak f7 square with your knight!",
    },
    {
        "id": "p005",
        "fen": "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2",
        "solution": ["d8h4"],
        "rating": 850,
        "theme": "checkmate",
        "title": "Fool's Mate",
        "description": "Punish White's weak king position with checkmate!",
    },

    # ── Intermediate Puzzles (1200-1600) ──
    {
        "id": "p006",
        "fen": "r2qk2r/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/3P1N2/PPP2PPP/RN1QK2R w KQkq - 2 6",
        "solution": ["c4f7", "e8f7", "f3g5"],
        "rating": 1200,
        "theme": "sacrifice",
        "title": "Bishop Sacrifice on f7",
        "description": "Sacrifice the bishop to expose the king, then attack!",
    },
    {
        "id": "p007",
        "fen": "r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        "solution": ["f3e5", "c6e5", "d2d4"],
        "rating": 1300,
        "theme": "center_control",
        "title": "Central Domination",
        "description": "Win the center by sacrificing then recapturing.",
    },
    {
        "id": "p008",
        "fen": "r1b1kb1r/ppppqppp/2n2n2/1B2N3/4P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 5",
        "solution": ["e5c6", "d7c6", "b5c6"],
        "rating": 1350,
        "theme": "tactics",
        "title": "Knight Fork Setup",
        "description": "Exchange pieces to win material with a discovered attack.",
    },
    {
        "id": "p009",
        "fen": "r2qr1k1/ppp2ppp/2npbn2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 6 8",
        "solution": ["c3d5", "f6d5", "e4d5"],
        "rating": 1400,
        "theme": "pawn_break",
        "title": "Central Pawn Break",
        "description": "Use a knight sacrifice to open the center!",
    },
    {
        "id": "p010",
        "fen": "rnbq1rk1/pp3ppp/4pn2/3p4/1bPP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 2 6",
        "solution": ["c4d5", "e6d5", "f1d3"],
        "rating": 1250,
        "theme": "opening_trap",
        "title": "Opening Trap",
        "description": "Recapture to get a strong attacking position.",
    },

    # ── Advanced Puzzles (1600-2000) ──
    {
        "id": "p011",
        "fen": "r1b2rk1/2q1bppp/p2p1n2/np2p3/3PP3/2N1BN1P/PPQ2PP1/R3KB1R w KQ - 2 12",
        "solution": ["d4d5", "b5c3", "b2c3"],
        "rating": 1600,
        "theme": "pawn_push",
        "title": "Space Advantage",
        "description": "Push in the center to restrict Black's pieces.",
    },
    {
        "id": "p012",
        "fen": "2kr3r/ppp1qppp/2n1bn2/3pp1B1/3P4/2NQPN2/PPP2PPP/2KR3R w - - 4 9",
        "solution": ["d4e5", "d5d4", "e3d4"],
        "rating": 1700,
        "theme": "tactics",
        "title": "Pawn Center Tension",
        "description": "Resolve the tension favorably to gain space.",
    },
    {
        "id": "p013",
        "fen": "r4rk1/pp1bqppp/2n1pn2/3p4/2PP4/1QN1PN2/PP3PPP/R1B1K2R w KQ - 3 9",
        "solution": ["c4d5", "e6d5", "f1b5"],
        "rating": 1800,
        "theme": "pin",
        "title": "Devastating Pin",
        "description": "Open the position and create a nasty pin!",
    },
    {
        "id": "p014",
        "fen": "r2q1rk1/pp2ppbp/2np1np1/8/3NP1b1/2N1BP2/PPPQ2PP/R3KB1R w KQ - 1 9",
        "solution": ["d4c6", "b7c6", "e3a7"],
        "rating": 1900,
        "theme": "material_win",
        "title": "Tactical Sequence",
        "description": "Win material through a forcing sequence.",
    },
    {
        "id": "p015",
        "fen": "r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 2 7",
        "solution": ["e1g1"],
        "rating": 1200,
        "theme": "safety",
        "title": "Castle Now!",
        "description": "Secure your king before launching an attack.",
    },

    # ── Expert Puzzles (2000+) ──
    {
        "id": "p016",
        "fen": "r1b1r1k1/pp1n1pbp/1qpp1np1/4p3/2PPP3/2N1BN1P/PP2BPP1/R2QK2R w KQ - 1 10",
        "solution": ["d4d5", "c6d5", "c4d5", "b6d4"],
        "rating": 2000,
        "theme": "sacrifice",
        "title": "Exchange Sacrifice",
        "description": "Give up material for a crushing positional advantage.",
    },
    {
        "id": "p017",
        "fen": "r2qk2r/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQkq - 2 7",
        "solution": ["c4d5", "e6d5", "f3e5"],
        "rating": 2100,
        "theme": "outpost",
        "title": "Knight Outpost",
        "description": "Establish a powerful knight in the enemy camp.",
    },
    {
        "id": "p018",
        "fen": "r1bq1rk1/pp2bppp/2n1p3/3pP3/3P4/P1N2N2/1P2BPPP/R1BQK2R w KQ - 0 9",
        "solution": ["f3g5", "h7h6", "d1h5"],
        "rating": 2000,
        "theme": "kingside_attack",
        "title": "Kingside Storm",
        "description": "Launch a devastating kingside attack!",
    },
    {
        "id": "p019",
        "fen": "2rq1rk1/pp1bppbp/2np1np1/8/2BNP3/2N1B3/PPP1QPPP/R4RK1 w - - 8 11",
        "solution": ["d4c6", "d7c6", "e3h6"],
        "rating": 2200,
        "theme": "attack",
        "title": "Bishop Pair Attack",
        "description": "Use the bishop pair to rip open the kingside.",
    },
    {
        "id": "p020",
        "fen": "r2q1rk1/1b1nbppp/pp2pn2/3pP3/3P4/P1N1BN2/1PQ1BPPP/R4RK1 w - - 0 12",
        "solution": ["e5f6", "d7f6", "f3g5"],
        "rating": 2100,
        "theme": "pawn_break",
        "title": "Central Break",
        "description": "Open lines against the enemy king.",
    },
]


def get_puzzles(min_rating=0, max_rating=3000, theme=None, limit=10):
    """Get puzzles filtered by rating range and optional theme."""
    filtered = [p for p in PUZZLES if min_rating <= p["rating"] <= max_rating]
    if theme:
        filtered = [p for p in filtered if p["theme"] == theme]
    return filtered[:limit]


def get_puzzle_by_id(puzzle_id):
    """Get a specific puzzle by ID."""
    for p in PUZZLES:
        if p["id"] == puzzle_id:
            return p
    return None


def check_puzzle_move(puzzle_id, move_index, user_move):
    """
    Check if a user's move is correct for a puzzle.
    Returns (correct: bool, is_complete: bool, next_hint: str|None)
    """
    puzzle = get_puzzle_by_id(puzzle_id)
    if not puzzle:
        return False, False, None

    solution = puzzle["solution"]
    if move_index >= len(solution):
        return False, True, None

    correct = user_move == solution[move_index]
    is_complete = correct and move_index == len(solution) - 1

    next_hint = None
    if correct and not is_complete and move_index + 1 < len(solution):
        # Return the opponent's response (even indices are user, odd are opponent)
        next_hint = solution[move_index + 1] if move_index + 1 < len(solution) else None

    return correct, is_complete, next_hint


def get_puzzle_themes():
    """Get all unique puzzle themes."""
    themes = set()
    for p in PUZZLES:
        themes.add(p["theme"])
    return sorted(themes)
