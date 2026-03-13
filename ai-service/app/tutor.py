"""
Chess Tutor AI — Knowledge Base & Position Analysis

Provides:
1. Comprehensive chess lessons organized by category
2. Position-aware analysis and advice
3. Natural language Q&A about chess concepts
4. Pattern matching for contextual coaching
"""

import chess
import re
from typing import Optional, List, Dict

# ═══════════════════════════════════════════════════
# CHESS KNOWLEDGE BASE
# ═══════════════════════════════════════════════════

LESSONS = {
    "basics": {
        "title": "♟ Chess Basics",
        "icon": "♟",
        "items": [
            {
                "id": "how-pieces-move",
                "title": "How Pieces Move",
                "desc": "Movement rules for every chess piece",
                "content": """<h3>How Each Piece Moves</h3>
<p><strong>King ♔</strong> — Moves one square in any direction. The most important piece — if checkmated, you lose!</p>
<p><strong>Queen ♕</strong> — Moves any number of squares in any direction (horizontal, vertical, diagonal). The most powerful piece.</p>
<p><strong>Rook ♖</strong> — Moves any number of squares horizontally or vertically. Very strong in open files.</p>
<p><strong>Bishop ♗</strong> — Moves any number of squares diagonally. Each bishop stays on its starting color forever.</p>
<p><strong>Knight ♞</strong> — Moves in an "L" shape: 2 squares in one direction + 1 square perpendicular. The only piece that can jump over others!</p>
<p><strong>Pawn ♙</strong> — Moves forward one square (or two from starting position). Captures diagonally forward. Can promote to any piece when reaching the last rank.</p>"""
            },
            {
                "id": "piece-values",
                "title": "Piece Values",
                "desc": "How much each piece is worth",
                "content": """<h3>Piece Values</h3>
<p>Understanding piece values helps you decide when to trade:</p>
<ul>
<li><strong>Pawn</strong> = 1 point</li>
<li><strong>Knight</strong> = 3 points</li>
<li><strong>Bishop</strong> = 3 points (slightly stronger than knight in open positions)</li>
<li><strong>Rook</strong> = 5 points</li>
<li><strong>Queen</strong> = 9 points</li>
<li><strong>King</strong> = Infinite (game over if lost!)</li>
</ul>
<p><strong>Key insight:</strong> A Rook (5) is worth more than a Bishop+Pawn (4). Two Rooks (10) are roughly equal to a Queen (9). The <em>Bishop Pair</em> (both bishops) gets a bonus of about +0.5 points.</p>"""
            },
            {
                "id": "special-moves",
                "title": "Special Moves",
                "desc": "Castling, en passant, and promotion",
                "content": """<h3>Special Moves</h3>
<p><strong>Castling</strong> — Move king 2 squares toward a rook, rook jumps to the other side. Requirements:</p>
<ul>
<li>Neither king nor rook has moved before</li>
<li>No pieces between them</li>
<li>King is not in check</li>
<li>King doesn't pass through or land on an attacked square</li>
</ul>
<p>Notation: <code>O-O</code> (kingside) or <code>O-O-O</code> (queenside)</p>

<p><strong>En Passant</strong> — When an opponent's pawn advances 2 squares from its starting position and lands beside your pawn, you can capture it as if it only moved 1 square. Must be done immediately.</p>

<p><strong>Promotion</strong> — When a pawn reaches the last rank (8th for white, 1st for black), it MUST promote to a queen, rook, bishop, or knight. Usually you choose queen.</p>"""
            },
            {
                "id": "checkmate-patterns",
                "title": "Basic Checkmates",
                "desc": "Back rank mate, Scholar's mate, and more",
                "content": """<h3>Essential Checkmate Patterns</h3>
<p><strong>Back Rank Mate</strong> — A rook or queen checkmates the king trapped on the back rank by its own pawns. Prevention: Make a "luft" (escape square) by pushing h3/g3.</p>

<p><strong>Scholar's Mate</strong> — <code>1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#</code>. Defense: Don't let the queen and bishop target f7/f2 together.</p>

<p><strong>Fool's Mate</strong> — The fastest checkmate: <code>1.f3 e5 2.g4 Qh4#</code>. Only 2 moves! Shows why you shouldn't weaken f2/f7 carelessly.</p>

<p><strong>King + Queen vs King</strong> — Use your queen to gradually push the enemy king to the edge, then deliver checkmate with your king supporting.</p>

<p><strong>King + Rook vs King</strong> — Use your rook to cut off ranks/files, drive the king to the edge, then checkmate.</p>"""
            }
        ]
    },
    "openings": {
        "title": "📖 Opening Theory",
        "icon": "📖",
        "items": [
            {
                "id": "opening-principles",
                "title": "Opening Principles",
                "desc": "The golden rules of the opening",
                "content": """<h3>Opening Principles</h3>
<ul>
<li><strong>Control the center</strong> — Place pawns on e4/d4 (or e5/d5 for black). Central pawns control key squares.</li>
<li><strong>Develop pieces quickly</strong> — Get knights and bishops out before move 8. Knights usually go to f3/c3 (or f6/c6).</li>
<li><strong>Don't move the same piece twice</strong> — Unless forced. Each move should develop a new piece.</li>
<li><strong>Castle early</strong> — Ideally before move 10. This protects your king and connects your rooks.</li>
<li><strong>Don't bring the queen out too early</strong> — She can get chased by minor pieces, losing tempo.</li>
<li><strong>Connect your rooks</strong> — After developing all minor pieces and castling, your rooks should see each other.</li>
</ul>"""
            },
            {
                "id": "italian-game",
                "title": "Italian Game",
                "desc": "1.e4 e5 2.Nf3 Nc6 3.Bc4",
                "content": """<h3>Italian Game</h3>
<p>Moves: <code>1.e4 e5 2.Nf3 Nc6 3.Bc4</code></p>
<p>The Italian Game is one of the oldest and most natural openings in chess. White develops the bishop to c4, aiming at the weak f7 pawn.</p>
<p><strong>Key ideas for White:</strong></p>
<ul>
<li>Put pressure on f7 through the bishop</li>
<li>Quick kingside castling</li>
<li>Play d3 or d4 to control the center</li>
</ul>
<p><strong>Main responses for Black:</strong></p>
<ul>
<li><code>3...Bc5</code> — Giuoco Piano ("Quiet Game"), solid and balanced</li>
<li><code>3...Nf6</code> — Two Knights Defense, more aggressive</li>
</ul>
<p><strong>Trap to know:</strong> After <code>3...Nf6 4.Ng5</code>, White threatens Nxf7 (Fried Liver Attack). Black must play carefully!</p>"""
            },
            {
                "id": "sicilian-defense",
                "title": "Sicilian Defense",
                "desc": "1.e4 c5 — most popular response to e4",
                "content": """<h3>Sicilian Defense</h3>
<p>Moves: <code>1.e4 c5</code></p>
<p>The most popular and statistically best response to 1.e4. Black immediately fights for the center asymmetrically.</p>
<p><strong>Why it works:</strong></p>
<ul>
<li>Black gets a semi-open c-file after ...cxd4</li>
<li>Unbalanced positions with winning chances for both sides</li>
<li>Black avoids the symmetrical positions of 1...e5</li>
</ul>
<p><strong>Main variations:</strong></p>
<ul>
<li><strong>Najdorf</strong> (<code>5...a6</code>) — Bobby Fischer's favorite, most theoretically challenging</li>
<li><strong>Dragon</strong> (<code>5...g6</code>) — Fianchetto the bishop to g7 for maximum king safety</li>
<li><strong>Classical</strong> (<code>5...Nc6</code>) — Solid development</li>
</ul>"""
            },
            {
                "id": "queens-gambit",
                "title": "Queen's Gambit",
                "desc": "1.d4 d5 2.c4 — classic and solid",
                "content": """<h3>Queen's Gambit</h3>
<p>Moves: <code>1.d4 d5 2.c4</code></p>
<p>Not a true gambit — White usually wins back the pawn. One of the most respected openings at all levels.</p>
<p><strong>Black's main choices:</strong></p>
<ul>
<li><code>2...dxc4</code> — Queen's Gambit Accepted (QGA). Take and let White recapture, then develop freely.</li>
<li><code>2...e6</code> — Queen's Gambit Declined (QGD). Solid but slightly passive. The light-squared bishop can be hard to develop.</li>
<li><code>2...c6</code> — Slav Defense. Black plans to take on c4 and support with ...b5. Very solid.</li>
</ul>
<p><strong>Key principle:</strong> In d4 openings, the game is generally slower and more strategic than e4 openings. Piece maneuvering and pawn structure matter more.</p>"""
            }
        ]
    },
    "tactics": {
        "title": "⚔️ Tactics",
        "icon": "⚔️",
        "items": [
            {
                "id": "forks",
                "title": "Forks",
                "desc": "Attack two pieces at once",
                "content": """<h3>Forks</h3>
<p>A <strong>fork</strong> is when one piece attacks two or more enemy pieces simultaneously.</p>
<p><strong>Knight forks</strong> are the most devastating because knights can't be blocked:</p>
<ul>
<li><strong>Royal Fork</strong> — Knight attacks both king and queen. The king MUST move, and the queen is lost!</li>
<li>Look for knight forks on the 6th/3rd rank, targeting king and rook</li>
</ul>
<p><strong>Pawn forks</strong> are also common — a pawn attacking two pieces diagonally.</p>
<p><strong>How to spot them:</strong> Look for two enemy pieces on the same color squares (for knight forks) or with specific geometric patterns. After every move, check: "Can any of my pieces attack two things at once?"</p>"""
            },
            {
                "id": "pins-skewers",
                "title": "Pins & Skewers",
                "desc": "Line-based tactical motifs",
                "content": """<h3>Pins & Skewers</h3>
<p><strong>Pin</strong> — A piece can't move because it would expose a more valuable piece behind it. Types:</p>
<ul>
<li><strong>Absolute pin</strong>: The piece behind is the king (illegal to move the pinned piece)</li>
<li><strong>Relative pin</strong>: The piece behind is valuable but not king (legal but costly to move)</li>
</ul>
<p>Example: Bishop on g5 pinning a knight on f6 to the queen on d8.</p>

<p><strong>Skewer</strong> — The reverse of a pin: you attack a valuable piece, and when it moves, you capture the less valuable piece behind it.</p>
<p>Example: Rook checks the king, king moves, rook captures the queen behind it.</p>
<p><strong>Remember:</strong> Pins and skewers work along lines (ranks, files, diagonals). Always check lines through the enemy king!</p>"""
            },
            {
                "id": "discovered-attacks",
                "title": "Discovered Attacks",
                "desc": "Move one piece, another attacks",
                "content": """<h3>Discovered Attacks</h3>
<p>A <strong>discovered attack</strong> occurs when you move a piece out of the way, revealing an attack by another piece behind it.</p>
<p><strong>Discovered check</strong> is especially powerful — the piece you move can go anywhere while the revealed piece gives check!</p>
<p>Example: Bishop on c1, knight on d2. Moving the knight reveals the bishop's diagonal attack.</p>
<p><strong>Double check</strong> — Both the moving piece AND the revealed piece give check. The ONLY defense is to move the king! This is one of the most powerful tactical motifs.</p>
<p><strong>How to set them up:</strong> Look for situations where your pieces are aligned with an enemy piece, with one of your pieces in between. Moving the middle piece creates the discovery.</p>"""
            },
            {
                "id": "sacrifices",
                "title": "Sacrifices",
                "desc": "Give up material for a greater gain",
                "content": """<h3>Sacrifices</h3>
<p>A <strong>sacrifice</strong> is intentionally giving up material for a positional or tactical advantage.</p>
<p><strong>Common sacrifice types:</strong></p>
<ul>
<li><strong>Exchange sacrifice</strong> — Give up a rook for a knight/bishop to gain positional compensation</li>
<li><strong>Greek Gift</strong> (<code>Bxh7+</code>) — Classic bishop sacrifice on h7 to expose the king</li>
<li><strong>Clearance sacrifice</strong> — Sacrifice a piece to clear a square or line for another piece</li>
<li><strong>Deflection sacrifice</strong> — Force a defending piece away from a key square</li>
</ul>
<p><strong>When to sacrifice:</strong></p>
<ul>
<li>Your opponent's king is exposed or poorly defended</li>
<li>You can follow up with a mating attack</li>
<li>The resulting position gives you overwhelming activity</li>
</ul>"""
            }
        ]
    },
    "strategy": {
        "title": "🧠 Strategy",
        "icon": "🧠",
        "items": [
            {
                "id": "pawn-structure",
                "title": "Pawn Structure",
                "desc": "The skeleton of your position",
                "content": """<h3>Pawn Structure</h3>
<p>Pawns can't move backwards, so pawn moves are permanent decisions that shape the game.</p>
<p><strong>Key concepts:</strong></p>
<ul>
<li><strong>Isolated pawn</strong> — No friendly pawns on adjacent files. Weakness: can't be defended by pawns. Strength: controls key squares.</li>
<li><strong>Doubled pawns</strong> — Two pawns on the same file. Generally weak but can control important squares.</li>
<li><strong>Passed pawn</strong> — No enemy pawns can block or capture it on the way to promotion. Very valuable in endgames!</li>
<li><strong>Pawn chain</strong> — Diagonal chain of pawns. Attack the base of the chain!</li>
<li><strong>Pawn majority</strong> — More pawns on one side of the board. Use it to create a passed pawn.</li>
</ul>"""
            },
            {
                "id": "king-safety",
                "title": "King Safety",
                "desc": "Protecting your most important piece",
                "content": """<h3>King Safety</h3>
<p>An unsafe king is the #1 cause of losses. Prioritize king safety!</p>
<p><strong>Guidelines:</strong></p>
<ul>
<li><strong>Castle early</strong> — Usually kingside. Don't delay past move 10 if you can help it.</li>
<li><strong>Keep pawns in front of the king</strong> — Don't push h/g/f pawns in front of your castled king unless absolutely necessary.</li>
<li><strong>Watch for back rank weaknesses</strong> — Always consider whether you need a "luft" (h3/g3 to give the king an escape square).</li>
<li><strong>Opposite-side castling</strong> — If both players castle on opposite sides, it becomes a RACE to attack the other king. Very sharp!</li>
</ul>
<p><strong>Signs your king is unsafe:</strong> Missing pawn shield, open files toward your king, opponent has active pieces aimed at your king.</p>"""
            },
            {
                "id": "piece-activity",
                "title": "Piece Activity",
                "desc": "Active pieces win games",
                "content": """<h3>Piece Activity</h3>
<p>A centralized, active piece is worth much more than a passive one stuck on the edge.</p>
<p><strong>Guidelines for each piece:</strong></p>
<ul>
<li><strong>Knights</strong> — Best on central outpost squares (e4/d4/e5/d5) supported by pawns. Knights on the rim are dim!</li>
<li><strong>Bishops</strong> — Need open diagonals. A "bad bishop" is one blocked by its own pawns.</li>
<li><strong>Rooks</strong> — Place on open files (no pawns) or semi-open files. Rooks on the 7th rank are hugely powerful.</li>
<li><strong>Queen</strong> — Flexible piece; avoid placing her where she can be attacked with tempo.</li>
</ul>
<p><strong>Key idea:</strong> If your pieces are more active than your opponent's, you have an advantage even if material is equal.</p>"""
            }
        ]
    },
    "endgame": {
        "title": "🏁 Endgames",
        "icon": "🏁",
        "items": [
            {
                "id": "king-pawn-endgames",
                "title": "King + Pawn Endgames",
                "desc": "The fundamental endgames",
                "content": """<h3>King + Pawn Endgames</h3>
<p>These are the foundation of all endgame knowledge.</p>
<p><strong>Key concepts:</strong></p>
<ul>
<li><strong>Opposition</strong> — When kings face each other with one square between them, the player NOT to move has the opposition (advantage). This often determines if a pawn can promote.</li>
<li><strong>Rule of the Square</strong> — Can your king catch a passed pawn? Draw a square from the pawn to the promotion rank. If the king can step inside the square, it catches the pawn.</li>
<li><strong>Key squares</strong> — For each pawn position, there are specific squares the king must reach to ensure promotion.</li>
</ul>
<p><strong>Critical rule:</strong> King + Pawn vs King is a draw if the defending king reaches the square in front of the pawn and has the opposition.</p>"""
            },
            {
                "id": "rook-endgames",
                "title": "Rook Endgames",
                "desc": "Most common endgame type",
                "content": """<h3>Rook Endgames</h3>
<p>Rook endgames occur in about 50% of all games, so mastering them is crucial.</p>
<p><strong>Essential principles:</strong></p>
<ul>
<li><strong>Lucena Position</strong> — Rook + pawn vs rook. If you can build a "bridge" with your rook, you win. The most important endgame technique!</li>
<li><strong>Philidor Position</strong> — The key defensive technique. Keep your rook on the 3rd rank, then move to the back rank when the pawn advances.</li>
<li><strong>Rooks belong behind passed pawns</strong> — Behind your own to push, behind the opponent's to restrain.</li>
<li><strong>Active king</strong> — In the endgame, the king is a fighting piece. Centralize it!</li>
<li><strong>Cut off the king</strong> — Use your rook to keep the enemy king away from your pawns.</li>
</ul>"""
            }
        ]
    }
}


