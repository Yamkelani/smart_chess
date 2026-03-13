"""
Training Pipeline for AlphaZero-style Chess AI

Trains the neural network on self-play data collected by the MCTS engine.
Supports iterative training: self-play → train → self-play → train → ...
"""

import os
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from typing import List, Optional

from app.config import (
    TRAINING_BATCH_SIZE, TRAINING_LEARNING_RATE, TRAINING_WEIGHT_DECAY,
    TRAINING_EPOCHS, TRAINING_GAMES_PER_ITERATION, TRAINING_BUFFER_SIZE,
    TRAINING_MIN_BUFFER, MCTS_SIMULATIONS, TRAINING_DATA_DIR, MODEL_DIR
)
from app.model import ChessNetManager
from app.self_play import SelfPlay, ReplayBuffer, TrainingExample


class ChessDataset(Dataset):
    """PyTorch Dataset wrapping a list of TrainingExamples."""

    def __init__(self, examples: List[TrainingExample]):
        self.examples = examples

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        ex = self.examples[idx]
        board_tensor = torch.from_numpy(ex.board_tensor).float()
        policy_target = torch.from_numpy(ex.policy_target).float()
        value_target = torch.tensor(ex.value_target, dtype=torch.float32)
        return board_tensor, policy_target, value_target


class Trainer:
    """Handles neural network training from self-play data."""

    def __init__(self, manager: ChessNetManager):
        self.manager = manager
        self.model = manager.get_model()
        self.device = manager.device

        self.optimizer = optim.Adam(
            self.model.parameters(),
            lr=TRAINING_LEARNING_RATE,
            weight_decay=TRAINING_WEIGHT_DECAY
        )

        # Learning rate scheduler: reduce on plateau
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode='min', factor=0.5, patience=3, verbose=True
        )

    def train_epoch(self, dataloader: DataLoader) -> dict:
        """
        Train for one epoch.

        Returns:
            dict with loss metrics
        """
        self.model.train()
        total_policy_loss = 0.0
        total_value_loss = 0.0
        total_loss = 0.0
        num_batches = 0

        for board_tensors, policy_targets, value_targets in dataloader:
            board_tensors = board_tensors.to(self.device)
            policy_targets = policy_targets.to(self.device)
            value_targets = value_targets.to(self.device).unsqueeze(1)

            # Forward pass
            policy_logits, value_pred = self.model(board_tensors)

            # Policy loss: cross-entropy with soft targets
            policy_log_probs = F.log_softmax(policy_logits, dim=1)
            policy_loss = -torch.sum(policy_targets * policy_log_probs, dim=1).mean()

            # Value loss: MSE
            value_loss = F.mse_loss(value_pred, value_targets)

            # Combined loss
            loss = policy_loss + value_loss

            # Backward pass
            self.optimizer.zero_grad()
            loss.backward()
            # Gradient clipping
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()

            total_policy_loss += policy_loss.item()
            total_value_loss += value_loss.item()
            total_loss += loss.item()
            num_batches += 1

        if num_batches == 0:
            return {'policy_loss': 0, 'value_loss': 0, 'total_loss': 0}

        return {
            'policy_loss': total_policy_loss / num_batches,
            'value_loss': total_value_loss / num_batches,
            'total_loss': total_loss / num_batches,
        }

    def train(self, replay_buffer: ReplayBuffer,
              epochs: int = TRAINING_EPOCHS,
              batch_size: int = TRAINING_BATCH_SIZE) -> List[dict]:
        """
        Train the model on data from the replay buffer.

        Returns:
            List of per-epoch loss metrics
        """
        if len(replay_buffer) < TRAINING_MIN_BUFFER:
            print(f"Not enough data to train. "
                  f"Have {len(replay_buffer)}, need {TRAINING_MIN_BUFFER}")
            return []

        examples = replay_buffer.buffer.copy()
        np.random.shuffle(examples)

        dataset = ChessDataset(examples)
        dataloader = DataLoader(
            dataset, batch_size=batch_size, shuffle=True,
            num_workers=0, pin_memory=True
        )

        print(f"\nTraining on {len(examples)} examples for {epochs} epochs...")
        epoch_metrics = []

        for epoch in range(epochs):
            metrics = self.train_epoch(dataloader)
            self.scheduler.step(metrics['total_loss'])

            print(f"  Epoch {epoch+1}/{epochs} — "
                  f"Policy: {metrics['policy_loss']:.4f}, "
                  f"Value: {metrics['value_loss']:.4f}, "
                  f"Total: {metrics['total_loss']:.4f}")
            epoch_metrics.append(metrics)

        return epoch_metrics


