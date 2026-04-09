"""
Online Learning System for 3D Chess AI

Implements lightweight online learning that genuinely trains the neural network
from real gameplay. When games are played against the AI:

1. Every position + MCTS policy output is recorded during play
2. When a game finishes, the outcome (win/loss/draw) is used to label
   all positions with value targets
3. Position data is added to a persistent replay buffer
4. A quick training batch runs (~1-3 seconds) to update the model weights
5. The model improves over time from real games

This means the AI genuinely learns from every game played against it.
"""

import asyncio
import chess
import numpy as np
import os
import time
import threading
import torch
import torch.nn.functional as F
import torch.optim as optim
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from app.config import (
    TRAINING_LEARNING_RATE, TRAINING_WEIGHT_DECAY,
    TRAINING_DATA_DIR, MODEL_DIR, NN_POLICY_OUTPUT,
    ONLINE_LEARNING_BATCH_SIZE, ONLINE_LEARNING_MIN_POSITIONS,
    ONLINE_LEARNING_EPOCHS, ONLINE_BUFFER_SIZE,
)
from app.chess_env import board_to_tensor, move_to_index, MOVES_PER_SQUARE
from app.self_play import TrainingExample, ReplayBuffer
from app.model import ChessNetManager
from app.monitoring import ModelMonitor


@dataclass
class PositionRecord:
    """A recorded position from a live game."""
    board_tensor: np.ndarray      # (18, 8, 8)
    policy_target: np.ndarray     # (4672,) from MCTS output
    side_to_move: int             # 1 = white, -1 = black
    fen: str                      # for debugging


@dataclass
class GameSession:
    """Tracks positions from an active game for learning."""
    game_id: str
    player_color: str              # "white" or "black"
    positions: List[PositionRecord] = field(default_factory=list)
    start_time: float = 0.0
    is_complete: bool = False


