# 3D Chess

A full-stack chess application with a 3D web interface, a high-performance Rust engine, and an AlphaZero-inspired neural network AI.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend       │────▶│  Rust Engine     │◀────│  AI Service      │
│   (Three.js)     │     │  (Actix-web)     │     │  (FastAPI)       │
│   Port 5173      │     │  Port 8081       │     │  Port 8082       │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

### Rust Engine (`engine/`)
- **Bitboard** board representation (12 bitboards for 6 piece types × 2 colors)
- Full **legal move generation** — all piece types, castling, en passant, promotions
- **Alpha-beta search** with quiescence search and iterative deepening
- **Piece-square table** evaluation with bishop pair & mobility bonuses
- REST API for game management via **Actix-web**

### AI Service (`ai-service/`)
- **AlphaZero-style neural network** (PyTorch) — residual CNN with policy + value heads
- **Monte Carlo Tree Search (MCTS)** with PUCT exploration
- **Self-play engine** for generating training data
- **Training pipeline** — iterative self-play → train loop
- REST API via **FastAPI** with configurable difficulty levels

### Frontend (`frontend/`)
- **3D chess board** built with Three.js — procedural piece geometry (no 3D model files)
- Orbit camera (right-click drag), zoom (scroll)
- Click-to-move with legal move highlighting
- Move history, captured pieces, evaluation bar
- AI opponent with 5 difficulty levels
- Falls back to engine alpha-beta when AI service is unavailable

## Quick Start

### Prerequisites
- **Rust** 1.70+ (for the engine)
- **Python** 3.10+ (for the AI service)
- **Node.js** 18+ (for the frontend)

### 1. Start the Rust Engine

```bash
cd engine
cargo run --release
# Runs on http://localhost:8081
```

### 2. Start the AI Service (optional — the frontend falls back to the engine)

```bash
cd ai-service
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8082
# Runs on http://localhost:8082
```

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### Docker (all services)

```bash
docker compose up --build
# Frontend: http://localhost:5173
# Engine:   http://localhost:8081
# AI:       http://localhost:8082
```

## Training the AI

Run the self-play training loop:

```bash
cd ai-service
python -m app.trainer --iterations 100 --games 25 --simulations 50
```

Options:
| Flag | Default | Description |
|------|---------|-------------|
| `--iterations` | 100 | Number of self-play → train cycles |
| `--games` | 25 | Self-play games per iteration |
| `--simulations` | 50 | MCTS simulations per move (higher = stronger but slower) |
| `--device` | auto | `cuda` or `cpu` |

Training data and model checkpoints are saved to `ai-service/training_data/` and `ai-service/models/`.

## API Endpoints

### Engine (port 8081)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/info` | Engine info |
| POST | `/game/new` | Create new game |
| GET | `/game/{id}` | Get game state |
| POST | `/game/{id}/move` | Make a move (UCI) |
| GET | `/game/{id}/moves` | Get legal moves |
| POST | `/game/{id}/engine-move` | Engine plays a move |
| POST | `/evaluate` | Evaluate a FEN position |

### AI Service (port 8082)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/ai/move` | Get AI move for a FEN |
| POST | `/ai/evaluate` | NN evaluation of position |
| POST | `/game/play` | Start a game vs AI |
| POST | `/game/{id}/play` | Make a move, AI responds |
| GET | `/ai/status` | Model/training status |
| GET | `/ai/difficulties` | List difficulty levels |

## Project Structure

```
3d-chess/
├── engine/                  # Rust chess engine
│   ├── src/
│   │   ├── main.rs          # Actix-web server
│   │   ├── api.rs           # REST endpoints
│   │   ├── board.rs         # Bitboard representation
│   │   ├── piece.rs         # Piece types and colors
│   │   ├── moves.rs         # Move generation
│   │   ├── evaluation.rs    # Search and evaluation
│   │   ├── game.rs          # Game state management
│   │   └── lib.rs           # Module declarations
│   ├── Cargo.toml
│   └── Dockerfile
├── ai-service/              # Python AI service
│   ├── app/
│   │   ├── main.py          # FastAPI server
│   │   ├── model.py         # Neural network (ResNet)
│   │   ├── mcts.py          # Monte Carlo Tree Search
│   │   ├── chess_env.py     # Board/move encoding
│   │   ├── self_play.py     # Self-play game generation
│   │   ├── trainer.py       # Training pipeline
│   │   └── config.py        # Configuration
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                # 3D web interface
│   ├── src/
│   │   ├── main.js          # Game controller
│   │   ├── board.js         # Three.js 3D board
│   │   ├── pieces.js        # 3D piece geometry
│   │   └── api.js           # API client
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .gitignore
└── README.md
```
