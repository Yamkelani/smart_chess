"""
Comprehensive test suite for the AI service.

Covers:
- Puzzle system (filtering, move checking, themes)
- Tutor system (lessons, Q&A, position analysis)
- Monitoring (win/loss tracking, ELO, drift detection, dashboards)
- Online learner (session management, result parsing)
- Config & difficulty profiles
- Model architecture (forward pass shapes)
"""

import math
import re
import time
import pytest
import numpy as np

# ---------------------------------------------------------------------------
# Config tests
# ---------------------------------------------------------------------------
from app.config import (
    DIFFICULTY_PROFILES,
    DIFFICULTY_LEVELS,
    MCTS_SIMULATIONS,
    NN_INPUT_CHANNELS,
    NN_BOARD_SIZE,
    NN_POLICY_OUTPUT,
)


class TestConfig:
    def test_difficulty_profiles_exist(self):
        assert len(DIFFICULTY_PROFILES) >= 5

    def test_all_profiles_have_required_keys(self):
        required = {"simulations", "temperature", "blunder_chance", "blunder_top_n", "miss_tactics", "engine_depth"}
        for name, profile in DIFFICULTY_PROFILES.items():
            missing = required - set(profile.keys())
            assert not missing, f"Profile '{name}' missing keys: {missing}"

    def test_beginner_blunders_more_than_master(self):
        assert DIFFICULTY_PROFILES["beginner"]["blunder_chance"] > DIFFICULTY_PROFILES["master"]["blunder_chance"]

    def test_difficulty_levels_ascending(self):
        values = list(DIFFICULTY_LEVELS.values())
        assert values == sorted(values), "Difficulty levels should be in ascending order"

    def test_simulations_positive(self):
        for name, profile in DIFFICULTY_PROFILES.items():
            assert profile["simulations"] > 0, f"{name} simulations must be positive"

    def test_temperatures_valid(self):
        for name, profile in DIFFICULTY_PROFILES.items():
            assert 0 < profile["temperature"] <= 5.0, f"{name} temperature out of range"


# ---------------------------------------------------------------------------
# Puzzle tests
# ---------------------------------------------------------------------------
from app.puzzles import get_puzzles, get_puzzle_by_id, check_puzzle_move, get_puzzle_themes


class TestPuzzles:
    def test_get_all_puzzles(self):
        puzzles = get_puzzles(limit=100)
        assert len(puzzles) > 0

    def test_filter_by_rating(self):
        puzzles = get_puzzles(min_rating=1500, max_rating=2000, limit=100)
        for p in puzzles:
            assert 1500 <= p["rating"] <= 2000

    def test_filter_by_theme(self):
        themes = get_puzzle_themes()
        if themes:
            puzzles = get_puzzles(theme=themes[0], limit=100)
            for p in puzzles:
                assert p["theme"] == themes[0]

    def test_limit_works(self):
        puzzles = get_puzzles(limit=3)
        assert len(puzzles) <= 3

    def test_get_puzzle_by_id(self):
        all_puzzles = get_puzzles(limit=1)
        if all_puzzles:
            pid = all_puzzles[0]["id"]
            puzzle = get_puzzle_by_id(pid)
            assert puzzle is not None
            assert puzzle["id"] == pid

    def test_get_nonexistent_puzzle(self):
        assert get_puzzle_by_id("nonexistent_puzzle_xyz") is None

    def test_check_correct_move(self):
        all_puzzles = get_puzzles(limit=100)
        # Find a puzzle with at least one solution move
        for p in all_puzzles:
            full = get_puzzle_by_id(p["id"])
            if full and full.get("solution") and len(full["solution"]) > 0:
                correct, is_complete, hint = check_puzzle_move(p["id"], 0, full["solution"][0])
                assert correct, f"First solution move should be correct for puzzle {p['id']}"
                break

    def test_check_wrong_move(self):
        all_puzzles = get_puzzles(limit=1)
        if all_puzzles:
            correct, is_complete, hint = check_puzzle_move(all_puzzles[0]["id"], 0, "a1a2")
            # "a1a2" is almost certainly wrong for any puzzle
            # But it could theoretically be correct, so just check we get a result
            assert isinstance(correct, bool)
            assert isinstance(is_complete, bool)

    def test_check_nonexistent_puzzle(self):
        correct, is_complete, hint = check_puzzle_move("nonexistent", 0, "e2e4")
        assert not correct

    def test_puzzle_themes_unique(self):
        themes = get_puzzle_themes()
        assert len(themes) == len(set(themes)), "Themes should be unique"

    def test_puzzles_have_required_fields(self):
        puzzles = get_puzzles(limit=100)
        required = {"id", "fen", "rating", "theme", "title"}
        for p in puzzles:
            missing = required - set(p.keys())
            assert not missing, f"Puzzle {p.get('id', '?')} missing fields: {missing}"


