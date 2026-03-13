"""
3D Chess AI Service — FastAPI Application

Exposes the neural network + MCTS engine as a REST API.
Communicates with the Rust chess engine for game management
and provides AI move selection at configurable difficulty levels.

Also implements online learning: the AI genuinely learns from every
game played, recording positions and training after each game completes.
"""

import os
import asyncio
import httpx
import chess
import numpy as np
import torch
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

from app.config import (
    AI_SERVICE_HOST, AI_SERVICE_PORT, ENGINE_URL,
    DIFFICULTY_LEVELS, MCTS_SIMULATIONS, MCTS_TEMPERATURE
)
from app.model import ChessNetManager
from app.mcts import MCTS


# ---- Pydantic Models ----

class AIMoveRequest(BaseModel):
    fen: str
    difficulty: str = "intermediate"
    temperature: Optional[float] = None

class AIMoveResponse(BaseModel):
    move: str
    fen_before: str
    evaluation: float
    simulations: int
    top_moves: List[Dict]

class EvalRequest(BaseModel):
    fen: str
    num_simulations: Optional[int] = 200

class EvalResponse(BaseModel):
    fen: str
    value: float
    policy_top: List[Dict]

class GamePlayRequest(BaseModel):
    game_id: Optional[str] = None
    difficulty: str = "intermediate"
    player_color: str = "white"  # "white" or "black"

class GamePlayResponse(BaseModel):
    game_id: str
    fen: str
    ai_move: Optional[str] = None
    pieces: List[Dict]
    legal_moves: List[str]
    status: str
    is_check: bool

class PlayerMoveRequest(BaseModel):
    uci: str
    difficulty: str = "intermediate"

class TrainStatusResponse(BaseModel):
    generation: int
    device: str
    model_loaded: bool
    replay_buffer_size: int

class HealthResponse(BaseModel):
    status: str
    service: str
    model_generation: int
    device: str


# ---- Globals ----
manager: Optional[ChessNetManager] = None
http_client: Optional[httpx.AsyncClient] = None
online_learner = None  # OnlineLearner instance


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    global manager, http_client, online_learner
    print("Starting 3D Chess AI Service...")

    manager = ChessNetManager()
    http_client = httpx.AsyncClient(base_url=ENGINE_URL, timeout=30.0)

    # Initialize online learning system
    from app.online_learner import OnlineLearner
    online_learner = OnlineLearner(manager)

    print(f"Model generation: {manager.generation}")
    print(f"Device: {manager.device}")
    print(f"Engine URL: {ENGINE_URL}")
    print(f"Online learning: ACTIVE (buffer: {len(online_learner.replay_buffer)} positions)")

    yield

    # Shutdown
    if http_client:
        await http_client.aclose()
    print("AI Service shut down.")


app = FastAPI(
    title="3D Chess AI Service",
    description="AlphaZero-inspired chess AI with MCTS",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Helper Functions ----

def get_simulations(difficulty: str) -> int:
    """Get MCTS simulation count for a difficulty level."""
    return DIFFICULTY_LEVELS.get(difficulty, DIFFICULTY_LEVELS["intermediate"])


def run_mcts(fen: str, num_simulations: int,
             temperature: float = MCTS_TEMPERATURE) -> dict:
    """
    Run MCTS on a position and return the best move + analysis.
    """
    board = chess.Board(fen)
    if board.is_game_over():
        raise ValueError("Game is already over")

    mcts = MCTS(
        manager.get_model(), manager.device,
        num_simulations=num_simulations,
        add_noise=False
    )

    action_probs = mcts.get_action_probs(board, temperature=temperature)
    if not action_probs:
        raise ValueError("No legal moves available")

    # Sort by probability
    action_probs.sort(key=lambda x: x[1], reverse=True)

    # Get value estimate
    from app.chess_env import board_to_tensor
    tensor = board_to_tensor(board)
    tensor_t = torch.from_numpy(tensor).unsqueeze(0).to(manager.device)
    manager.get_model().eval()
    with torch.no_grad():
        _, value = manager.get_model()(tensor_t)
        eval_score = value.item()

    # Select move
    moves, probs = zip(*action_probs)
    probs = np.array(probs)
    if temperature < 0.01:
        move_idx = np.argmax(probs)
    else:
        move_idx = np.random.choice(len(moves), p=probs)

    best_move = moves[move_idx]

    top_moves = []
    for m, p in action_probs[:5]:
        top_moves.append({
            "move": m.uci(),
            "probability": round(float(p), 4),
            "san": board.san(m)
        })

    return {
        "move": best_move.uci(),
        "evaluation": round(eval_score, 4),
        "simulations": num_simulations,
        "top_moves": top_moves,
        "action_probs": action_probs,  # Full MCTS policy for online learning
    }


# ---- Engine Communication ----

async def engine_new_game(fen: Optional[str] = None) -> dict:
    """Create a new game on the Rust engine."""
    payload = {"fen": fen} if fen else {}
    resp = await http_client.post("/game/new", json=payload)
    resp.raise_for_status()
    return resp.json()

async def engine_get_game(game_id: str) -> dict:
    """Get game state from the Rust engine."""
    resp = await http_client.get(f"/game/{game_id}")
    resp.raise_for_status()
    return resp.json()

async def engine_make_move(game_id: str, uci: str) -> dict:
    """Make a move on the Rust engine."""
    resp = await http_client.post(f"/game/{game_id}/move", json={"uci": uci})
    resp.raise_for_status()
    return resp.json()


# ---- API Endpoints ----

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="ok",
        service="chess-ai",
        model_generation=manager.generation if manager else -1,
        device=str(manager.device) if manager else "none"
    )


