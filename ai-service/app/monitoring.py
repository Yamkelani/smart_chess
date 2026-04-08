"""
AI Model Monitoring — Training Metrics, Drift Detection & Evaluation

Tracks model performance over time:
  - Loss history (policy + value) per training event
  - Win/loss/draw rates against human players
  - Model drift detection (comparing rolling windows)
  - Correctness evaluation against benchmark positions
  - ELO estimation from game outcomes
"""

import os
import json
import time
import math
import threading
import chess
import numpy as np
import torch
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Tuple
from collections import deque

from app.config import MODEL_DIR, TRAINING_DATA_DIR


# ---- Persistence helpers ----

MONITORING_DIR = os.path.join(TRAINING_DATA_DIR, "monitoring")


def _ensure_dir():
    os.makedirs(MONITORING_DIR, exist_ok=True)


def _load_json(filename: str, default=None):
    path = os.path.join(MONITORING_DIR, filename)
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return default if default is not None else {}


def _save_json(filename: str, data):
    _ensure_dir()
    path = os.path.join(MONITORING_DIR, filename)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


# ---- Data classes ----

@dataclass
class LossEntry:
    timestamp: float
    generation: int
    policy_loss: float
    value_loss: float
    total_loss: float
    source: str  # "online" | "offline"
    batch_size: int = 0
    epochs: int = 0


@dataclass
class GameOutcome:
    timestamp: float
    game_id: str
    result: str       # "win" | "loss" | "draw"
    player_color: str  # color of the human player
    num_moves: int
    generation: int


@dataclass
class EvalEntry:
    timestamp: float
    generation: int
    accuracy: float        # % of benchmark positions where top move matches
    avg_value_error: float # mean absolute error on value predictions
    positions_tested: int


@dataclass
class DriftReport:
    timestamp: float
    generation: int
    window_recent: int         # number of games in recent window
    window_baseline: int       # number of games in baseline window
    recent_win_rate: float
    baseline_win_rate: float
    drift_detected: bool
    drift_magnitude: float     # difference in win rates
    recent_avg_loss: float
    baseline_avg_loss: float
    loss_drift: float


# ---- Benchmark Positions ----
# A curated set of positions with known best moves for evaluation.
# Sourced from classic tactical puzzles.

BENCHMARK_POSITIONS: List[Dict] = [
    # Mate in 1
    {"fen": "6k1/5ppp/8/8/8/8/1Q6/K7 w - - 0 1", "best_move": "b2g7",
     "description": "Queen delivers mate on g7"},
    {"fen": "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
     "best_move": "h5f7", "description": "Scholar's mate Qxf7#"},
    # Winning material
    {"fen": "r1bqkb1r/pppppppp/2n2n2/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 2 3",
     "best_move": "d4d5", "description": "Fork the knight with d5"},
    {"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
     "best_move": "e7e5", "description": "Classical 1...e5 response"},
    # Pin / skewer
    {"fen": "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4",
     "best_move": "e2e3", "description": "Break the pin with e3"},
    # Endgame
    {"fen": "8/8/8/8/8/5K2/6P1/7k w - - 0 1", "best_move": "f3f2",
     "description": "Opposition — Kf2 secures promotion"},
    {"fen": "8/5pk1/8/8/8/8/1K4P1/8 w - - 0 1", "best_move": "b2c3",
     "description": "King march to support pawn"},
    # Tactical
    {"fen": "r2q1rk1/ppp2ppp/2np4/2b1p1B1/2B1P1b1/3P1N2/PPP2PPP/RN1QR1K1 w - - 0 1",
     "best_move": "g5d2", "description": "Retreat bishop, maintain tension"},
    {"fen": "rnbqkb1r/pp2pppp/5n2/2ppP3/3P4/2N5/PPP2PPP/R1BQKBNR w KQkq d6 0 5",
     "best_move": "e5f6", "description": "Capture en passant exf6"},
    {"fen": "r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
     "best_move": "d2d3", "description": "Italian Game — solid d3"},
]