# ---------------------------------------------------------------------------
# Tutor tests
# ---------------------------------------------------------------------------
from app.tutor import get_lessons, get_lesson_detail, analyze_position, answer_question


class TestTutor:
    def test_get_lessons_returns_categories(self):
        lessons = get_lessons()
        assert isinstance(lessons, dict)
        assert len(lessons) > 0

    def test_lesson_detail_valid(self):
        lessons = get_lessons()
        for category, cat_data in lessons.items():
            items = cat_data.get("items", [])
            if items:
                first = items[0]
                detail = get_lesson_detail(first["id"])
                assert detail is not None
                assert "content" in detail
                return
        pytest.skip("No lessons found")

    def test_lesson_detail_nonexistent(self):
        assert get_lesson_detail("fake_lesson_999") is None

    def test_analyze_starting_position(self):
        result = analyze_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        assert isinstance(result, dict)
        assert "tips" in result or "phase" in result or "material" in result

    def test_answer_check_question(self):
        response = answer_question("what is check?")
        assert isinstance(response, str)
        assert len(response) > 0

    def test_answer_with_fen(self):
        response = answer_question(
            "analyze this position",
            fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        )
        assert isinstance(response, str)
        assert len(response) > 0

    def test_answer_fallback(self):
        # A question not matching any pattern
        response = answer_question("what is the meaning of life?")
        assert isinstance(response, str)


# ---------------------------------------------------------------------------
# Monitoring tests
# ---------------------------------------------------------------------------
from app.monitoring import ModelMonitor


class TestMonitoring:
    def _fresh_monitor(self):
        """Create a monitor that doesn't load from disk."""
        m = ModelMonitor()
        m.loss_history = []
        m.game_outcomes = []
        m.eval_history = []
        m.drift_reports = []
        m.alerts = []
        m.total_games = 0
        m.total_wins = 0
        m.total_losses = 0
        m.total_draws = 0
        m.elo_rating = 1200.0
        m.elo_history = []
        return m

    def test_record_training_loss(self):
        m = self._fresh_monitor()
        m.record_training_loss(1, 0.5, 0.3, source="test")
        assert len(m.loss_history) == 1
        assert m.loss_history[0]["policy_loss"] == 0.5
        assert m.loss_history[0]["value_loss"] == 0.3

    def test_record_game_outcome_checkmate_white_wins(self):
        m = self._fresh_monitor()
        # Human plays white, white won → AI (black) lost
        m.record_game_outcome("game1", "Checkmate(white)", "white", 40, 1)
        assert m.total_losses == 1
        assert m.total_wins == 0

    def test_record_game_outcome_checkmate_ai_wins(self):
        m = self._fresh_monitor()
        # Human plays white, black won → AI (black) won
        m.record_game_outcome("game2", "Checkmate(black)", "white", 30, 1)
        assert m.total_wins == 1
        assert m.total_losses == 0

    def test_record_game_outcome_draw(self):
        m = self._fresh_monitor()
        m.record_game_outcome("game3", "Draw", "white", 50, 1)
        assert m.total_draws == 1

    def test_extract_winner(self):
        assert ModelMonitor._extract_winner("Checkmate(white)") == "white"
        assert ModelMonitor._extract_winner("Checkmate(black)") == "black"
        assert ModelMonitor._extract_winner("Draw") is None
        assert ModelMonitor._extract_winner("Stalemate") is None
        assert ModelMonitor._extract_winner("Checkmate( white )") == "white"

    def test_elo_increases_on_win(self):
        m = self._fresh_monitor()
        initial_elo = m.elo_rating
        # Human plays white, black won → AI (black) won → ELO should increase
        m.record_game_outcome("g1", "Checkmate(black)", "white", 20, 1)
        assert m.elo_rating > initial_elo

    def test_elo_decreases_on_loss(self):
        m = self._fresh_monitor()
        initial_elo = m.elo_rating
        # Human plays white, white won → AI (black) lost → ELO should decrease
        m.record_game_outcome("g1", "Checkmate(white)", "white", 20, 1)
        assert m.elo_rating < initial_elo

    def test_dashboard_structure(self):
        m = self._fresh_monitor()
        m.record_training_loss(1, 0.5, 0.3)
        m.record_game_outcome("g1", "Checkmate(black)", "white", 20, 1)
        dashboard = m.get_dashboard(generation=1)
        assert "summary" in dashboard
        assert "total_games" in dashboard["summary"]

    def test_win_rate_trend(self):
        m = self._fresh_monitor()
        for i in range(15):
            result = "Checkmate(white)" if i % 2 == 0 else "Checkmate(black)"
            m.record_game_outcome(f"g{i}", result, "white", 30, 1)
        trend = m.get_win_rate_trend(window=5)
        assert len(trend) > 0

    def test_loss_history(self):
        m = self._fresh_monitor()
        for i in range(10):
            m.record_training_loss(1, 0.5 - i * 0.01, 0.3 - i * 0.01)
        history = m.get_loss_history(limit=5)
        assert len(history) <= 5

    def test_drift_detection_no_data(self):
        m = self._fresh_monitor()
        report = m.check_drift(generation=1)
        assert isinstance(report, dict)

    def test_loss_spike_alert(self):
        m = self._fresh_monitor()
        # Record several normal losses
        for _ in range(5):
            m.record_training_loss(1, 0.5, 0.3)
        # Record a spike
        m.record_training_loss(1, 5.0, 5.0)
        # Should have generated an alert
        assert len(m.alerts) > 0

    def test_acknowledge_alert(self):
        m = self._fresh_monitor()
        for _ in range(5):
            m.record_training_loss(1, 0.5, 0.3)
        m.record_training_loss(1, 5.0, 5.0)
        if m.alerts:
            m.acknowledge_alert(0)
            assert m.alerts[0].get("acknowledged", False)