class TrainingPipeline:
    """
    Full AlphaZero training pipeline:
    1. Self-play with current model
    2. Train on accumulated data
    3. Save model
    4. Repeat
    """

    def __init__(self, device: Optional[str] = None):
        self.manager = ChessNetManager(device=device)
        self.trainer = Trainer(self.manager)
        self.replay_buffer = ReplayBuffer(max_size=TRAINING_BUFFER_SIZE)

        # Try to load existing replay buffer
        buffer_path = os.path.join(TRAINING_DATA_DIR, "replay_buffer.pkl")
        self.replay_buffer.load(buffer_path)

    def run_iteration(self, iteration: int,
                      num_games: int = TRAINING_GAMES_PER_ITERATION,
                      num_simulations: int = MCTS_SIMULATIONS):
        """Run a single training iteration: self-play + train."""
        print(f"\n{'='*60}")
        print(f"TRAINING ITERATION {iteration}")
        print(f"Model generation: {self.manager.generation}")
        print(f"Replay buffer: {len(self.replay_buffer)} examples")
        print(f"{'='*60}")

        # Phase 1: Self-play
        print(f"\n--- Phase 1: Self-Play ({num_games} games, "
              f"{num_simulations} sims/move) ---")
        self_play = SelfPlay(
            self.manager.get_model(),
            self.manager.device,
            num_simulations=num_simulations
        )
        records = self_play.generate_games(num_games)
        self.replay_buffer.add_games(records)

        # Phase 2: Training
        print(f"\n--- Phase 2: Training ---")
        metrics = self.trainer.train(self.replay_buffer)

        # Phase 3: Save
        if metrics:  # Only save if training happened
            self.manager.increment_generation()
            self.manager.save_model()

            # Save replay buffer
            os.makedirs(TRAINING_DATA_DIR, exist_ok=True)
            buffer_path = os.path.join(TRAINING_DATA_DIR, "replay_buffer.pkl")
            self.replay_buffer.save(buffer_path)

            # Save iteration stats
            self._save_stats(iteration, records, metrics)

        return metrics

    def run(self, num_iterations: int = 100,
            num_games: int = TRAINING_GAMES_PER_ITERATION,
            num_simulations: int = MCTS_SIMULATIONS):
        """Run the full training loop for multiple iterations."""
        print(f"Starting AlphaZero training pipeline")
        print(f"Iterations: {num_iterations}")
        print(f"Games per iteration: {num_games}")
        print(f"MCTS simulations: {num_simulations}")
        print(f"Device: {self.manager.device}")

        for i in range(1, num_iterations + 1):
            try:
                self.run_iteration(i, num_games, num_simulations)
            except KeyboardInterrupt:
                print(f"\nTraining interrupted at iteration {i}")
                self.manager.save_model()
                break
            except Exception as e:
                print(f"\nError in iteration {i}: {e}")
                import traceback
                traceback.print_exc()
                continue

        print(f"\nTraining complete. Final generation: {self.manager.generation}")

    def _save_stats(self, iteration: int, records, metrics):
        """Save training statistics to JSON."""
        import json

        stats = {
            'iteration': iteration,
            'generation': self.manager.generation,
            'num_games': len(records),
            'total_examples': sum(len(r.examples) for r in records),
            'buffer_size': len(self.replay_buffer),
            'results': {},
            'avg_game_length': np.mean([r.num_moves for r in records]),
            'avg_game_duration': np.mean([r.duration for r in records]),
            'final_metrics': metrics[-1] if metrics else {},
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        }
        for r in records:
            stats['results'][r.result] = stats['results'].get(r.result, 0) + 1

        stats_dir = os.path.join(TRAINING_DATA_DIR, "stats")
        os.makedirs(stats_dir, exist_ok=True)
        stats_path = os.path.join(stats_dir, f"iteration_{iteration:04d}.json")
        with open(stats_path, 'w') as f:
            json.dump(stats, f, indent=2)


def main():
    """Entry point for training from command line."""
    import argparse

    parser = argparse.ArgumentParser(description="Train 3D Chess AI")
    parser.add_argument('--iterations', type=int, default=100, help='Number of training iterations')
    parser.add_argument('--games', type=int, default=TRAINING_GAMES_PER_ITERATION, help='Self-play games per iteration')
    parser.add_argument('--simulations', type=int, default=50, help='MCTS simulations per move (lower = faster)')
    parser.add_argument('--device', type=str, default=None, help='Device: cuda or cpu')
    args = parser.parse_args()

    pipeline = TrainingPipeline(device=args.device)
    pipeline.run(
        num_iterations=args.iterations,
        num_games=args.games,
        num_simulations=args.simulations
    )


if __name__ == "__main__":
    main()