class OnlineLearner:
    """
    Manages online learning from real gameplay.

    Records game positions during play and triggers quick training
    batches when games complete. Maintains a persistent replay buffer
    that grows over time, giving the AI genuine learning capability.
    """

    def __init__(self, manager: ChessNetManager, monitor: Optional[ModelMonitor] = None):
        self.manager = manager
        self.model = manager.get_model()
        self.device = manager.device
        self.monitor = monitor

        # Active game sessions
        self.sessions: Dict[str, GameSession] = {}

        # Persistent replay buffer for online learning
        self.replay_buffer = ReplayBuffer(max_size=ONLINE_BUFFER_SIZE)
        self._load_buffer()

        # Training optimizer (separate from offline trainer)
        self.optimizer = optim.Adam(
            self.model.parameters(),
            lr=TRAINING_LEARNING_RATE * 0.5,  # Slower LR for online learning
            weight_decay=TRAINING_WEIGHT_DECAY,
        )

        # Stats
        self.games_learned = 0
        self.total_positions_learned = 0
        self.last_loss = None
        self.training_in_progress = False

        # Lock for thread safety
        self._lock = threading.Lock()

        print(f"[OnlineLearner] initialized — buffer: {len(self.replay_buffer)} positions, "
              f"device: {self.device}")

    # ---- Session management ----

    def start_session(self, game_id: str, player_color: str = "white"):
        """Register a new game for online learning."""
        with self._lock:
            self.sessions[game_id] = GameSession(
                game_id=game_id,
                player_color=player_color,
                start_time=time.time(),
            )
        print(f"[OnlineLearner] tracking game {game_id[:8]}...")

    def record_position(self, game_id: str, fen: str,
                        mcts_policy: Optional[List[Tuple]] = None):
        """
        Record a position from an ongoing game.

        Args:
            game_id: The game identifier
            fen: FEN string of the position
            mcts_policy: List of (move, probability) from MCTS output
        """
        with self._lock:
            session = self.sessions.get(game_id)
            if session is None:
                return

        board = chess.Board(fen)
        tensor = board_to_tensor(board)
        side = 1 if board.turn == chess.WHITE else -1

        # Build policy target from MCTS output
        policy_target = np.zeros(64 * MOVES_PER_SQUARE, dtype=np.float32)
        if mcts_policy:
            for move, prob in mcts_policy:
                if isinstance(move, str):
                    move = chess.Move.from_uci(move)
                idx = move_to_index(move, board)
                if 0 <= idx < len(policy_target):
                    policy_target[idx] = prob
            # Normalize
            total = policy_target.sum()
            if total > 0:
                policy_target /= total
        else:
            # No MCTS data — create uniform over legal moves
            for move in board.legal_moves:
                idx = move_to_index(move, board)
                if 0 <= idx < len(policy_target):
                    policy_target[idx] = 1.0
            total = policy_target.sum()
            if total > 0:
                policy_target /= total

        record = PositionRecord(
            board_tensor=tensor,
            policy_target=policy_target,
            side_to_move=side,
            fen=fen,
        )

        with self._lock:
            session = self.sessions.get(game_id)
            if session:
                session.positions.append(record)

    def complete_game(self, game_id: str, result: str) -> dict:
        """
        Signal that a game has ended. Converts recorded positions to
        training examples with proper value targets, adds to replay
        buffer, and triggers a quick training batch.

        Args:
            game_id: The game identifier
            result: Game result — "Checkmate", "Stalemate", "Draw", etc.

        Returns:
            dict with learning stats
        """
        with self._lock:
            session = self.sessions.pop(game_id, None)

        if session is None or len(session.positions) == 0:
            return {"learned": False, "reason": "no positions recorded"}

        session.is_complete = True

        # Determine game value from white's perspective
        white_value = self._result_to_value(result, session.player_color)

        # Convert positions to training examples
        examples = []
        for pos in session.positions:
            value_target = white_value * pos.side_to_move
            examples.append(TrainingExample(
                board_tensor=pos.board_tensor,
                policy_target=pos.policy_target,
                value_target=value_target,
            ))

        # Add to replay buffer
        from app.self_play import GameRecord
        record = GameRecord(
            examples=examples,
            result=result,
            num_moves=len(session.positions),
            duration=time.time() - session.start_time,
        )
        self.replay_buffer.add_game(record)
        self._save_buffer()

        num_positions = len(examples)
        print(f"[OnlineLearner] game {game_id[:8]} complete: {result}, "
              f"{num_positions} positions added to buffer "
              f"(total: {len(self.replay_buffer)})")

        # Train if we have enough data
        loss_info = self._quick_train()

        self.games_learned += 1
        self.total_positions_learned += num_positions

        # Record game outcome in monitoring
        if self.monitor:
            self.monitor.record_game_outcome(
                game_id=game_id,
                result=result,
                player_color=session.player_color,
                num_moves=num_positions,
                generation=self.manager.generation,
            )

        return {
            "learned": True,
            "positions_added": num_positions,
            "buffer_size": len(self.replay_buffer),
            "games_learned_total": self.games_learned,
            "training": loss_info,
        }

    # ---- Training ----

    def _quick_train(self) -> dict:
        """
        Run a quick training batch on the replay buffer.

        This is intentionally lightweight — just a few epochs on a small
        batch to nudge the model in the right direction without causing
        a noticeable delay during gameplay.
        """
        if len(self.replay_buffer) < ONLINE_LEARNING_MIN_POSITIONS:
            return {
                "trained": False,
                "reason": f"need {ONLINE_LEARNING_MIN_POSITIONS} positions, "
                          f"have {len(self.replay_buffer)}",
            }

        self.training_in_progress = True
        start = time.time()

        try:
            self.model.train()

            # Sample a batch from the replay buffer
            batch_size = min(ONLINE_LEARNING_BATCH_SIZE, len(self.replay_buffer))
            examples = self.replay_buffer.sample(batch_size)

            total_policy_loss = 0.0
            total_value_loss = 0.0
            num_batches = 0

            for epoch in range(ONLINE_LEARNING_EPOCHS):
                # Build tensors
                boards = torch.stack([
                    torch.from_numpy(ex.board_tensor).float()
                    for ex in examples
                ]).to(self.device)

                policies = torch.stack([
                    torch.from_numpy(ex.policy_target).float()
                    for ex in examples
                ]).to(self.device)

                values = torch.tensor(
                    [ex.value_target for ex in examples],
                    dtype=torch.float32,
                ).unsqueeze(1).to(self.device)

                # Forward
                policy_logits, value_pred = self.model(boards)

                # Policy: cross-entropy with soft targets
                policy_log_probs = F.log_softmax(policy_logits, dim=1)
                policy_loss = -torch.sum(policies * policy_log_probs, dim=1).mean()

                # Value: MSE
                value_loss = F.mse_loss(value_pred, values)

                loss = policy_loss + value_loss

                # Backward
                self.optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                self.optimizer.step()

                total_policy_loss += policy_loss.item()
                total_value_loss += value_loss.item()
                num_batches += 1

            # Only persist the model if loss improved (quality gate)
            self.model.eval()
            avg_policy = total_policy_loss / max(num_batches, 1)
            avg_value = total_value_loss / max(num_batches, 1)
            new_total_loss = avg_policy + avg_value
            prev_total_loss = (
                (self.last_loss["policy"] + self.last_loss["value"])
                if self.last_loss else float("inf")
            )
            if new_total_loss < prev_total_loss:
                self.manager.save_model()
                save_msg = "saved"
            else:
                save_msg = "skipped (loss did not improve)"

            elapsed = time.time() - start
            self.last_loss = {"policy": avg_policy, "value": avg_value}

            # Record to monitoring system
            if self.monitor:
                self.monitor.record_training_loss(
                    generation=self.manager.generation,
                    policy_loss=avg_policy,
                    value_loss=avg_value,
                    source="online",
                    batch_size=batch_size,
                    epochs=ONLINE_LEARNING_EPOCHS,
                )

            import logging as _log
            _logger = _log.getLogger("ai-service")
            _logger.info(
                "[OnlineLearner] quick train: %d epochs, batch=%d, "
                "policy_loss=%.4f, value_loss=%.4f, model=%s, time=%.2fs",
                ONLINE_LEARNING_EPOCHS, batch_size, avg_policy, avg_value,
                save_msg, elapsed,
            )

            return {
                "trained": True,
                "epochs": ONLINE_LEARNING_EPOCHS,
                "batch_size": batch_size,
                "policy_loss": round(avg_policy, 4),
                "value_loss": round(avg_value, 4),
                "model_save": save_msg,
                "duration_ms": round(elapsed * 1000),
            }

        except Exception as e:
            import logging as _log
            _log.getLogger("ai-service").error("[OnlineLearner] training error: %s", e)
            return {"trained": False, "error": str(e)}
        finally:
            self.training_in_progress = False
            self.model.eval()

    # ---- Helpers ----

    @staticmethod
    def _extract_winner(result: str) -> Optional[str]:
        """Extract winner color from engine status like 'Checkmate(white)'."""
        import re
        m = re.search(r'\(\s*(white|black)\s*\)', result, re.IGNORECASE)
        return m.group(1).lower() if m else None

    def _result_to_value(self, result: str, player_color: str) -> float:
        """
        Convert a game result string to a value from white's perspective.
        +1.0 = white won, -1.0 = black won, 0.0 = draw.
        """
        result_lower = result.lower()

        if "checkmate" in result_lower or "resign" in result_lower:
            winner = self._extract_winner(result)
            if winner == "white":
                return 1.0
            elif winner == "black":
                return -1.0
            # Could not determine winner — fall through to 0.0

        if "stalemate" in result_lower or "draw" in result_lower:
            return 0.0

        # Try standard notation
        if result == "1-0":
            return 1.0
        elif result == "0-1":
            return -1.0

        return 0.0

    def complete_game_with_winner(self, game_id: str, result: str,
                                  winner: Optional[str]) -> dict:
        """
        Complete a game with explicit winner information.

        Args:
            game_id: Game ID
            result: Status string (e.g., "Checkmate")
            winner: "white", "black", or None for draw
        """
        with self._lock:
            session = self.sessions.pop(game_id, None)

        if session is None or len(session.positions) == 0:
            return {"learned": False, "reason": "no positions recorded"}

        # Determine white_value from explicit winner
        if winner == "white":
            white_value = 1.0
        elif winner == "black":
            white_value = -1.0
        else:
            white_value = 0.0

        examples = []
        for pos in session.positions:
            value_target = white_value * pos.side_to_move
            examples.append(TrainingExample(
                board_tensor=pos.board_tensor,
                policy_target=pos.policy_target,
                value_target=value_target,
            ))

        from app.self_play import GameRecord
        record = GameRecord(
            examples=examples,
            result=result,
            num_moves=len(session.positions),
            duration=time.time() - session.start_time,
        )
        self.replay_buffer.add_game(record)
        self._save_buffer()

        num_positions = len(examples)
        print(f"[OnlineLearner] game complete: {result} (winner={winner}), "
              f"{num_positions} positions → buffer ({len(self.replay_buffer)} total)")

        loss_info = self._quick_train()
        self.games_learned += 1
        self.total_positions_learned += num_positions

        # Record game outcome in monitoring
        if self.monitor:
            self.monitor.record_game_with_winner(
                game_id=game_id,
                result=result,
                winner=winner,
                player_color=session.player_color,
                num_moves=num_positions,
                generation=self.manager.generation,
            )
            # Periodically check for drift (every 10 games)
            if self.games_learned % 10 == 0:
                self.monitor.check_drift(self.manager.generation)
            # Periodically evaluate model (every 25 games)
            if self.games_learned % 25 == 0:
                self.monitor.evaluate_model(
                    self.model, self.device, self.manager.generation)

        return {
            "learned": True,
            "positions_added": num_positions,
            "buffer_size": len(self.replay_buffer),
            "games_learned_total": self.games_learned,
            "training": loss_info,
        }

    def get_status(self) -> dict:
        """Return online learning statistics."""
        return {
            "active_sessions": len(self.sessions),
            "replay_buffer_size": len(self.replay_buffer),
            "games_learned": self.games_learned,
            "total_positions_learned": self.total_positions_learned,
            "last_loss": self.last_loss,
            "training_in_progress": self.training_in_progress,
            "model_generation": self.manager.generation,
        }

    def _buffer_path(self) -> str:
        return os.path.join(TRAINING_DATA_DIR, "online_replay_buffer.pkl")

    def _save_buffer(self):
        """Persist replay buffer to disk."""
        try:
            os.makedirs(TRAINING_DATA_DIR, exist_ok=True)
            self.replay_buffer.save(self._buffer_path())
        except Exception as e:
            print(f"[OnlineLearner] failed to save buffer: {e}")

    def _load_buffer(self):
        """Load replay buffer from disk if available."""
        path = self._buffer_path()
        if os.path.exists(path):
            self.replay_buffer.load(path)
            print(f"[OnlineLearner] loaded {len(self.replay_buffer)} positions from disk")