# ---------------------------------------------------------------------------
# Online Learner tests (unit-level, no model training)
# ---------------------------------------------------------------------------
from app.online_learner import OnlineLearner


class TestOnlineLearner:
    def test_extract_winner(self):
        assert OnlineLearner._extract_winner("Checkmate(white)") == "white"
        assert OnlineLearner._extract_winner("Checkmate(black)") == "black"
        assert OnlineLearner._extract_winner("Stalemate") is None
        assert OnlineLearner._extract_winner("Draw") is None

    def test_extract_winner_from_actual_engine_format(self):
        """The Rust engine serialises status with format!("{:?}"), and Debug for
        Checkmate(String) includes the quotes.  These are the strings that
        actually arrive over the wire; the un-quoted forms above never occur.
        """
        assert OnlineLearner._extract_winner('Checkmate("white")') == "white"
        assert OnlineLearner._extract_winner('Checkmate("black")') == "black"

    def test_resignation_winner_is_the_player_who_did_not_resign(self):
        """GameStatus::Resigned carries the colour that RESIGNED, so the winner
        is the opposite colour.  Reading the token as the winner inverted the
        label on every resigned game.
        """
        assert OnlineLearner._extract_winner('Resigned("black")') == "white"
        assert OnlineLearner._extract_winner('Resigned("white")') == "black"

    def test_result_to_value_uses_real_engine_strings(self):
        """A decisive game must never be labelled as a draw.  Mislabelling every
        win and loss as 0.0 trains the value head toward a constant.
        """
        learner = OnlineLearner.__new__(OnlineLearner)
        assert learner._result_to_value('Checkmate("white")', "white") == 1.0
        assert learner._result_to_value('Checkmate("black")', "white") == -1.0
        # Black resigned, so white won.
        assert learner._result_to_value('Resigned("black")', "white") == 1.0
        assert learner._result_to_value('Resigned("white")', "white") == -1.0

    def test_explicit_winner_overrides_string_parsing(self):
        """The winner should be taken from structured data when supplied, so the
        pipeline does not depend on parsing a display string at all.
        """
        learner = OnlineLearner.__new__(OnlineLearner)
        assert learner._white_value_for("Checkmate", winner="white") == 1.0
        assert learner._white_value_for("Checkmate", winner="black") == -1.0
        assert learner._white_value_for("Draw", winner=None) == 0.0
        # With no explicit winner it must still fall back to parsing.
        assert learner._white_value_for('Checkmate("black")', winner=None) == -1.0

    def test_result_to_value_white_wins(self):
        learner = OnlineLearner.__new__(OnlineLearner)
        val = learner._result_to_value("Checkmate(white)", "white")
        assert val == 1.0

    def test_result_to_value_black_wins(self):
        learner = OnlineLearner.__new__(OnlineLearner)
        val = learner._result_to_value("Checkmate(black)", "white")
        assert val == -1.0

    def test_result_to_value_draw(self):
        learner = OnlineLearner.__new__(OnlineLearner)
        val = learner._result_to_value("Draw", "white")
        assert val == 0.0

    def test_result_to_value_stalemate(self):
        learner = OnlineLearner.__new__(OnlineLearner)
        val = learner._result_to_value("Stalemate", "white")
        assert val == 0.0