class ModelMonitor:
    """
    Central monitoring hub for the AI model.

    Tracks training quality, game outcomes, detects model drift,
    and periodically evaluates the model against benchmark positions.
    """

    # Rolling window sizes
    RECENT_WINDOW = 20    # last N games for drift detection
    BASELINE_WINDOW = 50  # older N games for baseline comparison
    DRIFT_THRESHOLD = 0.15  # 15% win-rate change triggers drift alert

    def __init__(self):
        self._lock = threading.Lock()

        # In-memory stores (also persisted)
        self.loss_history: List[dict] = []
        self.game_outcomes: List[dict] = []
        self.eval_history: List[dict] = []
        self.drift_reports: List[dict] = []
        self.alerts: List[dict] = []

        # Aggregated counters
        self.total_games = 0
        self.total_wins = 0  # AI wins
        self.total_losses = 0
        self.total_draws = 0

        # ELO tracking (start at 1200)
        self.elo_rating = 1200.0
        self.elo_history: List[dict] = []

        self._load()
        print(f"[Monitor] initialized — {len(self.loss_history)} loss entries, "
              f"{len(self.game_outcomes)} game outcomes, ELO: {self.elo_rating:.0f}")

    # ---- Recording ----

    def record_training_loss(self, generation: int, policy_loss: float,
                              value_loss: float, source: str = "online",
                              batch_size: int = 0, epochs: int = 0):
        """Record a training loss data point."""
        entry = {
            "timestamp": time.time(),
            "generation": generation,
            "policy_loss": round(policy_loss, 6),
            "value_loss": round(value_loss, 6),
            "total_loss": round(policy_loss + value_loss, 6),
            "source": source,
            "batch_size": batch_size,
            "epochs": epochs,
        }
        with self._lock:
            self.loss_history.append(entry)
            # Check for loss spike
            self._check_loss_alert(entry)
        self._save_loss()

    def record_game_outcome(self, game_id: str, result: str,
                             player_color: str, num_moves: int,
                             generation: int):
        """
        Record a game outcome for win-rate tracking.

        Args:
            result: "Checkmate", "Stalemate", "Draw", "Resignation", etc.
            player_color: The human player's color
        """
        # Determine AI outcome
        ai_color = "black" if player_color == "white" else "white"
        result_lower = result.lower()

        if "checkmate" in result_lower or "resign" in result_lower:
            # Need to figure out who won — the result string from the engine
            # says "Checkmate" for the side that got mated (can't move).
            # If the engine returns Checkmate after an AI move, the human got mated → AI wins
            # We accept explicit winner from the learning endpoint, so we infer here:
            # Convention: the last player to move WON if Checkmate
            ai_outcome = "win"  # Will be corrected by record_game_with_winner
        elif "stalemate" in result_lower or "draw" in result_lower:
            ai_outcome = "draw"
        else:
            ai_outcome = "draw"  # Default to draw for unknown outcomes

        outcome = {
            "timestamp": time.time(),
            "game_id": game_id,
            "result": ai_outcome,
            "player_color": player_color,
            "num_moves": num_moves,
            "generation": generation,
        }

        with self._lock:
            self.game_outcomes.append(outcome)
            self._update_counters(ai_outcome)
            self._update_elo(ai_outcome)

        self._save_outcomes()

    def record_game_with_winner(self, game_id: str, result: str,
                                 winner: Optional[str], player_color: str,
                                 num_moves: int, generation: int):
        """Record game with explicit winner info for accurate tracking."""
        ai_color = "black" if player_color == "white" else "white"

        if winner is None or winner == "":
            ai_outcome = "draw"
        elif winner == ai_color:
            ai_outcome = "win"
        else:
            ai_outcome = "loss"

        outcome = {
            "timestamp": time.time(),
            "game_id": game_id,
            "result": ai_outcome,
            "original_result": result,
            "winner": winner,
            "player_color": player_color,
            "num_moves": num_moves,
            "generation": generation,
        }

        with self._lock:
            self.game_outcomes.append(outcome)
            self._update_counters(ai_outcome)
            self._update_elo(ai_outcome)

        self._save_outcomes()

    def _update_counters(self, ai_outcome: str):
        self.total_games += 1
        if ai_outcome == "win":
            self.total_wins += 1
        elif ai_outcome == "loss":
            self.total_losses += 1
        else:
            self.total_draws += 1

    def _update_elo(self, ai_outcome: str):
        """Simple ELO update assuming opponent is 1200."""
        opponent_elo = 1200.0
        k = 32.0
        expected = 1.0 / (1.0 + 10.0 ** ((opponent_elo - self.elo_rating) / 400.0))

        if ai_outcome == "win":
            actual = 1.0
        elif ai_outcome == "loss":
            actual = 0.0
        else:
            actual = 0.5

        self.elo_rating += k * (actual - expected)
        self.elo_history.append({
            "timestamp": time.time(),
            "elo": round(self.elo_rating, 1),
            "game_number": self.total_games,
        })

    # ---- Drift Detection ----

    def check_drift(self, generation: int) -> dict:
        """
        Compare recent performance against baseline to detect drift.

        Uses a sliding window approach:
        - Recent: last RECENT_WINDOW games
        - Baseline: the BASELINE_WINDOW games before that

        Returns a drift report.
        """
        with self._lock:
            outcomes = list(self.game_outcomes)
            losses = list(self.loss_history)

        total = len(outcomes)
        if total < self.RECENT_WINDOW + self.BASELINE_WINDOW:
            return {
                "status": "insufficient_data",
                "games_needed": self.RECENT_WINDOW + self.BASELINE_WINDOW,
                "games_available": total,
            }

        recent = outcomes[-self.RECENT_WINDOW:]
        baseline = outcomes[-(self.RECENT_WINDOW + self.BASELINE_WINDOW):-self.RECENT_WINDOW]

        recent_wr = self._win_rate(recent)
        baseline_wr = self._win_rate(baseline)

        # Loss drift
        recent_losses = losses[-self.RECENT_WINDOW:] if len(losses) >= self.RECENT_WINDOW else losses
        baseline_losses = (losses[-(self.RECENT_WINDOW + self.BASELINE_WINDOW):-self.RECENT_WINDOW]
                          if len(losses) >= self.RECENT_WINDOW + self.BASELINE_WINDOW
                          else losses[:len(losses)//2])

        recent_avg_loss = np.mean([l["total_loss"] for l in recent_losses]) if recent_losses else 0
        baseline_avg_loss = np.mean([l["total_loss"] for l in baseline_losses]) if baseline_losses else 0
        loss_drift = recent_avg_loss - baseline_avg_loss

        drift_magnitude = baseline_wr - recent_wr  # positive means degradation
        drift_detected = drift_magnitude > self.DRIFT_THRESHOLD

        report = {
            "timestamp": time.time(),
            "generation": generation,
            "window_recent": len(recent),
            "window_baseline": len(baseline),
            "recent_win_rate": round(recent_wr, 4),
            "baseline_win_rate": round(baseline_wr, 4),
            "drift_detected": drift_detected,
            "drift_magnitude": round(drift_magnitude, 4),
            "recent_avg_loss": round(float(recent_avg_loss), 6),
            "baseline_avg_loss": round(float(baseline_avg_loss), 6),
            "loss_drift": round(float(loss_drift), 6),
        }

        with self._lock:
            self.drift_reports.append(report)
            if drift_detected:
                self._add_alert("drift",
                    f"Model drift detected! Win rate dropped from "
                    f"{baseline_wr:.1%} to {recent_wr:.1%} "
                    f"(Δ = {drift_magnitude:.1%})",
                    generation)

        self._save_drift()
        return report

    def _win_rate(self, outcomes: List[dict]) -> float:
        if not outcomes:
            return 0.0
        wins = sum(1 for o in outcomes if o["result"] == "win")
        return wins / len(outcomes)

    # ---- Model Evaluation ----

    def evaluate_model(self, model, device, generation: int) -> dict:
        """
        Evaluate model against benchmark positions.

        Tests the model's policy head (does it find the best move?)
        and value head (reasonable position assessment).
        """
        from app.chess_env import board_to_tensor, index_to_move, MOVES_PER_SQUARE

        model.eval()
        correct = 0
        total = 0
        value_errors = []

        for pos in BENCHMARK_POSITIONS:
            try:
                board = chess.Board(pos["fen"])
                tensor = board_to_tensor(board)
                board_input = torch.from_numpy(tensor).float().unsqueeze(0).to(device)

                with torch.no_grad():
                    policy_logits, value_pred = model(board_input)

                # Check if top predicted move matches best move
                policy_probs = torch.softmax(policy_logits, dim=1).cpu().numpy()[0]

                # Get top move
                # Mask illegal moves
                legal_mask = np.zeros(len(policy_probs), dtype=bool)
                for move in board.legal_moves:
                    from app.chess_env import move_to_index
                    idx = move_to_index(move, board)
                    if 0 <= idx < len(legal_mask):
                        legal_mask[idx] = True

                masked_probs = policy_probs * legal_mask
                if masked_probs.sum() > 0:
                    top_idx = np.argmax(masked_probs)
                    top_move = index_to_move(top_idx, board)
                    if top_move and top_move.uci() == pos["best_move"]:
                        correct += 1

                total += 1

                # Value assessment — expected sign for known positions
                value = value_pred.item()
                # For most benchmark positions, the side to move should have
                # an advantage (positive value), but we don't have ground truth
                # values, so we track the raw output for trending.
                value_errors.append(abs(value))

            except Exception as e:
                print(f"[Monitor] eval error on {pos['fen'][:20]}...: {e}")
                continue

        accuracy = correct / max(total, 1)
        avg_value_err = float(np.mean(value_errors)) if value_errors else 0.0

        entry = {
            "timestamp": time.time(),
            "generation": generation,
            "accuracy": round(accuracy, 4),
            "avg_value_error": round(avg_value_err, 4),
            "positions_tested": total,
            "correct": correct,
        }

        with self._lock:
            self.eval_history.append(entry)
            # Alert if accuracy drops significantly
            if len(self.eval_history) >= 2:
                prev = self.eval_history[-2]["accuracy"]
                if accuracy < prev - 0.2:
                    self._add_alert("evaluation",
                        f"Benchmark accuracy dropped from {prev:.0%} to {accuracy:.0%}",
                        generation)

        self._save_evals()
        return entry

    # ---- Alerts ----

    def _check_loss_alert(self, entry: dict):
        """Check for sudden loss spikes."""
        if len(self.loss_history) < 5:
            return
        recent = self.loss_history[-5:]
        avg = np.mean([e["total_loss"] for e in recent[:-1]])
        if entry["total_loss"] > avg * 2.0 and avg > 0:
            self._add_alert("loss_spike",
                f"Loss spike detected: {entry['total_loss']:.4f} "
                f"(avg of last 4: {avg:.4f})",
                entry["generation"])

    def _add_alert(self, alert_type: str, message: str, generation: int):
        alert = {
            "timestamp": time.time(),
            "type": alert_type,
            "message": message,
            "generation": generation,
            "acknowledged": False,
        }
        self.alerts.append(alert)
        self._save_alerts()
        print(f"[Monitor] ⚠ ALERT ({alert_type}): {message}")

    def acknowledge_alert(self, index: int):
        """Mark an alert as acknowledged."""
        with self._lock:
            if 0 <= index < len(self.alerts):
                self.alerts[index]["acknowledged"] = True
        self._save_alerts()

    # ---- Dashboard ----

    def get_dashboard(self, generation: int) -> dict:
        """
        Return a comprehensive monitoring dashboard.

        This is the main endpoint consumed by the frontend.
        """
        with self._lock:
            outcomes = list(self.game_outcomes)
            losses = list(self.loss_history)
            evals = list(self.eval_history)
            alerts = [a for a in self.alerts if not a["acknowledged"]]

        # Win rate (overall and recent)
        overall_wr = self._win_rate(outcomes)
        recent_wr = self._win_rate(outcomes[-self.RECENT_WINDOW:]) if len(outcomes) >= self.RECENT_WINDOW else overall_wr

        # Loss trends (last 50 entries)
        loss_trend = losses[-50:] if losses else []

        # Game outcome distribution
        result_dist = {"win": 0, "loss": 0, "draw": 0}
        for o in outcomes:
            r = o.get("result", "draw")
            if r in result_dist:
                result_dist[r] += 1

        # Average game length
        avg_moves = np.mean([o["num_moves"] for o in outcomes]) if outcomes else 0

        # ELO
        elo_trend = self.elo_history[-50:] if self.elo_history else []

        # Latest evaluation
        latest_eval = evals[-1] if evals else None

        # Games per generation
        gen_games: Dict[int, int] = {}
        for o in outcomes:
            g = o.get("generation", 0)
            gen_games[g] = gen_games.get(g, 0) + 1

        return {
            "summary": {
                "total_games": self.total_games,
                "ai_wins": self.total_wins,
                "ai_losses": self.total_losses,
                "draws": self.total_draws,
                "overall_win_rate": round(overall_wr, 4),
                "recent_win_rate": round(recent_wr, 4),
                "elo_rating": round(self.elo_rating, 1),
                "model_generation": generation,
                "avg_game_length": round(float(avg_moves), 1),
            },
            "loss_trend": loss_trend,
            "elo_trend": elo_trend,
            "result_distribution": result_dist,
            "games_per_generation": gen_games,
            "latest_evaluation": latest_eval,
            "active_alerts": alerts,
            "eval_history": evals[-10:],
        }

    def get_loss_history(self, limit: int = 100) -> List[dict]:
        """Return recent loss history."""
        with self._lock:
            return list(self.loss_history[-limit:])

    def get_win_rate_trend(self, window: int = 10) -> List[dict]:
        """
        Compute a rolling win-rate over time.

        Returns list of {game_number, win_rate, timestamp} dicts.
        """
        with self._lock:
            outcomes = list(self.game_outcomes)

        if len(outcomes) < window:
            return []

        trend = []
        for i in range(window, len(outcomes) + 1):
            chunk = outcomes[i - window:i]
            wr = self._win_rate(chunk)
            trend.append({
                "game_number": i,
                "win_rate": round(wr, 4),
                "timestamp": chunk[-1]["timestamp"],
            })
        return trend

    # ---- Persistence ----

    def _save_loss(self):
        _save_json("loss_history.json", self.loss_history[-500:])

    def _save_outcomes(self):
        data = {
            "outcomes": self.game_outcomes[-500:],
            "totals": {
                "games": self.total_games,
                "wins": self.total_wins,
                "losses": self.total_losses,
                "draws": self.total_draws,
            },
            "elo": self.elo_rating,
            "elo_history": self.elo_history[-500:],
        }
        _save_json("game_outcomes.json", data)

    def _save_evals(self):
        _save_json("eval_history.json", self.eval_history[-100:])

    def _save_drift(self):
        _save_json("drift_reports.json", self.drift_reports[-50:])

    def _save_alerts(self):
        _save_json("alerts.json", self.alerts[-100:])

    def _load(self):
        """Load persisted monitoring data."""
        _ensure_dir()

        # Loss history
        self.loss_history = _load_json("loss_history.json", [])

        # Game outcomes
        outcome_data = _load_json("game_outcomes.json", {})
        if isinstance(outcome_data, dict):
            self.game_outcomes = outcome_data.get("outcomes", [])
            totals = outcome_data.get("totals", {})
            self.total_games = totals.get("games", 0)
            self.total_wins = totals.get("wins", 0)
            self.total_losses = totals.get("losses", 0)
            self.total_draws = totals.get("draws", 0)
            self.elo_rating = outcome_data.get("elo", 1200.0)
            self.elo_history = outcome_data.get("elo_history", [])
        elif isinstance(outcome_data, list):
            self.game_outcomes = outcome_data

        # Eval history
        self.eval_history = _load_json("eval_history.json", [])

        # Drift reports
        self.drift_reports = _load_json("drift_reports.json", [])

        # Alerts
        self.alerts = _load_json("alerts.json", [])