@app.post("/ai/move", response_model=AIMoveResponse)
async def ai_move(req: AIMoveRequest):
    """Get an AI move for a given position."""
    try:
        sims = get_simulations(req.difficulty)
        temp = req.temperature if req.temperature is not None else 0.1
        result = run_mcts(req.fen, num_simulations=sims, temperature=temp)
        return AIMoveResponse(
            move=result["move"],
            fen_before=req.fen,
            evaluation=result["evaluation"],
            simulations=result["simulations"],
            top_moves=result["top_moves"]
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/ai/evaluate", response_model=EvalResponse)
async def ai_evaluate(req: EvalRequest):
    """Evaluate a position using the neural network + MCTS."""
    try:
        board = chess.Board(req.fen)
        sims = req.num_simulations or 200

        mcts = MCTS(
            manager.get_model(), manager.device,
            num_simulations=sims, add_noise=False
        )
        action_probs = mcts.get_action_probs(board, temperature=0.01)

        from app.chess_env import board_to_tensor
        tensor = board_to_tensor(board)
        tensor_t = torch.from_numpy(tensor).unsqueeze(0).to(manager.device)
        manager.get_model().eval()
        with torch.no_grad():
            _, value = manager.get_model()(tensor_t)

        action_probs.sort(key=lambda x: x[1], reverse=True)
        top = [{"move": m.uci(), "san": board.san(m), "prob": round(float(p), 4)}
               for m, p in action_probs[:10]]

        return EvalResponse(fen=req.fen, value=round(value.item(), 4), policy_top=top)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/game/play", response_model=GamePlayResponse)
async def start_game(req: GamePlayRequest):
    """
    Start a new game against the AI.
    If player is black, AI makes the first move.
    Online learning is activated to track positions.
    """
    try:
        engine_data = await engine_new_game()
        game_id = engine_data["game_id"]
        ai_move_uci = None

        # Register game for online learning
        if online_learner:
            online_learner.start_session(game_id, req.player_color)
            # Record the starting position
            online_learner.record_position(game_id, engine_data["fen"])

        # If player chose black, AI plays white first
        if req.player_color == "black":
            sims = get_simulations(req.difficulty)
            result = run_mcts(engine_data["fen"], num_simulations=sims, temperature=0.5)
            move_data = await engine_make_move(game_id, result["move"])
            ai_move_uci = result["move"]

            # Record AI's position + MCTS policy for learning
            if online_learner:
                online_learner.record_position(
                    game_id, engine_data["fen"],
                    mcts_policy=[(m.uci(), p) for m, p in result["action_probs"]]
                )

            engine_data = await engine_get_game(game_id)

        return GamePlayResponse(
            game_id=game_id,
            fen=engine_data["fen"],
            ai_move=ai_move_uci,
            pieces=engine_data["pieces"],
            legal_moves=engine_data["legal_moves"],
            status=engine_data.get("status", "Active"),
            is_check=engine_data.get("is_check", False)
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Engine communication error: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/game/{game_id}/play", response_model=GamePlayResponse)
async def player_move(game_id: str, req: PlayerMoveRequest):
    """
    Make a player move, then get the AI response.
    Records all positions for online learning and trains when game ends.
    """
    try:
        # Record player's position before their move
        if online_learner:
            pre_game = await engine_get_game(game_id)
            online_learner.record_position(game_id, pre_game["fen"])

        # Make player's move on engine
        move_data = await engine_make_move(game_id, req.uci)
        if not move_data.get("success"):
            raise HTTPException(status_code=400, detail="Invalid move")

        # Check if game is over after player move
        game_data = await engine_get_game(game_id)
        if game_data["status"] != "Active":
            # Game over — trigger online learning
            if online_learner:
                winner = _determine_winner(game_data["status"], game_data.get("side_to_move"))
                learn_result = online_learner.complete_game_with_winner(
                    game_id, game_data["status"], winner
                )
                print(f"[Learning] game over after player move: {learn_result}")

            return GamePlayResponse(
                game_id=game_id,
                fen=game_data["fen"],
                ai_move=None,
                pieces=game_data["pieces"],
                legal_moves=game_data["legal_moves"],
                status=game_data["status"],
                is_check=game_data.get("is_check", False)
            )

        # AI responds
        sims = get_simulations(req.difficulty)
        result = run_mcts(game_data["fen"], num_simulations=sims, temperature=0.1)

        # Record the AI's position + MCTS policy for learning
        if online_learner:
            online_learner.record_position(
                game_id, game_data["fen"],
                mcts_policy=[(m.uci(), p) for m, p in result["action_probs"]]
            )

        await engine_make_move(game_id, result["move"])
        game_data = await engine_get_game(game_id)

        # Check if game is over after AI move
        if game_data["status"] != "Active" and online_learner:
            winner = _determine_winner(game_data["status"], game_data.get("side_to_move"))
            learn_result = online_learner.complete_game_with_winner(
                game_id, game_data["status"], winner
            )
            print(f"[Learning] game over after AI move: {learn_result}")

        return GamePlayResponse(
            game_id=game_id,
            fen=game_data["fen"],
            ai_move=result["move"],
            pieces=game_data["pieces"],
            legal_moves=game_data["legal_moves"],
            status=game_data["status"],
            is_check=game_data.get("is_check", False)
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Engine communication error: {e}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _determine_winner(status: str, side_to_move: Optional[str] = None) -> Optional[str]:
    """Determine the winner from a game status string."""
    status_lower = status.lower()
    if "checkmate" in status_lower:
        # In checkmate, the side to move LOST
        if side_to_move:
            stm = side_to_move.lower()
            return "black" if stm == "white" else "white"
        return None
    # Draws, stalemate, etc.
    return None


@app.get("/ai/status", response_model=TrainStatusResponse)
async def training_status():
    """Get current model and training status."""
    return TrainStatusResponse(
        generation=manager.generation if manager else -1,
        device=str(manager.device) if manager else "none",
        model_loaded=manager is not None,
        replay_buffer_size=online_learner.replay_buffer.__len__() if online_learner else 0
    )


@app.get("/ai/learning")
async def learning_status():
    """Get online learning statistics — shows the AI is genuinely learning."""
    if not online_learner:
        return {"status": "disabled"}
    return online_learner.get_status()


@app.get("/ai/difficulties")
async def list_difficulties():
    """List available difficulty levels."""
    return {
        "difficulties": [
            {"name": k, "simulations": v}
            for k, v in DIFFICULTY_LEVELS.items()
        ]
    }


# ═══════════════════════════════════════════════════
# CHESS TUTOR / COACH ENDPOINTS
# ═══════════════════════════════════════════════════

class TutorAskRequest(BaseModel):
    question: str
    fen: Optional[str] = None

class TutorAskResponse(BaseModel):
    answer: str
    category: Optional[str] = None

@app.post("/ai/tutor/ask", response_model=TutorAskResponse)
async def tutor_ask(req: TutorAskRequest):
    """Answer a chess question, optionally with position context."""
    from app.tutor import answer_question
    answer = answer_question(req.question, req.fen)
    return TutorAskResponse(answer=answer)


@app.get("/ai/tutor/lessons")
async def tutor_lessons():
    """Return the full lesson library (categories + items, no content)."""
    from app.tutor import get_lessons
    return get_lessons()


@app.get("/ai/tutor/lesson/{lesson_id}")
async def tutor_lesson_detail(lesson_id: str):
    """Return full content for a specific lesson."""
    from app.tutor import get_lesson_detail
    detail = get_lesson_detail(lesson_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return detail


@app.post("/ai/tutor/analyze")
async def tutor_analyze(req: EvalRequest):
    """Analyze a position and return coaching tips."""
    from app.tutor import analyze_position
    result = analyze_position(req.fen)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=AI_SERVICE_HOST,
        port=AI_SERVICE_PORT,
        reload=True
    )
