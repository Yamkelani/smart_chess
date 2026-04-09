# 3D Chess AI — Architecture & Design Decisions

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Algorithm Choice: AlphaZero Architecture](#2-algorithm-choice-alphazero-architecture)
   - 2.1 [Why AlphaZero over Classical Engines](#21-why-alphazero-over-classical-engines)
   - 2.2 [Why AlphaZero over Alternative ML Approaches](#22-why-alphazero-over-alternative-ml-approaches)
3. [Neural Network: Why CNN, Not LSTM/Transformer/MLP](#3-neural-network-why-cnn-not-lstmtransformersmlp)
   - 3.1 [The Spatial-Reasoning Argument](#31-the-spatial-reasoning-argument)
   - 3.2 [Why Not LSTM / RNN](#32-why-not-lstm--rnn)
   - 3.3 [Why Not Transformer](#33-why-not-transformer)
   - 3.4 [Why Not a Basic MLP](#34-why-not-a-basic-mlp)
4. [Network Architecture in Detail](#4-network-architecture-in-detail)
   - 4.1 [Input Encoding: 22-Channel Board Representation](#41-input-encoding-22-channel-board-representation)
   - 4.2 [Residual Tower](#42-residual-tower)
   - 4.3 [Dual-Head Output](#43-dual-head-output)
   - 4.4 [Move Encoding (Policy Space)](#44-move-encoding-policy-space)
5. [Monte Carlo Tree Search (MCTS)](#5-monte-carlo-tree-search-mcts)
   - 5.1 [What MCTS Is and Why It Is Needed](#51-what-mcts-is-and-why-it-is-needed)
   - 5.2 [The PUCT Algorithm](#52-the-puct-algorithm)
   - 5.3 [Where MCTS Is Used in the Game](#53-where-mcts-is-used-in-the-game)
   - 5.4 [Why MCTS Alone Is Not Enough](#54-why-mcts-alone-is-not-enough)
   - 5.5 [Why the NN Alone Is Not Enough](#55-why-the-nn-alone-is-not-enough)
6. [Training Pipeline](#6-training-pipeline)
   - 6.1 [Self-Play Data Generation](#61-self-play-data-generation)
   - 6.2 [Offline Training Loop](#62-offline-training-loop)
   - 6.3 [Online Learning — Learning from Real Games](#63-online-learning--learning-from-real-games)
   - 6.4 [Quality Gate — Preventing Catastrophic Updates](#64-quality-gate--preventing-catastrophic-updates)
7. [Difficulty System](#7-difficulty-system)
   - 7.1 [Difficulty Profiles](#71-difficulty-profiles)
   - 7.2 [Style Bias / Personality](#72-style-bias--personality)
8. [System Integration](#8-system-integration)
   - 8.1 [Service Architecture](#81-service-architecture)
   - 8.2 [Request Flow: AI Move](#82-request-flow-ai-move)
   - 8.3 [Request Flow: Game Complete → Online Learning](#83-request-flow-game-complete--online-learning)
9. [Hyperparameter Choices](#9-hyperparameter-choices)
10. [Trade-offs and Limitations](#10-trade-offs-and-limitations)
11. [File Reference](#11-file-reference)

---

## 1. Executive Summary

The 3D Chess AI is built on the **AlphaZero** paradigm — a convolutional neural network (CNN) guides a Monte Carlo Tree Search (MCTS) to select moves. The CNN evaluates board positions (producing both a move-probability distribution and a scalar win-probability), while MCTS uses those evaluations to explore the game tree intelligently. The AI also learns from every game played against it in real time through an online learning system.

**Key design decisions:**

| Decision | Choice | Primary Reason |
|----------|--------|----------------|
| Overall algorithm | AlphaZero (NN + MCTS) | No hand-crafted heuristics; learns entirely from play |
| Neural network | CNN with residual blocks | Chess is a spatial, grid-based problem |
| Search algorithm | MCTS with PUCT | Handles massive branching factor; pairs naturally with NN priors |
| Training | Self-play + online learning | Self-improving loop; adapts to real opponents |

---

## 2. Algorithm Choice: AlphaZero Architecture

### 2.1 Why AlphaZero over Classical Engines

Classical chess engines (Stockfish, Crafty) use **alpha-beta search** with hand-crafted evaluation functions containing thousands of manually tuned parameters — piece-square tables, king safety heuristics, pawn structure bonuses, mobility scores, and more. This project's Rust engine component does use alpha-beta for its fallback engine, but the primary AI uses the AlphaZero approach for several compelling reasons:

| Factor | Classical Alpha-Beta | AlphaZero (NN + MCTS) |
|--------|---------------------|-----------------------|
| **Evaluation function** | Hand-crafted, thousands of parameters tuned over decades | Learned automatically from self-play |
| **Knowledge encoding** | Explicit rules written by human experts | Implicit patterns discovered by the network |
| **Adaptability** | Requires manual retuning for rule changes | Retrains automatically |
| **Extensibility** | Adding new knowledge means writing more code | Just play more games |
| **Scalability** | Diminishing returns from deeper search | More compute → stronger play (scaling law) |
| **Style diversity** | Hard to make "play differently" | Temperature, noise, and personality bias offer natural style control |

For this game — which is intended as an interactive, learnable AI opponent — the ability to:
1. Learn from games played against real users (online learning)
2. Offer different difficulty levels via MCTS simulation count
3. Apply personality/style biases (aggressive, positional, defensive, trappy)

…makes AlphaZero the clear choice. A classical engine is rigid; AlphaZero is expressive.

### 2.2 Why AlphaZero over Alternative ML Approaches

**Why not supervised learning on grandmaster games?**

Training on a database of grandmaster games (supervised learning / imitation learning) produces a network that mimics human play but:
- Cannot exceed the quality of its training data
- Has no mechanism for self-improvement
- Learns biases and fashions of particular eras
- Doesn't generate its own training data

AlphaZero bypasses all of this — it starts from random weights and discovers chess knowledge autonomously through self-play.

**Why not pure reinforcement learning (e.g., DQN / PPO)?**

Standard RL algorithms like DQN or PPO suffer in chess because:
- The action space is enormous (~4,672 possible moves per position)
- Reward is extremely sparse (win/loss/draw only at game end, not per move)
- Sample efficiency is poor without a search component to amplify learning

AlphaZero achieves sample efficiency through MCTS — each training position carries a rich policy target (the full visit-count distribution over moves), not just a win/loss label from a single trajectory. This is dramatically more informative than PPO's policy gradient signal.

---

## 3. Neural Network: Why CNN, Not LSTM/Transformers/MLP

### 3.1 The Spatial-Reasoning Argument

Chess is played on an **8×8 grid**. The relationship between pieces is inherently **spatial and local**:

- A bishop's power comes from its diagonal lines of sight
- A knight fork exploits the L-shaped geometry
- King safety depends on the pawn shield immediately in front of it
- Pin/skewer patterns are defined by piece alignment on ranks, files, and diagonals

A **Convolutional Neural Network** is purpose-built for exactly this kind of data:

```
Input: (batch, 22, 8, 8)  — 22 feature planes on an 8×8 grid

Conv Layer:  3×3 kernel scans the board, detecting local patterns
             (e.g., "pawn in front of king", "rook on open file")

Deeper Layers: compose local features into global patterns
               (e.g., "weak back rank", "isolated queen-side pawns")
```

CNNs have three critical properties that align with chess:

1. **Translation equivariance** — a pattern detected in one region of the board is recognized if it appears elsewhere. A knight fork works the same way on the queen-side as on the king-side.

2. **Hierarchical feature extraction** — early layers detect low-level patterns (piece adjacency, pawn chains), deeper layers detect high-level concepts (king safety, weak squares, tactical motifs).

3. **Parameter efficiency** — a 3×3 kernel has only 9 weights but scans all 64 squares. This is far more efficient than learning separate weights for every square combination.

### 3.2 Why Not LSTM / RNN

LSTMs and RNNs are designed for **sequential data** — text, time series, audio. Their core mechanism is a hidden state that evolves over time steps.

**Chess is not inherently sequential at the position level.** When evaluating a single board position:

- The spatial arrangement of 32 (or fewer) pieces matters — not their temporal order
- An LSTM would need to process the 64 squares sequentially (e.g., left-to-right, top-to-bottom), which:
  - Destroys the 2D spatial structure
  - Creates artificial long-range dependencies (a1 is "far" from h8 even though they're on the same diagonal)
  - Requires O(64) sequential steps vs. O(1) for a convolution pass
  - Has vanishing/exploding gradient problems over long sequences

**The move history angle:** One could argue that the sequence of moves leading to a position matters. However:
- The FEN (position encoding) already captures everything the rules need — piece locations, castling rights, en passant square, move counters
- The network's 22-channel input encodes all of this directly
- If we wanted move-sequence context, we would add history planes (as AlphaZero does with 8 time steps), not switch the entire architecture

**LSTM overhead:** LSTMs also carry significant computational overhead per time step due to the gating mechanism (input gate, forget gate, output gate, cell state), making them slower for inference — a critical concern when running 800+ MCTS simulations per move.

### 3.3 Why Not Transformer

Transformers (ViT, GPT-style) have gained attention in chess recently. The case for and against:

**Arguments for Transformers:**
- Self-attention computes all-pairs interactions, capturing long-range dependencies (e.g., a bishop pinning a piece across the board)
- Transformers scale well with model size

**Arguments against, and why CNN was chosen for this project:**

1. **Quadratic cost:** Self-attention over 64 squares is O(64²) = O(4,096) per layer. A 3×3 convolution over 64 squares is O(64 × 9) = O(576). For a system running 800–3,200 MCTS simulations per move (each requiring a forward pass), inference speed is paramount.

2. **Data efficiency:** Transformers are notoriously data-hungry. AlphaZero's original CNN achieved superhuman play with ~44 million self-play games. Transformers typically require significantly more data to converge, and our self-play budget is more modest.

3. **Inductive bias:** CNNs encode a strong spatial prior (locality, translation equivariance) that matches chess perfectly. Transformers learn these priors from scratch — possible, but wasteful when the structure is known.

4. **The residual CNN is battle-tested:** DeepMind's AlphaZero, AlphaGo, Leela Chess Zero, and KataGo all use residual CNNs. The architecture is understood, debuggable, and well-characterized. Transformer-based chess engines (e.g., some experimental Leela variants) exist but haven't demonstrated clear superiority.

5. **Deployment constraints:** This game runs in Docker containers with optional GPU. Transformer models are typically larger and more memory-intensive, increasing deployment requirements.

### 3.4 Why Not a Basic MLP

A multi-layer perceptron (fully connected network) treats the input as a flat vector of 22 × 8 × 8 = 1,408 features:

- **No spatial structure:** Every input neuron connects to every hidden neuron. The network has no concept of "adjacent squares" or "diagonal alignment."
- **Parameter explosion:** A single hidden layer of 1,024 units would require 1,408 × 1,024 = 1.4M parameters — and that's just one layer, with no spatial awareness.
- **Poor generalization:** Patterns learned for one region of the board don't transfer to other regions. The network must learn "knight on c3 attacking e4" and "knight on f3 attacking e5" as completely separate features.

CNNs solve all of these problems through weight sharing across spatial locations.

---

## 4. Network Architecture in Detail

### 4.1 Input Encoding: 22-Channel Board Representation

The board is encoded as a **(22, 8, 8)** tensor — 22 binary/scalar feature planes on the 8×8 grid:

| Channels | Content | Type |
|----------|---------|------|
| 0–5 | White pieces (K, Q, R, B, N, P) | Binary (0/1) |
| 6–11 | Black pieces (K, Q, R, B, N, P) | Binary (0/1) |
| 12 | All white pieces combined | Binary |
| 13 | All black pieces combined | Binary |
| 14–17 | Castling rights (WK, WQ, BK, BQ) | Binary (full plane) |
| 18 | En passant square | Binary (single square) |
| 19 | Halfmove clock (normalised ÷100) | Scalar [0, 1] |
| 20 | Fullmove number (normalised ÷200) | Scalar [0, 1] |
| 21 | Side to move (1=white, 0=black) | Binary (full plane) |

**Key design decision — perspective flipping:** When it is Black's turn, the tensor is flipped: piece channels are swapped (own pieces → channels 0–5, opponent → 6–11), castling rights are swapped, and ranks are mirrored. This means the network **always evaluates from the side-to-move's perspective**, halving the effective problem space.

**Why 22 channels instead of the original AlphaZero's 119?** AlphaZero uses 8 time-steps of board history (8 × 14 planes = 112) plus 7 meta planes. We use a single time-step representation because:
- It reduces computational cost per MCTS simulation
- The halfmove clock and move number capture sufficient temporal context
- It simplifies the training data pipeline (no need to track 8 historical board states)

This is a deliberate trade-off: we sacrifice some temporal context for faster inference, which matters when running hundreds of MCTS simulations per move in a real-time game.

### 4.2 Residual Tower

```
Input (22, 8, 8)
  ↓
[3×3 Conv → BatchNorm → ReLU]  — input block projects to 128 filters
  ↓
[ResidualBlock × 10]            — 10 residual blocks
  ↓
Shared feature representation (128, 8, 8)
  ↓          ↓
Policy Head  Value Head
```

Each **ResidualBlock** contains:
```
Input ─────────────────────┐ (skip connection)
  ↓                        │
3×3 Conv → BatchNorm → ReLU│
  ↓                        │
3×3 Conv → BatchNorm       │
  ↓                        │
+ ←────────────────────────┘
  ↓
ReLU
```

**Why residual connections?** Without them, deep networks suffer from the vanishing gradient problem. ResNets solve this by providing a gradient "highway" through the skip connections. The network can learn to output near-zero from the convolutional path (effectively passing the input through unchanged), making it easy to train deeper networks.

**Why 10 blocks and 128 filters?** This is a conscious scaling choice:

| Variant | Blocks | Filters | Approx. Parameters |
|---------|--------|---------|--------------------|
| AlphaZero (full) | 19–39 | 256 | ~24M–80M |
| Leela Chess Zero (small) | 10 | 128 | ~2M |
| **This project** | **10** | **128** | **~2M** |

We prioritise fast inference over maximum playing strength. With 800 simulations per move and each simulation requiring a forward pass, keeping the network compact ensures the AI responds in 1–3 seconds at advanced difficulty.

### 4.3 Dual-Head Output

The shared residual features feed into two separate heads:

**Policy Head — "What move should I play?"**
```
(128, 8, 8) → 1×1 Conv(32) → BatchNorm → ReLU → Flatten → FC(2048 → 4672)
```
Output: **4,672 logits** representing a probability distribution over all possible moves. During inference, these logits are softmax-normalised and masked against legal moves.

**Value Head — "Who is winning?"**
```
(128, 8, 8) → 1×1 Conv(1) → BatchNorm → ReLU → Flatten → FC(64 → 256) → ReLU → FC(256 → 1) → tanh
```
Output: A **scalar in [-1, +1]** representing the expected game outcome from the current player's perspective. +1 = certain win, 0 = draw, -1 = certain loss.

**Why two heads instead of one?** The dual-head design serves fundamentally different purposes:
- The **policy** head provides the prior probabilities that guide MCTS search — it tells the tree search which moves are promising *before* deep exploration.
- The **value** head replaces the traditional hand-crafted evaluation function — it tells MCTS how good a position is when search terminates.

Having a shared body means both heads benefit from the same learned features, and training one head improves the other through the shared representation (multi-task learning).

### 4.4 Move Encoding (Policy Space)

Moves are encoded as a flat index of **4,672** possible actions using the AlphaZero encoding scheme:

```
Index = from_square × 73 + move_type

where move_type ∈ {
    0–55:  Queen-like moves (8 directions × 7 distances)
    56–63: Knight moves (8 L-shaped jumps)
    64–72: Underpromotions (3 piece types × 3 directions)
}
```

- **64 from-squares × 73 move types = 4,672 total**
- Queen-like moves cover rooks, bishops, queens, king moves, and pawn pushes (all move along queen directions)
- Promotions to queen are encoded as normal queen-direction moves to the last rank
- Underpromotions (to rook, bishop, knight) have dedicated indices

This encoding is **fixed-size and deterministic** — every legal move maps to exactly one index, and the neural network's policy output is always the same shape regardless of position. Illegal moves are masked out during MCTS expansion.

---

## 5. Monte Carlo Tree Search (MCTS)

### 5.1 What MCTS Is and Why It Is Needed

MCTS is a **search algorithm** that builds a game tree by running many simulated playouts ("simulations"). At a high level, each simulation has four phases:

```
1. SELECTION    — Start at the root and descend the tree,
                  choosing the most promising child at each level
                  
2. EXPANSION    — When a leaf node is reached, create child nodes
                  for all legal moves
                  
3. EVALUATION   — Use the neural network to evaluate the new position
                  (both policy priors for children and value estimate)
                  
4. BACKPROPAGATION — Update visit counts and value estimates
                     for all nodes on the path back to root
```

After all simulations complete, the move with the most visits at the root is selected. Visit count is a better indicator of move quality than raw value because it implicitly accounts for both exploitation (good moves get more visits) and exploration (under-explored moves get bonus visits).

### 5.2 The PUCT Algorithm

This implementation uses **PUCT** (Predictor + Upper Confidence bounds applied to Trees), the specific variant from AlphaZero:

```
UCB(s, a) = Q(s, a) + C_PUCT × P(s, a) × √(N_parent) / (1 + N(s, a))
```

Where:
- **Q(s, a)** — mean value of action `a` in state `s` (average of all simulation values passing through this node)
- **P(s, a)** — prior probability from the neural network's policy head
- **N_parent** — visit count of the parent node
- **N(s, a)** — visit count of this node
- **C_PUCT = 1.5** — exploration constant balancing exploitation vs. exploration

This formula elegantly balances:
- **Exploitation:** Nodes with high Q(s,a) are selected (play the best known move)
- **Exploration via prior:** Nodes with high P(s,a) are explored (trust the neural network's intuition)
- **Exploration via uncertainty:** Nodes with low N(s,a) relative to N_parent are explored (try under-explored moves)

As simulations accumulate, the visit distribution converges toward the true value ordering of moves.

### 5.3 Where MCTS Is Used in the Game

MCTS is the **core decision engine** at every point where the AI needs to select a move:

| Usage Point | File | Simulations | Purpose |
|-------------|------|-------------|---------|
| **AI move selection** | `main.py → /ai/move` | 50–3,200 (by difficulty) | Select the AI's move during gameplay |
| **Position evaluation** | `main.py → /ai/evaluate` | 200 (default) | Evaluate any position for the analysis board |
| **Self-play training** | `self_play.py → play_game()` | 800 (default) | Generate training data by playing against itself |
| **Game review** | `main.py → /ai/review-game` | 200 per position | Analyse each move for blunders, inaccuracies, etc. |
| **Online learning** | Records MCTS policy during play | (same as AI move) | Policy targets for training come from MCTS visit counts |

**The critical insight: MCTS provides the training signal.** During self-play and online learning, the MCTS visit-count distribution over moves becomes the **policy target** for training the neural network. This is far richer than a single "best move" label — it encodes the relative quality of every legal move, weighted by how deeply each was explored.

### 5.4 Why MCTS Alone Is Not Enough

Pure MCTS (without a neural network) uses random rollouts to estimate position values. This works for games with small action spaces (e.g., 9 moves in tic-tac-toe) but fails catastrophically in chess (~30 legal moves per position, ~80 moves per game):

- **Random rollouts are uninformative:** A randomly played chess game produces near-random results; the outcome tells you almost nothing about the quality of the first move.
- **Branching factor:** With ~30 moves per position and ~80 half-moves per game, the game tree has ~30⁸⁰ nodes. Even 10,000 simulations explore a vanishingly small fraction.
- **No prior knowledge:** Pure MCTS treats all legal moves as equally promising during expansion, wasting simulations on obviously bad moves.

The neural network solves all three problems:
- The **value head** replaces random rollouts with informed evaluation (one forward pass vs. playing to game end)
- The **policy head** focuses the search on promising moves, dramatically reducing the effective branching factor

### 5.5 Why the NN Alone Is Not Enough

Why not skip MCTS and use the neural network's policy output directly?

- **The policy head is a fast but imperfect approximation.** It assigns probabilities to moves based on pattern matching but cannot calculate forcing lines or deep tactical sequences.
- **MCTS adds computational depth.** By exploring multiple moves ahead, MCTS discovers tactics, traps, and forced sequences that the raw network misses.
- **Error correction.** If the network gives a bad move high probability, MCTS will discover through exploration that it leads to a poor position and reassign visits to better moves.

Empirically, the combination of NN + MCTS vastly outperforms either component alone. DeepMind's results showed that AlphaZero's raw network plays at roughly amateur level, but with 800 MCTS simulations, it reaches superhuman strength.

---

## 6. Training Pipeline

### 6.1 Self-Play Data Generation

Self-play is the primary data source. The process (`self_play.py`):

```
for each game (up to 300 moves):
    1. Encode current board → 22-channel tensor
    2. Run MCTS (800 simulations) → policy distribution + selected move
    3. Store (tensor, policy_distribution, side_to_move)
    4. Play the selected move on the board
    
After game ends:
    5. Determine result: +1 (white wins), -1 (black wins), 0 (draw)
    6. For each stored position:
       value_target = result × player_sign  (flip for black positions)
    7. Add all positions to the replay buffer
```

**Key mechanisms:**
- **Dirichlet noise** is added to root move priors during self-play (α=0.3, ε=0.25) to encourage exploration of non-obvious moves
- **Temperature scheduling:** Moves 1–30 use temperature 1.0 (proportional to visit counts = diverse play), moves 31+ use temperature 0.1 (near-greedy = serious play)
- **Replay buffer** caps at 50,000 positions; older positions are discarded when full

### 6.2 Offline Training Loop

The training pipeline (`trainer.py`) runs the classic AlphaZero loop:

```
for each iteration:
    Phase 1: Self-Play — Generate 25 games (800 MCTS sims each)
    Phase 2: Train — 10 epochs over shuffled replay buffer (batch size 256)
    Phase 3: Save — Persist model if training improved, save replay buffer
```

**Loss function:**
```
L = L_policy + L_value

L_policy = -Σ π_target × log(P_predicted)   (cross-entropy with MCTS targets)
L_value  = (v_target - V_predicted)²         (mean squared error)
```

Where:
- `π_target` = MCTS visit-count distribution (soft policy target)
- `P_predicted` = network policy head output (after softmax)
- `v_target` = actual game outcome from this player's perspective
- `V_predicted` = network value head output

**Optimiser:** Adam with learning rate 0.001, weight decay 1e-4, gradient clipping at norm 1.0.

**Learning rate schedule:** ReduceLROnPlateau (factor 0.5, patience 3) — automatically reduces LR when loss plateaus.

### 6.3 Online Learning — Learning from Real Games

The most distinctive feature of this AI is its **online learning system** (`online_learner.py`). Unlike a static model, this AI genuinely improves from games played against real human users:

```
During gameplay:
  1. Each AI move records: (board_tensor, MCTS_policy, side_to_move)
  
When game ends (via /ai/game-complete):
  2. All positions are labelled with game outcome
  3. Positions added to persistent online replay buffer (20,000 capacity)
  4. Quick training batch runs:
     - Sample 64 positions from buffer
     - Train for 3 epochs
     - ~1-3 seconds, imperceptible during game-over screen
  5. If loss improved → save model (quality gate)
  6. Model is immediately available for the next game
```

**Why online learning matters:**
- The AI adapts to its user base — if players consistently exploit a weakness, the AI learns to defend against it
- No manual retraining cycle needed — improvement is continuous
- The replay buffer persists to disk, surviving service restarts
- The quality gate (see below) prevents catastrophic forgetting from noisy updates

### 6.4 Quality Gate — Preventing Catastrophic Updates

Online learning presents a risk: a single noisy game could push the model weights in a harmful direction. The quality gate prevents this:

```python
new_total_loss = avg_policy_loss + avg_value_loss
prev_total_loss = self.last_loss["policy"] + self.last_loss["value"]

if new_total_loss < prev_total_loss:
    self.manager.save_model()   # ✓ Model improved — persist
else:
    pass                         # ✗ Loss worsened — keep previous model
```

This ensures the persisted model only gets better over time. The in-memory model still carries the latest weights (for continued learning), but the saved checkpoint always represents the best-known version.

---

## 7. Difficulty System

### 7.1 Difficulty Profiles

The AI supports five difficulty levels, each defined by a comprehensive profile:

| Parameter | Beginner | Intermediate | Advanced | Expert | Master |
|-----------|----------|--------------|----------|--------|--------|
| **MCTS simulations** | 50 | 200 | 800 | 1,600 | 3,200 |
| **Temperature** | 1.8 | 0.8 | 0.3 | 0.1 | 0.05 |
| **Blunder chance** | 35% | 15% | 5% | 0% | 0% |
| **Blunder pool (top-N)** | 8 | 5 | 3 | 1 | 1 |
| **Miss tactics** | 40% | 15% | 0% | 0% | 0% |
| **Engine depth** | 1 | 3 | 5 | 7 | 9 |

The difficulty system works at **three levels:**

1. **Search depth** (simulations) — Fewer simulations = weaker search = worse tactical vision
2. **Randomness** (temperature) — Higher temperature = more random move selection from MCTS distribution
3. **Post-processing** (blunder/miss) — After MCTS selects the best move, difficulty-based filters may override it:
   - **Blunder:** Randomly pick from top-N moves instead of the best
   - **Miss tactics:** Ignore captures and checks with some probability

This creates believable human-like play at lower levels — the AI doesn't just play randomly; it plays *reasonable moves that occasionally miss things*, exactly like a human at that level.

### 7.2 Style Bias / Personality

Beyond difficulty, the AI supports personality styles that bias move selection:

| Style | Behaviour |
|-------|-----------|
| **Aggressive** | Bonus for captures (+0.15) and checks (+0.20); prefers moves that restrict opponent mobility |
| **Positional** | Bonus for quiet non-tactical moves (+0.12); slight bonus for central squares |
| **Defensive** | Strong bonus for castling (+0.25); penalises weakening the king's pawn shield |
| **Trappy** | Bonus for checks (+0.10) and captures (+0.08); likes piece development from starting squares |

Style bias works by re-ranking the top MCTS candidates with bonus scores, then selecting from the re-ranked list. This preserves MCTS's quality while nudging the AI's move choices toward a particular playing style.

---

## 8. System Integration

### 8.1 Service Architecture

```
┌───────────┐    HTTP     ┌────────────────┐    HTTP    ┌──────────────┐
│  Frontend  │◄──────────►│  AI Service     │◄─────────►│ Rust Engine  │
│  (Three.js │    nginx   │  (FastAPI +     │           │ (actix-web)  │
│   + JS)    │   proxy    │   PyTorch +     │           │ Board rules, │
│            │            │   MCTS)         │           │ alpha-beta,  │
│ Port 5173  │            │  Port 8082      │           │ persistence  │
└───────────┘            └────────────────┘           │ Port 8081    │
                                                       └──────────────┘
```

The AI service is the **middle tier** between the frontend and the Rust engine:
- **Frontend** sends requests like "give me an AI move for this position"
- **AI Service** runs MCTS + neural network, returns the selected move
- **Rust Engine** handles game rules, legal move validation, and board state persistence

### 8.2 Request Flow: AI Move

```
1. Frontend → POST /api/ai/ai/move
   { fen: "rnbqkbnr/...", difficulty: "advanced", game_id: "abc-123" }

2. AI Service:
   a. Look up difficulty profile → 800 sims, temperature 0.3
   b. Run MCTS(fen, 800 sims, temp=0.3):
      - 800 iterations of: select → expand → evaluate(NN) → backpropagate
      - Returns: move probabilities, selected move, value estimate
   c. Apply difficulty filter (blunder/miss/style_bias)
   d. Record position for online learning
   e. Return: { move: "e2e4", evaluation: 0.15, top_moves: [...] }

3. Frontend → POST /api/engine/game/{id}/move
   { uci: "e2e4" }
   (Applies the AI's chosen move on the authoritative game state)
```

### 8.3 Request Flow: Game Complete → Online Learning

```
1. Game ends (checkmate, draw, resign)

2. Frontend → POST /api/ai/ai/game-complete
   { game_id: "abc-123", result: "Checkmate(white)", player_color: "white" }

3. AI Service (OnlineLearner):
   a. Retrieve all recorded positions for this game
   b. Label each position with value_target based on game outcome
   c. Add labelled positions to replay buffer
   d. Run _quick_train():
      - Sample 64 positions from buffer
      - 3 epochs: forward pass → compute loss → backprop → update weights
      - Quality gate: save model only if loss improved
   e. Return: { learned: true, positions_added: 42, training: { ... } }
```

---

## 9. Hyperparameter Choices

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Input channels | 22 | 12 piece planes + 2 colour + 4 castling + EP + halfmove + fullmove + side |
| Residual blocks | 10 | Balance between strength and inference speed (~2M params) |
| Conv filters | 128 | Standard for "small" AlphaZero variant; keeps forward pass fast |
| Policy output size | 4,672 | 64 squares × 73 move types (AlphaZero encoding) |
| Value hidden size | 256 | Adequate for mapping 64 features to a scalar |
| MCTS C_PUCT | 1.5 | Standard exploration constant; higher → more exploration |
| MCTS simulations (default) | 800 | Good balance of speed and strength |
| Temperature threshold | Move 30 | Explore in opening/early middlegame, play seriously after |
| Dirichlet α | 0.3 | Standard for chess (lower = more concentrated noise) |
| Dirichlet ε | 0.25 | 25% noise, 75% prior — enough exploration without chaos |
| Training batch size | 256 | Standard mini-batch size for SGD |
| Learning rate | 0.001 | Adam default; reduced on plateau |
| Weight decay | 1e-4 | Light regularisation to prevent overfitting |
| Online batch size | 64 | Small for fast updates during gameplay |
| Online epochs | 3 | Quick nudge, not full retraining |
| Online buffer | 20,000 | ~500 games worth of positions |
| Self-play buffer | 50,000 | ~1,300 games worth |
| Max moves per game | 300 | Prevents infinite self-play games |

---

## 10. Trade-offs and Limitations

| Trade-off | Decision | Consequence |
|-----------|----------|-------------|
| **Smaller network** | 10 blocks / 128 filters vs. AlphaZero's 39 / 256 | Weaker positional understanding, but 10× faster inference |
| **Single time-step** | No history planes | Loses some temporal context (e.g., move repetition patterns), but halves input size |
| **CPU-friendly** | Works without GPU | Master-level search (3,200 sims) takes ~10s on CPU vs. ~1s on GPU |
| **Online learning from few games** | 3-epoch quick train on 64 samples | Noisy gradient estimates; quality gate mitigates but doesn't eliminate |
| **No opening book** | Relies entirely on NN + MCTS | May play unconventional openings early in training; improves with self-play |
| **Fixed policy output size** | 4,672-dim vector | Includes many impossible moves (e.g., rook moving diagonally); wastes some capacity, but simplifies encoding |

---

## 11. File Reference

| File | Purpose |
|------|---------|
| [`config.py`](app/config.py) | All hyperparameters, difficulty profiles, and environment config |
| [`model.py`](app/model.py) | ChessNet CNN architecture, ChessNetManager for model lifecycle |
| [`chess_env.py`](app/chess_env.py) | Board → tensor encoding, move ↔ index encoding, legal move masking |
| [`mcts.py`](app/mcts.py) | MCTSNode, MCTS search with PUCT, action probability computation |
| [`self_play.py`](app/self_play.py) | Self-play game generation, ReplayBuffer, TrainingExample |
| [`trainer.py`](app/trainer.py) | Offline training loop, ChessDataset, TrainingPipeline |
| [`online_learner.py`](app/online_learner.py) | Online learning from real games, session management, quality gate |
| [`main.py`](app/main.py) | FastAPI endpoints, MCTS invocation, difficulty filtering, engine comms |
| [`tutor.py`](app/tutor.py) | Chess tutoring knowledge base, position analysis |
| [`drills.py`](app/drills.py) | Tactical drill database |
| [`puzzles.py`](app/puzzles.py) | Puzzle database |

---

*This document reflects the architecture as of commit `b658d18` on branch `feat/major-enhancements`.*
