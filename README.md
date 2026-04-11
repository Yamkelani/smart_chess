# 3D Chess

A full-stack chess application with a 3D web interface, a high-performance Rust engine, and an AlphaZero-inspired neural network AI. Ships as Docker containers **and** native desktop/mobile apps via Tauri v2.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend       │────▶│  Rust Engine     │◀────│  AI Service      │
│   (Three.js)     │     │  (Actix-web)     │     │  (FastAPI)       │
│   Port 5173      │     │  Port 8081       │     │  Port 8082       │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

### Rust Engine (`engine/`)
- **Bitboard + mailbox** hybrid board representation (12 bitboards × 6 piece types × 2 colors)
- Full **legal move generation** — all piece types, castling, en passant, promotions
- **Alpha-beta search** with iterative deepening, quiescence search, null-move pruning, LMR, killer moves, MVV-LVA ordering
- **Zobrist hashing** with transposition table
- **Tapered evaluation** with piece-square tables, bishop pair, mobility, pawn structure, king safety
- **Chess960** (Fischer Random) support
- **Game variants** support
- **Multiplayer** — real-time games with lobby/matchmaking
- **Leaderboard** — persistent Elo-based rankings
- REST API via **Actix-web** with 5 configurable difficulty profiles

### AI Service (`ai-service/`)
- **AlphaZero-style neural network** (PyTorch) — residual CNN with policy + value heads
- **Monte Carlo Tree Search (MCTS)** with PUCT exploration
- **Self-play engine** for generating training data
- **Training pipeline** — iterative self-play → train loop
- **Online learner** — continuous improvement from played games
- **Tutor** — natural-language move explanations and coaching
- **Puzzles** — tactical puzzle generation and evaluation
- **Timed drills** — skill-building exercises
- **Monitoring** — Prometheus metrics and health dashboards
- REST API via **FastAPI** with configurable difficulty levels

### Frontend (`frontend/`)
- **3D chess board** built with Three.js — procedural piece geometry (no 3D model files)
- Orbit camera (right-click drag), zoom (scroll)
- Click-to-move with legal move highlighting
- Move history, captured pieces, evaluation bar
- AI opponent with 5 difficulty levels
- **Board editor** — drag-and-drop FEN setup
- **Opening explorer** — ECO opening book with move trees
- **PGN import/export** — portable game notation support
- **Achievements** system with unlockable badges
- **Cosmetics** — board/piece theme customization
- **Daily puzzles** — fresh tactical challenges
- **Multiplayer** — real-time play against other humans
- **Rating system** — Elo-based tracking
- **Sound effects** — move, capture, check, game-end cues
- **Monitoring dashboard** — real-time system health
- Falls back to engine alpha-beta when AI service is unavailable

## Quick Start

### Prerequisites
- **Rust** 1.80+ (for the engine)
- **Python** 3.12+ (for the AI service)
- **Node.js** 22+ (for the frontend)

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

All containers include health checks, restart policies, memory/CPU limits, and log rotation. See `docker-compose.yml` for full configuration.

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
| POST | `/multiplayer/create` | Create multiplayer lobby |
| POST | `/multiplayer/join` | Join a lobby |
| GET | `/leaderboard` | Elo leaderboard |

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
| POST | `/tutor/explain` | Get coaching explanation for a position |
| GET | `/puzzles/daily` | Get daily puzzle |
| POST | `/drills/start` | Start a timed drill session |

## Native App Builds (Tauri v2)

The frontend can be built as a native desktop/mobile app using Tauri v2. The chess engine is embedded directly — no server needed for local play. AI features require a reachable AI service endpoint.

### Windows

**Prerequisites:** Rust 1.80+, Node.js 22+, Visual Studio Build Tools 2022 (with C++ workload)

```bash
cd frontend
npm install
npx tauri build
# Output: src-tauri/target/release/bundle/nsis/*.exe   (NSIS installer)
#         src-tauri/target/release/bundle/msi/*.msi     (WiX installer)
```

### macOS

**Prerequisites:** Rust 1.80+, Node.js 22+, Xcode Command Line Tools

```bash
cd frontend
npm install
npx tauri build
# Output: src-tauri/target/release/bundle/dmg/*.dmg
#         src-tauri/target/release/bundle/macos/*.app
```

### Linux

**Prerequisites:** Rust 1.80+, Node.js 22+, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev
cd frontend
npm install
npx tauri build
# Output: src-tauri/target/release/bundle/deb/*.deb
#         src-tauri/target/release/bundle/appimage/*.AppImage
```

### Android

**Prerequisites:** Rust 1.80+, Node.js 22+, JDK 17+, Android SDK (API 36), NDK 27

```bash
# Set environment
export ANDROID_HOME=$HOME/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973
export JAVA_HOME=/path/to/jdk-17