# ═══════════════════════════════════════════════════
# AI Q&A ENGINE — Pattern-based chess knowledge
# ═══════════════════════════════════════════════════

QA_PATTERNS = [
    # Openings
    (r'\b(best|good|recommended)\b.*\bopening\b.*\b(beginner|new|start)', 
     "For beginners, I recommend:\n\n**As White:** The **Italian Game** (1.e4 e5 2.Nf3 Nc6 3.Bc4) — natural development, attacks f7, easy to understand.\n\n**As Black vs 1.e4:** The **Sicilian Defense** (1...c5) for aggressive play, or **1...e5** for classical play.\n\n**As Black vs 1.d4:** The **Queen's Gambit Declined** (1...d5 2.c4 e6) — solid and reliable.\n\nThe key is to follow opening principles: control the center, develop pieces, castle early!"),
    
    (r'\b(best|top|strongest)\b.*\bopening\b',
     "The most popular openings at the highest level:\n\n**For White:** 1.e4 (King's Pawn) and 1.d4 (Queen's Pawn) are both excellent. 1.Nf3 and 1.c4 (English) are also solid.\n\n**Against 1.e4:** Sicilian Defense (1...c5) scores the best statistically. The French (1...e6) and Caro-Kann (1...c6) are solid alternatives.\n\n**Against 1.d4:** The Queen's Gambit Declined, Nimzo-Indian (3...Bb4), and King's Indian Defense are all top choices.\n\nChoose an opening that fits your style — aggressive or positional!"),

    (r'\bsicilian\b',
     "The **Sicilian Defense** (1.e4 c5) is Black's most popular and highest-scoring reply to 1.e4.\n\n**Main variations:**\n• **Open Sicilian** (2.Nf3 + 3.d4) — the theoretical main line\n• **Najdorf** (5...a6) — Fischer's weapon, incredibly rich\n• **Dragon** (5...g6) — agressive with the fianchettoed bishop\n• **Sveshnikov** (5...e5) — modern and dynamic\n\nFor beginners, I suggest learning the **Classical** (5...Nc6) or **Dragon** first."),

    (r'\b(italian|giuoco piano)\b',
     "The **Italian Game** (1.e4 e5 2.Nf3 Nc6 3.Bc4):\n\n**Main lines:**\n• **Giuoco Piano** (3...Bc5) — balanced and strategic\n• **Two Knights** (3...Nf6) — sharper, leads to the Fried Liver Attack after 4.Ng5\n• **Evans Gambit** (4.b4) — sacrifices a pawn for rapid development\n\nThe Italian is perfect for developing fundamental chess skills. It teaches piece coordination and attacking play."),

    (r"\bqueen'?s?\s*gambit\b",
     "The **Queen's Gambit** (1.d4 d5 2.c4):\n\nNot a true gambit — White usually regains the pawn.\n\n**Black's responses:**\n• **QGD** (2...e6) — solid, the most popular at top level\n• **QGA** (2...dxc4) — accept and equalize\n• **Slav** (2...c6) — very solid, keeps the light-squared bishop active\n\nThe Queen's Gambit leads to strategic, positional middlegames where understanding pawn structures is key."),

    # Tactics
    (r'\b(fork|forks)\b',
     "A **fork** attacks two or more pieces at once!\n\n**Most common forks:**\n• **Knight fork** — A knight attacks two pieces simultaneously. Especially deadly: the Royal Fork (king + queen!)\n• **Pawn fork** — A pawn advance attacks two pieces diagonally\n• **Queen fork** — Queen's range makes her a great forking piece\n\n**How to spot them:** After every move, look at all squares your pieces can reach. Are any of those squares attacking two things? Knights are particularly tricky because they can't be blocked."),

    (r'\b(pin|pins)\b.*\b(skewer|skewers)?\b',
     "**Pins** and **Skewers** are line-based tactics:\n\n**Pin:** A piece can't move because it would expose a more valuable piece behind it.\n• Absolute pin: piece behind is the king (can't legally move)\n• Relative pin: piece behind is just more valuable\n\n**Skewer:** Reverse of a pin — attack a valuable piece, when it moves, capture what's behind.\n\nBishops and rooks are the best pinning/skewering pieces because they attack along long lines."),

    (r'\btacti(c|cs|cal)\b',
     "The most important **tactical patterns** to learn:\n\n1. **Forks** — Attack two pieces at once (especially knight forks)\n2. **Pins** — Immobilize a piece by attacking along a line\n3. **Skewers** — Attack a valuable piece, capture behind it\n4. **Discovered attacks** — Move one piece to reveal an attack by another\n5. **Double check** — Two pieces give check; only king moves defend\n6. **Removal of the guard** — Capture/deflect a defending piece\n7. **Zwischenzug** — An in-between move before the expected recapture\n\nPractice tactics daily — even 15 minutes makes a big difference!"),

    # Strategy
    (r'\b(center|central|centre)\b.*\b(control|import)',
     "**Center control** is crucial because:\n\n• Central pieces control more squares than edge pieces\n• A knight on e4 controls 8 squares; on a1 it controls only 2\n• Pawns on e4/d4 restrict opponent's piece movement\n• Whoever controls the center can more easily shift forces kingside or queenside\n\n**Methods of center control:**\n1. Direct: place pawns on e4/d4\n2. Hypermodern: control the center with pieces from a distance (fianchetto)\n3. Indirect: undermine opponent's center pawns"),

    (r'\bcastle|castling\b',
     "**Castling** is one of the most important moves:\n\n**When to castle:** As early as possible, ideally before move 10. Castle when:\n• Your minor pieces are developed\n• The center is not fully closed\n• You see potential attacks on your uncastled king\n\n**Kingside (O-O)** is more common because it's faster (fewer pieces to develop first).\n\n**Queenside (O-O-O)** gives your king one more safe square but takes longer to achieve.\n\n**Never forget:** You can't castle through check, out of check, or into check!"),

    # Endgames
    (r'\b(endgame|end\s*game)\b',
     "**Essential endgame knowledge:**\n\n1. **King activity** — In the endgame, the king is a FIGHTING piece. Centralize it!\n2. **Passed pawns** — Create and push passed pawns. They're the key to winning.\n3. **Opposition** — In king+pawn endings, opposition often determines the outcome.\n4. **Rook endgames** — Most common endgame type. Learn the Philidor and Lucena positions.\n5. **Rule of the Square** — Quick check whether your king can catch a passed pawn.\n\nMany games are decided in the endgame. Even a small advantage can be converted with proper technique!"),

    (r'\bcheckmate\b.*\b(king|rook|queen)\b|\b(king|rook|queen)\b.*\bcheckmate\b',
     "**Basic checkmate techniques:**\n\n**King + Queen vs King:** Push the enemy king to the edge using your queen (don't get too close or you'll stalemate!). Then bring your king to support.\n\n**King + Rook vs King:** Use the rook to cut off ranks/files, gradually pushing the enemy king to the edge. Then deliver mate with your king supporting.\n\n**King + 2 Bishops vs King:** Coordinate bishops to drive the king to a corner.\n\n⚠️ **King + Bishop vs King** or **King + Knight vs King** = DRAW (insufficient material)."),

    (r'\bstalemate\b',
     "**Stalemate** = DRAW! It occurs when the player to move has NO legal moves but is NOT in check.\n\n**Common stalemate traps:**\n• Be careful with King + Queen vs King — don't take away ALL the opponent's squares\n• Watch out when you have a huge material advantage — don't accidentally stalemate\n• When you're losing, look for stalemate tricks as a way to save the game!\n\nTip: Always count your opponent's legal moves before making a move if you're winning."),

    # Improvement
    (r'\b(improve|better|higher|rating|elo)\b.*\b(chess|play|skill|game)\b',
     "**How to improve at chess:**\n\n1. **Tactics, tactics, tactics** — Solve puzzles daily. This is the #1 way to improve, especially below 1500.\n2. **Analyze your games** — Review every game you play. Find where you went wrong.\n3. **Learn basic endgames** — King+Pawn, Rook endgames, and basic mates.\n4. **Study one opening** — Pick one opening as white and one as black. Learn the ideas, not just moves.\n5. **Play longer time controls** — Blitz is fun but you learn more from longer games.\n6. **Learn patterns** — Checkmate patterns, tactical motifs, strategic themes.\n\nConsistency beats intensity — 30 minutes daily is better than 5 hours on weekends!"),

    # General/catch-all
    (r'\b(help|teach|explain|what|how|why|when|should|can)\b',
     None)  # Handled by position analysis or fallback
]