# ---------------------------------------------------------------------------
# Model architecture tests (shapes only — no training)
# ---------------------------------------------------------------------------
try:
    import torch
    from app.model import ChessNet

    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


@pytest.mark.skipif(not HAS_TORCH, reason="PyTorch not installed")
class TestModel:
    def test_forward_output_shapes(self):
        model = ChessNet(
            input_channels=NN_INPUT_CHANNELS,
            num_filters=32,       # small for speed
            num_blocks=2,
            policy_output=NN_POLICY_OUTPUT,
            value_hidden=64,
        )
        model.eval()
        x = torch.randn(2, NN_INPUT_CHANNELS, NN_BOARD_SIZE, NN_BOARD_SIZE)
        with torch.no_grad():
            policy, value = model(x)
        assert policy.shape == (2, NN_POLICY_OUTPUT)
        assert value.shape == (2, 1)

    def test_predict_single_position(self):
        model = ChessNet(
            input_channels=NN_INPUT_CHANNELS,
            num_filters=32,
            num_blocks=2,
            policy_output=NN_POLICY_OUTPUT,
            value_hidden=64,
        )
        board_tensor = torch.from_numpy(
            np.random.randn(NN_INPUT_CHANNELS, NN_BOARD_SIZE, NN_BOARD_SIZE).astype(np.float32)
        )
        policy, value = model.predict(board_tensor)
        assert policy.shape == (NN_POLICY_OUTPUT,)
        assert isinstance(value, float)
        assert -1.0 <= value <= 1.0
        # Policy should sum to ~1 (softmax)
        assert abs(policy.sum() - 1.0) < 1e-4

    def test_value_in_range(self):
        model = ChessNet(
            input_channels=NN_INPUT_CHANNELS,
            num_filters=32,
            num_blocks=2,
            policy_output=NN_POLICY_OUTPUT,
            value_hidden=64,
        )
        model.eval()
        x = torch.randn(10, NN_INPUT_CHANNELS, NN_BOARD_SIZE, NN_BOARD_SIZE)
        with torch.no_grad():
            _, value = model(x)
        for v in value:
            assert -1.0 <= v.item() <= 1.0, "Value head should output tanh in [-1, 1]"

    def test_checkpoint_round_trip(self, tmp_path, monkeypatch):
        import app.model as model_module

        monkeypatch.setattr(model_module, "MODEL_DIR", str(tmp_path))
        saver = model_module.ChessNetManager(device="cpu")
        saver.generation = 7
        saver.save_model()

        loader = model_module.ChessNetManager(device="cpu")
        assert loader.generation == 7
        for key, tensor in saver.model.state_dict().items():
            assert torch.equal(tensor, loader.model.state_dict()[key])

    def test_tampered_checkpoint_does_not_run_code(self, tmp_path, monkeypatch):
        import app.model as model_module

        marker = tmp_path / "payload_ran"

        class Payload:
            def __reduce__(self):
                return (exec, (f"open({str(marker)!r}, 'w').close()",))

        monkeypatch.setattr(model_module, "MODEL_DIR", str(tmp_path))
        torch.save({"model_state_dict": Payload(), "generation": 1},
                   tmp_path / model_module.MODEL_FILENAME)

        manager = model_module.ChessNetManager(device="cpu")
        assert not marker.exists(), "loading a checkpoint must not execute embedded code"
        assert manager.generation == 0  # fell back to fresh weights

    def test_starts_on_a_cp1252_console(self, tmp_path, monkeypatch):
        # A Windows console defaults to cp1252; startup must not crash on it.
        import io
        import sys

        import app.model as model_module

        console = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
        monkeypatch.setattr(sys, "stdout", console)
        monkeypatch.setattr(model_module, "MODEL_DIR", str(tmp_path))
        manager = model_module.ChessNetManager(device="cpu")  # no model yet
        manager.save_model()
        model_module.ChessNetManager(device="cpu")  # loads the saved model