# Add Rust Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android

# Init and build
cd frontend
npm install
npx tauri android init
npx tauri android build --apk
# Output: src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

To sign the APK for distribution, use `apksigner` or upload to Google Play Console.

### iOS (requires macOS)

**Prerequisites:** macOS with Xcode 15+, Rust 1.80+, Node.js 22+, CocoaPods

```bash
# Add Rust iOS targets
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim

cd frontend
npm install
npx tauri ios init
npx tauri ios build
# Output: src-tauri/gen/apple/build/.../*.ipa
```

> **Note:** iOS builds can only be performed on macOS with Xcode installed.

## CI/CD

GitHub Actions workflows are included:

- **CI** (`.github/workflows/ci.yml`) — Runs on every push/PR to `main`/`develop`:
  - Rust: build, test, clippy, fmt
  - Python: lint (ruff), type check (mypy)
  - Frontend: npm build
  - Docker: compose build + healthcheck verification

- **Release** (`.github/workflows/release.yml`) — Triggered by version tags (`v*`):
  - Tauri desktop builds (Windows NSIS/MSI, macOS DMG/app, Linux DEB/AppImage)
  - Android APK/AAB
  - Docker images pushed to GitHub Container Registry

## Project Structure

```
3d-chess/
├── .github/workflows/       # CI/CD pipelines
│   ├── ci.yml               # Build & test on push/PR
│   └── release.yml          # Build installers on tag
├── engine/                   # Rust chess engine
│   ├── src/
│   │   ├── main.rs           # Actix-web server entry
│   │   ├── api.rs            # REST endpoints
│   │   ├── board.rs          # Bitboard + mailbox representation
│   │   ├── piece.rs          # Piece types and colors
│   │   ├── moves.rs          # Legal move generation
│   │   ├── attacks.rs        # Attack/pin detection
│   │   ├── evaluation.rs     # Search (alpha-beta) and evaluation
│   │   ├── zobrist.rs        # Zobrist hashing
│   │   ├── game.rs           # Game state management
│   │   ├── persistence.rs    # Save/load game data
│   │   ├── multiplayer.rs    # Real-time multiplayer
│   │   ├── chess960.rs       # Chess960 / Fischer Random
│   │   ├── variants.rs       # Game variant support
│   │   └── lib.rs            # Module declarations
│   ├── tests/                # Integration tests (102+)
│   ├── Cargo.toml
│   ├── Dockerfile
│   └── .dockerignore
├── ai-service/               # Python AI service
│   ├── app/
│   │   ├── main.py           # FastAPI server
│   │   ├── model.py          # Neural network (ResNet CNN)
│   │   ├── mcts.py           # Monte Carlo Tree Search
│   │   ├── chess_env.py      # Board/move encoding
│   │   ├── self_play.py      # Self-play game generation
│   │   ├── trainer.py        # Training pipeline
│   │   ├── online_learner.py # Continuous online learning
│   │   ├── tutor.py          # Move explanation / coaching
│   │   ├── puzzles.py        # Puzzle generation
│   │   ├── drills.py         # Timed drill exercises
│   │   ├── monitoring.py     # Prometheus metrics
│   │   └── config.py         # Configuration
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/                  # 3D web interface + Tauri native apps
│   ├── src/
│   │   ├── main.js            # Game controller
│   │   ├── board.js           # Three.js 3D board
│   │   ├── pieces.js          # 3D piece geometry
│   │   ├── api.js             # API client
│   │   ├── bridge.js          # Tauri ↔ web bridge
│   │   ├── openings.js        # Opening explorer (ECO)
│   │   ├── pgn.js             # PGN import/export
│   │   ├── editor.js          # Board editor
│   │   ├── achievements.js    # Achievement system
│   │   ├── cosmetics.js       # Theme customization
│   │   ├── daily-puzzle.js    # Daily puzzle interface
│   │   ├── timed-drills.js    # Drill timer UI
│   │   ├── multiplayer.js     # Multiplayer client
│   │   ├── rating.js          # Elo rating tracker
│   │   ├── sounds.js          # Sound effects
│   │   └── monitoring.js      # System health dashboard
│   ├── src-tauri/             # Tauri v2 native wrapper
│   │   ├── src/
│   │   │   ├── main.rs        # Tauri app entry
│   │   │   ├── engine.rs      # Embedded chess engine
│   │   │   └── lib.rs         # Module setup
│   │   ├── gen/android/       # Android (Gradle, SDK 36)
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── capabilities/
│   ├── index.html
│   ├── vite.config.js
│   ├── nginx.conf
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml         # Orchestrate all 3 services
└── README.md
```

## License

MIT