def get_lessons() -> Dict:
    """Return the full lesson library for the Learn tab."""
    result = {}
    for cat_id, cat in LESSONS.items():
        result[cat_id] = {
            "title": cat["title"],
            "icon": cat["icon"],
            "items": [
                {"id": item["id"], "title": item["title"], "desc": item["desc"]}
                for item in cat["items"]
            ]
        }
    return result


def get_lesson_detail(lesson_id: str) -> Optional[Dict]:
    """Return the full content of a specific lesson."""
    for cat_id, cat in LESSONS.items():
        for item in cat["items"]:
            if item["id"] == lesson_id:
                return {
                    "id": item["id"],
                    "title": item["title"],
                    "content": item["content"],
                    "category": cat["title"]
                }
    return None


def analyze_position(fen: str) -> Dict:
    """Analyze a position and return structured coaching feedback."""
    try:
        board = chess.Board(fen)
    except ValueError:
        return {"error": "Invalid FEN"}

    tips = []
    
    # Material count
    piece_values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
                    chess.ROOK: 5, chess.QUEEN: 9}
    white_mat = sum(piece_values.get(p.piece_type, 0) 
                    for p in board.piece_map().values() if p.color == chess.WHITE)
    black_mat = sum(piece_values.get(p.piece_type, 0)
                    for p in board.piece_map().values() if p.color == chess.BLACK)
    diff = white_mat - black_mat
    
    turn = "White" if board.turn == chess.WHITE else "Black"
    
    if abs(diff) >= 1:
        advantage = "White" if diff > 0 else "Black"
        tips.append(f"**Material:** {advantage} is up +{abs(diff)} points. "
                    f"{'Simplify trades to convert' if advantage == turn else 'Look for tactical chances to recover'}.")
    else:
        tips.append("**Material:** Position is roughly equal.")

    # Check status
    if board.is_check():
        tips.append(f"⚠️ **{turn} is in check!** Must deal with the check immediately.")
    
    if board.is_checkmate():
        winner = "Black" if board.turn == chess.WHITE else "White"
        tips.append(f"♚ **Checkmate! {winner} wins!**")
        return {"tips": tips, "phase": "over"}
    
    if board.is_stalemate():
        tips.append("**Stalemate — it's a draw!**")
        return {"tips": tips, "phase": "over"}

    # Game phase detection
    total_pieces = len(board.piece_map())
    if total_pieces >= 28:
        phase = "opening"
    elif total_pieces >= 16:
        phase = "middlegame"
    else:
        phase = "endgame"

    # Phase-specific advice
    move_num = board.fullmove_number
    
    if phase == "opening":
        # Check development
        white_developed = 0
        black_developed = 0
        for sq, piece in board.piece_map().items():
            rank = chess.square_rank(sq)
            if piece.piece_type in (chess.KNIGHT, chess.BISHOP):
                if piece.color == chess.WHITE and rank > 0:
                    white_developed += 1
                elif piece.color == chess.BLACK and rank < 7:
                    black_developed += 1
        
        if board.turn == chess.WHITE and white_developed < 3:
            tips.append("**Opening:** Continue developing minor pieces (knights and bishops) toward the center.")
        elif board.turn == chess.BLACK and black_developed < 3:
            tips.append("**Opening:** Focus on developing your knights and bishops. Don't move the same piece twice.")
        
        # Castling check
        if move_num > 5:
            w_can_castle = board.has_kingside_castling_rights(chess.WHITE) or board.has_queenside_castling_rights(chess.WHITE)
            b_can_castle = board.has_kingside_castling_rights(chess.BLACK) or board.has_queenside_castling_rights(chess.BLACK)
            w_king_sq = board.king(chess.WHITE)
            b_king_sq = board.king(chess.BLACK)
            
            if board.turn == chess.WHITE and w_can_castle and w_king_sq == chess.E1:
                tips.append("🏰 **Castle soon!** Your king is still in the center. Castling protects the king and activates the rook.")
            elif board.turn == chess.BLACK and b_can_castle and b_king_sq == chess.E8:
                tips.append("🏰 **Castle soon!** Don't leave your king in the center too long.")

    elif phase == "middlegame":
        # Check for open files for rooks
        for f in range(8):
            has_w_pawn = any(board.piece_at(chess.square(f, r)) == chess.Piece(chess.PAWN, chess.WHITE) for r in range(8))
            has_b_pawn = any(board.piece_at(chess.square(f, r)) == chess.Piece(chess.PAWN, chess.BLACK) for r in range(8))
            if not has_w_pawn and not has_b_pawn:
                tips.append(f"**Open file:** The {chr(97+f)}-file is open. Consider placing a rook there for maximum activity!")
                break

        tips.append("**Middlegame**: Look for tactical opportunities — checks, captures, and threats. Improve your worst-placed piece.")

    else:  # endgame
        tips.append("**Endgame phase:** Activate your king! In the endgame, the king is a fighting piece. Push passed pawns.")
        
        # Count passed pawns
        for sq in board.pieces(chess.PAWN, chess.WHITE):
            file = chess.square_file(sq)
            rank = chess.square_rank(sq)
            is_passed = True
            for r in range(rank + 1, 8):
                for f in [file - 1, file, file + 1]:
                    if 0 <= f <= 7:
                        p = board.piece_at(chess.square(f, r))
                        if p and p.piece_type == chess.PAWN and p.color == chess.BLACK:
                            is_passed = False
            if is_passed and rank >= 4:
                tips.append(f"♟ White has a **passed pawn** on {chess.square_name(sq)}! Push it toward promotion.")
                break

    # Legal moves count
    legal_count = len(list(board.legal_moves))
    if legal_count <= 3:
        tips.append(f"⚠️ Only **{legal_count} legal moves** available. Be very careful here!")
    
    return {"tips": tips, "phase": phase, "move_number": move_num, 
            "material": {"white": white_mat, "black": black_mat}}


