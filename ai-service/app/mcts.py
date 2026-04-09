"""
Monte Carlo Tree Search (MCTS) for AlphaZero-style Chess AI

Implements PUCT (Predictor + Upper Confidence bounds applied to Trees)
with neural network guidance for move selection.
"""

import math
import numpy as np
import chess
import torch
from typing import Optional, Dict, Tuple, List

from app.config import (
    MCTS_SIMULATIONS, MCTS_C_PUCT, MCTS_TEMPERATURE,
    MCTS_TEMP_THRESHOLD, MCTS_DIRICHLET_ALPHA, MCTS_DIRICHLET_EPSILON
)
from app.chess_env import (
    board_to_tensor, move_to_index, index_to_move,
    get_legal_move_mask, MOVES_PER_SQUARE
)


class MCTSNode:
    """A node in the MCTS search tree."""

    __slots__ = [
        'parent', 'move', 'prior', 'children',
        'visit_count', 'value_sum', 'is_expanded'
    ]

    def __init__(self, parent: Optional['MCTSNode'] = None,
                 move: Optional[chess.Move] = None,
                 prior: float = 0.0):
        self.parent = parent
        self.move = move
        self.prior = prior
        self.children: Dict[chess.Move, 'MCTSNode'] = {}
        self.visit_count = 0
        self.value_sum = 0.0
        self.is_expanded = False

    @property
    def q_value(self) -> float:
        """Mean action value Q(s, a)."""
        if self.visit_count == 0:
            return 0.0
        return self.value_sum / self.visit_count

    @property
    def u_value(self) -> float:
        """Upper confidence bound U(s, a) = C_PUCT * P(s,a) * sqrt(N_parent) / (1 + N)."""
        parent_visits = self.parent.visit_count if self.parent else 0
        return MCTS_C_PUCT * self.prior * math.sqrt(max(1, parent_visits)) / (1 + self.visit_count)

    @property
    def ucb_score(self) -> float:
        """Combined score for node selection: Q + U."""
        return self.q_value + self.u_value

    def select_child(self) -> 'MCTSNode':
        """Select the child with the highest UCB score."""
        return max(self.children.values(), key=lambda c: c.ucb_score)

    def expand(self, board: chess.Board, policy: np.ndarray):
        """
        Expand this node by creating children for all legal moves.

        Args:
            board: Board state at this node
            policy: Raw policy vector from the neural network (4672,)
        """
        legal_mask = get_legal_move_mask(board)
        masked_policy = policy * legal_mask

        # Normalize to get proper probabilities
        policy_sum = masked_policy.sum()
        if policy_sum > 0:
            masked_policy /= policy_sum
        else:
            # Fallback to uniform over legal moves
            masked_policy = legal_mask.astype(np.float32)
            policy_sum = masked_policy.sum()
            if policy_sum > 0:
                masked_policy /= policy_sum

        for move in board.legal_moves:
            idx = move_to_index(move, board)
            prior = masked_policy[idx] if 0 <= idx < len(masked_policy) else 0.0
            self.children[move] = MCTSNode(parent=self, move=move, prior=float(prior))

        self.is_expanded = True

    def backpropagate(self, value: float):
        """
        Backpropagate the evaluation value up the tree.
        Value is negated at each level since players alternate.
        """
        node = self
        while node is not None:
            node.visit_count += 1
            node.value_sum += value
            value = -value  # Flip perspective
            node = node.parent


