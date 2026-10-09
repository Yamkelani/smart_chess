"""Decide whether a finished game may be learned from.

Uses only what the engine reports about the game (fetched with the
player's own session token), never the result or positions a client
claims, so training data cannot be forged.
"""

from collections import OrderedDict
from dataclasses import dataclass, field


def position_key(fen: str) -> str:
    """The parts of a FEN that make a position: placement, side to move,
    castling rights and en passant square, without the move counters."""
    return " ".join(fen.split()[:4])


@dataclass(frozen=True)
class Verdict:
    learn: bool
    reason: str = ""
    # Outcome as the engine reports it.
    result: str = ""
    winner: str | None = None
    # Positions the game really reached; anything else recorded is dropped.
    positions: frozenset[str] = field(default_factory=frozenset)
    # True when the game can never be learned, so its session can be dropped.
    permanent: bool = False


def judge(record: dict) -> Verdict:
    """Verdict on an engine game record (GET /game/{id}/record)."""
    if not record.get("is_terminal"):
        return Verdict(False, "game is not over")
    if record.get("is_analysis"):
        return Verdict(False, "game started from a custom position", permanent=True)
    if record.get("variant", "standard") != "standard":
        return Verdict(False, "variant games are not learned", permanent=True)
    return Verdict(
        True,
        result=record.get("status", ""),
        winner=record.get("winner"),
        positions=frozenset(position_key(f) for f in record.get("fen_history", [])),
    )


class LearnedGames:
    """Remembers the most recent learned game ids so no game is learned twice."""

    def __init__(self, capacity: int = 10_000):
        self._ids: OrderedDict[str, None] = OrderedDict()
        self._capacity = capacity

    def __contains__(self, game_id: str) -> bool:
        return game_id in self._ids

    def add(self, game_id: str) -> None:
        self._ids[game_id] = None
        self._ids.move_to_end(game_id)
        while len(self._ids) > self._capacity:
            self._ids.popitem(last=False)