def answer_question(question: str, fen: Optional[str] = None) -> str:
    """
    Answer a chess question using pattern matching and position analysis.
    Returns a formatted string response.
    """
    q_lower = question.lower().strip()
    
    # Check for position analysis request
    if fen and any(kw in q_lower for kw in ['position', 'analyze', 'analysis', 'my game', 
                                              'my position', 'current', 'what should', 'best move',
                                              'suggestion', 'recommend']):
        analysis = analyze_position(fen)
        if "error" in analysis:
            return "I couldn't analyze that position. Make sure a game is active!"
        
        response = f"**Position Analysis** (Move {analysis.get('move_number', '?')}, {analysis.get('phase', 'unknown').title()}):\n\n"
        response += "\n\n".join(analysis["tips"])
        return response
    
    # Pattern matching against knowledge base
    for pattern, response in QA_PATTERNS:
        if re.search(pattern, q_lower):
            if response is not None:
                return response
            break  # Fall through to general analysis
    
    # If we have a FEN, provide position-based advice as a fallback
    if fen:
        analysis = analyze_position(fen)
        if "error" not in analysis:
            response = "I'll help with that in the context of your current game:\n\n"
            response += "\n\n".join(analysis["tips"])
            response += "\n\n*Try asking about specific topics like openings, tactics, endgames, or how to improve!*"
            return response
    
    # General fallback
    return ("Great question! Here's what I can help with:\n\n"
            "• **Openings** — Ask about specific openings like the Sicilian, Italian Game, or Queen's Gambit\n"
            "• **Tactics** — Forks, pins, skewers, discovered attacks, sacrifices\n"
            "• **Strategy** — Pawn structure, piece activity, king safety, center control\n"
            "• **Endgames** — King+pawn endings, rook endgames, checkmate techniques\n"
            "• **Position analysis** — Say \"analyze my position\" during a game\n"
            "• **Improvement** — Tips on how to get better at chess\n\n"
            "Try asking something specific!")