@pytest.mark.skipif(not HAS_TORCH, reason="PyTorch not installed")
class TestReplayBuffer:
    @staticmethod
    def _example(seed):
        from app.self_play import TrainingExample

        rng = np.random.default_rng(seed)
        return TrainingExample(
            board_tensor=rng.random((NN_INPUT_CHANNELS, NN_BOARD_SIZE, NN_BOARD_SIZE), dtype=np.float32),
            policy_target=rng.random(NN_POLICY_OUTPUT, dtype=np.float32),
            value_target=float(rng.choice([-1.0, 0.0, 1.0])),
        )

    def test_round_trip(self, tmp_path):
        from app.self_play import ReplayBuffer

        buf = ReplayBuffer(max_size=123)
        buf.buffer = [self._example(i) for i in range(5)]
        path = str(tmp_path / "buf.npz")
        buf.save(path)

        loaded = ReplayBuffer()
        assert loaded.load(path)
        assert loaded.max_size == 123
        assert len(loaded) == 5
        for a, b in zip(buf.buffer, loaded.buffer, strict=True):
            assert np.array_equal(a.board_tensor, b.board_tensor)
            assert np.array_equal(a.policy_target, b.policy_target)
            assert a.value_target == b.value_target
            assert isinstance(b.value_target, float)

    def test_empty_round_trip(self, tmp_path):
        from app.self_play import ReplayBuffer

        path = str(tmp_path / "empty.npz")
        ReplayBuffer(max_size=9).save(path)
        loaded = ReplayBuffer()
        assert loaded.load(path)
        assert len(loaded) == 0
        assert loaded.max_size == 9

    def test_pickled_file_does_not_run_code(self, tmp_path):
        import pickle

        from app.self_play import ReplayBuffer

        marker = tmp_path / "payload_ran"

        class Payload:
            def __reduce__(self):
                return (exec, (f"open({str(marker)!r}, 'w').close()",))

        path = tmp_path / "buf.npz"
        path.write_bytes(pickle.dumps({"buffer": Payload(), "max_size": 1}))

        buf = ReplayBuffer()
        assert not buf.load(str(path))
        assert not marker.exists(), "loading a replay buffer must not execute embedded code"
        assert len(buf) == 0


# ---------------------------------------------------------------------------
# Difficulty filter tests (applied post-MCTS)
# ---------------------------------------------------------------------------
from app.main import apply_difficulty_filter