class MCTS:
    """
    Monte Carlo Tree Search with neural network guidance.

    Uses the PUCT algorithm from AlphaZero:
    - Selection: traverse tree using UCB scores
    - Expansion: create child nodes with NN policy priors
    - Evaluation: use NN value head
    - Backpropagation: update statistics up the tree
    """

    def __init__(self, model, device: torch.device,
                 num_simulations: int = MCTS_SIMULATIONS,
                 add_noise: bool = False):
        """
        Args:
            model: ChessNet neural network
            device: torch device for inference
            num_simulations: number of MCTS simulations per move
            add_noise: whether to add Dirichlet noise at root (for self-play)
        """
        self.model = model
        self.device = device
        self.num_simulations = num_simulations
        self.add_noise = add_noise

    def _evaluate(self, board: chess.Board) -> Tuple[np.ndarray, float]:
        """
        Evaluate a position using the neural network.

        Returns:
            policy: (4672,) probability distribution over moves
            value: scalar evaluation from current player's perspective
        """
        tensor = board_to_tensor(board)
        tensor_t = torch.from_numpy(tensor).unsqueeze(0).to(self.device)

        self.model.eval()
        with torch.no_grad():
            policy_logits, value = self.model(tensor_t)
            policy = torch.softmax(policy_logits, dim=1).squeeze(0).cpu().numpy()
            value = value.item()

        return policy, value

    def search(self, board: chess.Board) -> MCTSNode:
        """
        Run MCTS from the given board position.

        Returns:
            root: The root MCTSNode with visit counts for each child
        """
        root = MCTSNode()

        # Initial expansion of root
        policy, value = self._evaluate(board)

        # Add Dirichlet noise to root for exploration during self-play
        if self.add_noise:
            legal_mask = get_legal_move_mask(board)
            num_legal = int(legal_mask.sum())
            if num_legal > 0:
                noise = np.random.dirichlet([MCTS_DIRICHLET_ALPHA] * num_legal)
                noise_full = np.zeros_like(policy)
                legal_indices = np.where(legal_mask)[0]
                noise_full[legal_indices] = noise
                policy = (1 - MCTS_DIRICHLET_EPSILON) * policy + MCTS_DIRICHLET_EPSILON * noise_full

        root.expand(board, policy)
        # Root starts at 0 visits; UCB uses max(1, parent) to ensure exploration

        for _ in range(self.num_simulations):
            node = root
            sim_board = board.copy()

            # Selection: traverse to a leaf
            while node.is_expanded and node.children:
                node = node.select_child()
                sim_board.push(node.move)

            # Check terminal state
            if sim_board.is_game_over():
                result = sim_board.result()
                if result == "1/2-1/2":
                    value = 0.0
                elif (result == "1-0" and sim_board.turn == chess.BLACK) or \
                     (result == "0-1" and sim_board.turn == chess.WHITE):
                    # The side that just moved won
                    value = -1.0
                else:
                    value = 1.0
            else:
                # Expansion and evaluation
                policy, value = self._evaluate(sim_board)
                node.expand(sim_board, policy)
                value = -value  # Flip for backprop (value is from current player's perspective)

            # Backpropagation
            node.backpropagate(value)

        return root

    def get_action_probs(self, board: chess.Board,
                         temperature: float = MCTS_TEMPERATURE,
                         move_number: int = 0) -> List[Tuple[chess.Move, float]]:
        """
        Run MCTS and return move probabilities.

        Args:
            board: current board position
            temperature: controls exploration (1.0 = proportional, ~0 = greedy)
            move_number: current move number (for temperature scheduling)

        Returns:
            List of (move, probability) tuples
        """
        root = self.search(board)

        # Temperature scheduling: use exploration early, then play greedy
        if move_number >= MCTS_TEMP_THRESHOLD:
            temperature = 0.1  # Near-greedy

        if not root.children:
            return []

        moves = list(root.children.keys())
        visits = np.array([root.children[m].visit_count for m in moves], dtype=np.float64)

        if temperature < 0.01:
            # Greedy: all probability on the most visited move
            probs = np.zeros_like(visits)
            probs[np.argmax(visits)] = 1.0
        else:
            # Apply temperature
            visits_temp = visits ** (1.0 / temperature)
            total = visits_temp.sum()
            if total > 0:
                probs = visits_temp / total
            else:
                probs = np.ones_like(visits) / len(visits)

        return list(zip(moves, probs.tolist()))

    def select_move(self, board: chess.Board,
                    temperature: float = MCTS_TEMPERATURE,
                    move_number: int = 0) -> Tuple[chess.Move, List[Tuple[chess.Move, float]]]:
        """
        Select a move using MCTS.

        Returns:
            move: the selected move
            action_probs: full distribution for training
        """
        action_probs = self.get_action_probs(board, temperature, move_number)
        if not action_probs:
            # No legal moves — shouldn't happen if game isn't over
            return chess.Move.null(), []

        moves, probs = zip(*action_probs)
        probs = np.array(probs)

        # Sample from the distribution
        if temperature < 0.01:
            move_idx = np.argmax(probs)
        else:
            move_idx = np.random.choice(len(moves), p=probs)

        return moves[move_idx], action_probs
