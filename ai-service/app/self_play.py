"""
Self-Play Engine for AlphaZero-style Training

Generates training data by playing games against itself using MCTS
guided by the current neural network. The resulting game data
(positions, policy targets, value targets) feeds the training loop.
"""

import chess
import numpy as np
import time
import os
import json
import pickle
from typing import List, Tuple, Dict
from dataclasses import dataclass, field

from app.config import (
    TRAINING_GAMES_PER_ITERATION, MCTS_SIMULATIONS,
    MCTS_TEMPERATURE, TRAINING_DATA_DIR
)
from app.chess_env import board_to_tensor, move_to_index, MOVES_PER_SQUARE
from app.mcts import MCTS


@dataclass
class TrainingExample:
    """A single training example from self-play."""
    board_tensor: np.ndarray   # (18, 8, 8) board state
    policy_target: np.ndarray  # (4672,) move probability distribution
    value_target: float        # game outcome from this player's perspective


@dataclass
class GameRecord:
    """Complete record of a self-play game."""
    examples: List[TrainingExample] = field(default_factory=list)
    result: str = "*"
    num_moves: int = 0
    duration: float = 0.0


class SelfPlay:
    """Manages self-play game generation."""

    def __init__(self, model, device, num_simulations: int = MCTS_SIMULATIONS):
        self.model = model
        self.device = device
        self.num_simulations = num_simulations

    def play_game(self, max_moves: int = 512) -> GameRecord:
        """
        Play a single self-play game.

        Returns:
            GameRecord with training examples and outcome.
        """
        start_time = time.time()
        board = chess.Board()
        mcts = MCTS(
            self.model, self.device,
            num_simulations=self.num_simulations,
            add_noise=True  # Exploration noise for self-play
        )

        move_history: List[Tuple[np.ndarray, np.ndarray, int]] = []
        # store: (board_tensor, policy_target, current_player)
        # where current_player: 1 = white, -1 = black

        move_number = 0
        while not board.is_game_over() and move_number < max_moves:
            # Get board tensor BEFORE the move
            tensor = board_to_tensor(board)

            # Use MCTS to get move and policy
            temperature = MCTS_TEMPERATURE if move_number < 30 else 0.1
            move, action_probs = mcts.select_move(
                board, temperature=temperature, move_number=move_number
            )

            # Build policy target vector
            policy_target = np.zeros(64 * MOVES_PER_SQUARE, dtype=np.float32)
            for m, prob in action_probs:
                idx = move_to_index(m, board)
                if 0 <= idx < len(policy_target):
                    policy_target[idx] = prob

            current_player = 1 if board.turn == chess.WHITE else -1
            move_history.append((tensor, policy_target, current_player))

            board.push(move)
            move_number += 1

        # Determine game result
        result_str = board.result() if board.is_game_over() else "1/2-1/2"

        if result_str == "1-0":
            white_value = 1.0
        elif result_str == "0-1":
            white_value = -1.0
        else:
            white_value = 0.0

        # Build training examples with correct value targets
        record = GameRecord(
            result=result_str,
            num_moves=move_number,
            duration=time.time() - start_time
        )

        for tensor, policy_target, current_player in move_history:
            # Value from this player's perspective
            value_target = white_value * current_player
            record.examples.append(TrainingExample(
                board_tensor=tensor,
                policy_target=policy_target,
                value_target=value_target
            ))

        return record

    def generate_games(self, num_games: int = TRAINING_GAMES_PER_ITERATION,
                       callback=None) -> List[GameRecord]:
        """
        Generate multiple self-play games.

        Args:
            num_games: number of games to play
            callback: optional function called after each game with (game_num, record)

        Returns:
            List of GameRecords
        """
        records = []
        for i in range(num_games):
            record = self.play_game()
            records.append(record)

            if callback:
                callback(i + 1, record)
            else:
                print(f"  Game {i+1}/{num_games}: "
                      f"{record.result} in {record.num_moves} moves "
                      f"({record.duration:.1f}s, {len(record.examples)} examples)")

        total_examples = sum(len(r.examples) for r in records)
        results = {}
        for r in records:
            results[r.result] = results.get(r.result, 0) + 1

        print(f"\nSelf-play complete: {num_games} games, "
              f"{total_examples} training examples")
        print(f"Results: {results}")

        return records


class ReplayBuffer:
    """
    Stores training examples from self-play with a fixed capacity.
    Older examples are discarded when the buffer is full.
    """

    def __init__(self, max_size: int = 50000):
        self.max_size = max_size
        self.buffer: List[TrainingExample] = []

    def add_game(self, record: GameRecord):
        """Add all training examples from a game."""
        self.buffer.extend(record.examples)
        # Trim to max size, keeping most recent
        if len(self.buffer) > self.max_size:
            self.buffer = self.buffer[-self.max_size:]

    def add_games(self, records: List[GameRecord]):
        """Add training examples from multiple games."""
        for record in records:
            self.add_game(record)

    def sample(self, batch_size: int) -> List[TrainingExample]:
        """Sample a random batch of training examples."""
        indices = np.random.choice(len(self.buffer), size=min(batch_size, len(self.buffer)), replace=False)
        return [self.buffer[i] for i in indices]

    def __len__(self):
        return len(self.buffer)

    def save(self, path: str):
        """Save buffer to disk."""
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
        with open(path, 'wb') as f:
            pickle.dump({
                'buffer': self.buffer,
                'max_size': self.max_size
            }, f)
        print(f"Saved replay buffer ({len(self.buffer)} examples) to {path}")

    def load(self, path: str) -> bool:
        """Load buffer from disk."""
        if os.path.exists(path):
            try:
                with open(path, 'rb') as f:
                    data = pickle.load(f)
                self.buffer = data['buffer']
                self.max_size = data.get('max_size', self.max_size)
                print(f"Loaded replay buffer ({len(self.buffer)} examples) from {path}")
                return True
            except Exception as e:
                print(f"Failed to load replay buffer: {e}")
                return False
        return False