class TestDifficultyFilter:
    def _make_mcts_result(self, best_move="e2e4", top_moves=None):
        if top_moves is None:
            top_moves = [
                {"move": "e2e4", "visits": 100, "q_value": 0.6},
                {"move": "d2d4", "visits": 80, "q_value": 0.5},
                {"move": "g1f3", "visits": 40, "q_value": 0.3},
                {"move": "a2a3", "visits": 10, "q_value": -0.1},
            ]
        return {
            "move": best_move,
            "evaluation": 0.6,
            "simulations": 200,
            "top_moves": top_moves,
        }

    def test_master_keeps_best_move(self):
        result = self._make_mcts_result()
        filtered = apply_difficulty_filter(result, "master", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        assert filtered["move"] == "e2e4", "Master should play best move"

    def test_beginner_may_change_move(self):
        # Run many times — beginner should sometimes NOT play the best move
        changed = False
        for _ in range(100):
            result = self._make_mcts_result()
            filtered = apply_difficulty_filter(result, "beginner", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
            if filtered["move"] != "e2e4":
                changed = True
                break
        assert changed, "Beginner should occasionally play a suboptimal move"

    def test_filter_returns_valid_move(self):
        result = self._make_mcts_result()
        for difficulty in DIFFICULTY_PROFILES:
            filtered = apply_difficulty_filter(result, difficulty, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
            assert filtered["move"] in ["e2e4", "d2d4", "g1f3", "a2a3"], \
                f"Filter should return one of the top moves for {difficulty}"


# ---------------------------------------------------------------------------
# Chess environment / board tensor encoding
# ---------------------------------------------------------------------------
from app.chess_env import board_to_tensor


class TestChessEnv:
    def test_starting_position_tensor_shape(self):
        import chess
        board = chess.Board()
        tensor = board_to_tensor(board)
        assert tensor.shape == (NN_INPUT_CHANNELS, 8, 8)

    def test_tensor_dtype(self):
        import chess
        board = chess.Board()
        tensor = board_to_tensor(board)
        assert tensor.dtype == np.float32

    def test_empty_board_mostly_zeros(self):
        import chess
        board = chess.Board(fen=None)  # empty board
        board.set_piece_at(chess.E1, chess.Piece(chess.KING, chess.WHITE))
        board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
        tensor = board_to_tensor(board)
        # Most planes should be mostly zeros (only 2 pieces)
        non_zero = np.count_nonzero(tensor[:12])  # piece planes
        assert non_zero <= 4, f"Near-empty board should have few non-zero entries, got {non_zero}"


# ---------------------------------------------------------------------------
# Console output must be ASCII: a Windows console (cp1252) cannot encode
# symbols such as ✓ or —, and print() then raises and crashes the service.
# ---------------------------------------------------------------------------
class TestConsoleOutput:
    def test_print_calls_are_ascii(self):
        import ast
        import pathlib

        app_dir = pathlib.Path(__file__).resolve().parent.parent / "app"
        offenders = []
        for path in sorted(app_dir.glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "print":
                    for const in ast.walk(node):
                        if (isinstance(const, ast.Constant) and isinstance(const.value, str)
                                and not const.value.isascii()):
                            offenders.append(f"{path.name}:{node.lineno}")
                            break
        assert not offenders, f"non-ASCII text in print(): {offenders}"


# ---------------------------------------------------------------------------
# Learning only from engine-verified games
# ---------------------------------------------------------------------------
from app.verified_game import LearnedGames, judge, position_key

FOOLS_MATE_FENS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
    "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
    "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
    "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
]


def _record(**overrides):
    record = {
        "status": 'Checkmate("black")', "winner": "black", "is_terminal": True,
        "is_analysis": False, "variant": "standard", "fen_history": FOOLS_MATE_FENS,
    }
    record.update(overrides)
    return record


class TestVerifiedLearning:
    def test_a_finished_standard_game_is_learned_with_the_engines_result(self):
        v = judge(_record())
        assert v.learn
        assert (v.result, v.winner) == ('Checkmate("black")', "black")
        assert position_key(FOOLS_MATE_FENS[2]) in v.positions

    def test_unfinished_analysis_and_variant_games_are_refused(self):
        assert not judge(_record(is_terminal=False)).learn
        assert not judge(_record(is_terminal=False)).permanent  # may finish later
        analysis = judge(_record(is_analysis=True))
        assert not analysis.learn and analysis.permanent
        variant = judge(_record(variant="kingofthehill"))
        assert not variant.learn and variant.permanent

    def test_positions_match_regardless_of_move_counters(self):
        fen = FOOLS_MATE_FENS[3]
        same_position_other_counters = " ".join(fen.split()[:4] + ["7", "40"])
        assert position_key(same_position_other_counters) in judge(_record()).positions

    def test_learned_games_are_remembered_within_capacity(self):
        seen = LearnedGames(capacity=2)
        for gid in ("a", "b", "c"):
            seen.add(gid)
        assert "a" not in seen and "b" in seen and "c" in seen

    def test_learner_keeps_only_positions_the_game_reached(self):
        learner = OnlineLearner.__new__(OnlineLearner)
        import threading
        learner._lock = threading.Lock()
        learner.sessions = {}
        learner.start_session("g1", "white")
        for fen in FOOLS_MATE_FENS[:4]:
            learner.record_position("g1", fen)
        forged = "8/8/8/8/8/8/QQQQQQQQ/K6k w - - 0 1"
        learner.record_position("g1", forged)
        _, kept = learner._take_session("g1", judge(_record()).positions)
        assert [p.fen for p in kept] == FOOLS_MATE_FENS[:4]
        assert "g1" not in learner.sessions
