"""
Chess Environment Wrapper

Provides board encoding for the neural network and move encoding/decoding.
Uses python-chess for game logic during AI training, and communicates with
the Rust engine for production play.
"""

import numpy as np
import chess

# Move encoding: We encode moves as (from_square, to_square, promotion_type)
# Total: 64 * 64 + 64 * 64 * 3 (for underpromotions) ≈ 4672 possible actions
# Simplified: We use a flat index of from_sq * 73 + direction encoding

# Direction encoding for queen-like moves (56 directions)
# 7 distances for each of 8 directions = 56
# Knight moves = 8
# Underpromotions = 9 (3 piece types * 3 directions)
# Total per square = 73
MOVES_PER_SQUARE = 73

# Direction vectors for queen moves
QUEEN_DIRS = [
    (0, 1), (1, 1), (1, 0), (1, -1),
    (0, -1), (-1, -1), (-1, 0), (-1, 1)
]

# Knight move deltas
KNIGHT_MOVES = [
    (2, 1), (2, -1), (-2, 1), (-2, -1),
    (1, 2), (1, -2), (-1, 2), (-1, -2)
]


def board_to_tensor(board: chess.Board) -> np.ndarray:
    """
    Convert a python-chess Board to a 22-channel 8x8 tensor.
    
    Channels:
        0-5: White pieces (K, Q, R, B, N, P)
        6-11: Black pieces (K, Q, R, B, N, P)
        12: All white pieces
        13: All black pieces
        14: White kingside castling right
        15: White queenside castling right
        16: Black kingside castling right
        17: Black queenside castling right
        18: En passant square (single square = 1)
        19: Halfmove clock (normalised 0-1)
        20: Fullmove number (normalised 0-1)
        21: Side to move (1 = white, 0 = black)
    """
    tensor = np.zeros((22, 8, 8), dtype=np.float32)
    
    piece_map = {
        (chess.KING, chess.WHITE): 0,
        (chess.QUEEN, chess.WHITE): 1,
        (chess.ROOK, chess.WHITE): 2,
        (chess.BISHOP, chess.WHITE): 3,
        (chess.KNIGHT, chess.WHITE): 4,
        (chess.PAWN, chess.WHITE): 5,
        (chess.KING, chess.BLACK): 6,
        (chess.QUEEN, chess.BLACK): 7,
        (chess.ROOK, chess.BLACK): 8,
        (chess.BISHOP, chess.BLACK): 9,
        (chess.KNIGHT, chess.BLACK): 10,
        (chess.PAWN, chess.BLACK): 11,
    }
    
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is not None:
            rank = chess.square_rank(square)
            file = chess.square_file(square)
            channel = piece_map[(piece.piece_type, piece.color)]
            tensor[channel][rank][file] = 1.0
            
            # Combined color planes
            if piece.color == chess.WHITE:
                tensor[12][rank][file] = 1.0
            else:
                tensor[13][rank][file] = 1.0
    
    # Castling rights
    if board.has_kingside_castling_rights(chess.WHITE):
        tensor[14] = np.ones((8, 8), dtype=np.float32)
    if board.has_queenside_castling_rights(chess.WHITE):
        tensor[15] = np.ones((8, 8), dtype=np.float32)
    if board.has_kingside_castling_rights(chess.BLACK):
        tensor[16] = np.ones((8, 8), dtype=np.float32)
    if board.has_queenside_castling_rights(chess.BLACK):
        tensor[17] = np.ones((8, 8), dtype=np.float32)

    # En passant square
    if board.ep_square is not None:
        ep_rank = chess.square_rank(board.ep_square)
        ep_file = chess.square_file(board.ep_square)
        tensor[18][ep_rank][ep_file] = 1.0

    # Halfmove clock (normalised by 100 – the 50-move rule threshold)
    tensor[19] = np.full((8, 8), min(board.halfmove_clock / 100.0, 1.0), dtype=np.float32)

    # Fullmove number (normalised by 200 – a practical upper bound)
    tensor[20] = np.full((8, 8), min(board.fullmove_number / 200.0, 1.0), dtype=np.float32)

    # Side to move (1 = white, 0 = black)
    tensor[21] = np.full((8, 8), 1.0 if board.turn == chess.WHITE else 0.0, dtype=np.float32)

    # If it's black's turn, flip the board so the network always sees from the
    # perspective of the side to move
    if board.turn == chess.BLACK:
        # Swap white and black channels
        tensor_copy = tensor.copy()
        tensor[0:6] = tensor_copy[6:12]  # Black pieces become "own"
        tensor[6:12] = tensor_copy[0:6]  # White pieces become "opponent"
        tensor[12] = tensor_copy[13]
        tensor[13] = tensor_copy[12]
        tensor[14] = tensor_copy[16]
        tensor[15] = tensor_copy[17]
        tensor[16] = tensor_copy[14]
        tensor[17] = tensor_copy[15]
        # EP square already set; flip will handle rank mirroring
        # Side-to-move stays as-is (already 0 for black)
        # Flip ranks
        tensor = tensor[:, ::-1, :].copy()
    
    return tensor


def move_to_index(move: chess.Move, board: chess.Board) -> int:
    """
    Encode a chess move as an index in the policy vector.
    
    Uses the AlphaZero encoding scheme:
    - From square (0-63)
    - Move type (0-72): queen directions * 7 distances + knight moves + underpromotions
    """
    from_sq = move.from_square
    to_sq = move.to_square
    
    if board.turn == chess.BLACK:
        from_sq = chess.square_mirror(from_sq)
        to_sq = chess.square_mirror(to_sq)
    
    from_rank = chess.square_rank(from_sq)
    from_file = chess.square_file(from_sq)
    to_rank = chess.square_rank(to_sq)
    to_file = chess.square_file(to_sq)
    
    delta_rank = to_rank - from_rank
    delta_file = to_file - from_file
    
    move_type = 0
    
    # Check for knight moves
    if (abs(delta_rank), abs(delta_file)) in [(2, 1), (1, 2)]:
        for i, (dr, df) in enumerate(KNIGHT_MOVES):
            if delta_rank == dr and delta_file == df:
                move_type = 56 + i
                break
    # Check for underpromotion
    elif move.promotion is not None and move.promotion != chess.QUEEN:
        promo_map = {chess.ROOK: 0, chess.BISHOP: 1, chess.KNIGHT: 2}
        promo_idx = promo_map.get(move.promotion, 0)
        dir_idx = 0 if delta_file == -1 else (1 if delta_file == 0 else 2)
        move_type = 64 + promo_idx * 3 + dir_idx
    else:
        # Queen-like move (including pawn pushes, captures, queen promotions)
        distance = max(abs(delta_rank), abs(delta_file))
        if distance == 0:
            return 0  # Shouldn't happen
        
        # Normalize direction
        dr = 0 if delta_rank == 0 else (1 if delta_rank > 0 else -1)
        df = 0 if delta_file == 0 else (1 if delta_file > 0 else -1)
        
        for dir_idx, (qdr, qdf) in enumerate(QUEEN_DIRS):
            if dr == qdr and df == qdf:
                move_type = dir_idx * 7 + (distance - 1)
                break
    
    return from_sq * MOVES_PER_SQUARE + move_type


def index_to_move(index: int, board: chess.Board) -> chess.Move:
    """
    Decode a policy index back to a chess move.
    """
    from_sq = index // MOVES_PER_SQUARE
    move_type = index % MOVES_PER_SQUARE
    
    from_rank = chess.square_rank(from_sq)
    from_file = chess.square_file(from_sq)
    
    promotion = None
    
    if move_type < 56:
        # Queen-like move
        dir_idx = move_type // 7
        distance = (move_type % 7) + 1
        dr, df = QUEEN_DIRS[dir_idx]
        to_rank = from_rank + dr * distance
        to_file = from_file + df * distance
        
        # Auto-promote to queen when pawn reaches last rank
        piece = board.piece_at(from_sq if board.turn == chess.WHITE else chess.square_mirror(from_sq))
        if piece and piece.piece_type == chess.PAWN and to_rank in (0, 7):
            promotion = chess.QUEEN
            
    elif move_type < 64:
        # Knight move
        knight_idx = move_type - 56
        dr, df = KNIGHT_MOVES[knight_idx]
        to_rank = from_rank + dr
        to_file = from_file + df
    else:
        # Underpromotion
        promo_type_idx = (move_type - 64) // 3
        dir_idx = (move_type - 64) % 3
        
        promo_map = {0: chess.ROOK, 1: chess.BISHOP, 2: chess.KNIGHT}
        promotion = promo_map[promo_type_idx]
        
        to_rank = from_rank + 1
        to_file = from_file + (-1 + dir_idx)
    
    if 0 <= to_rank < 8 and 0 <= to_file < 8:
        to_sq = chess.square(to_file, to_rank)
        
        if board.turn == chess.BLACK:
            from_sq = chess.square_mirror(from_sq)
            to_sq = chess.square_mirror(to_sq)
        
        return chess.Move(from_sq, to_sq, promotion=promotion)
    
    return chess.Move.null()


def get_legal_move_mask(board: chess.Board) -> np.ndarray:
    """
    Create a mask of legal move indices.
    Returns a boolean array of shape (4672,) where True = legal move.
    """
    mask = np.zeros(64 * MOVES_PER_SQUARE, dtype=np.bool_)
    for move in board.legal_moves:
        idx = move_to_index(move, board)
        if 0 <= idx < len(mask):
            mask[idx] = True
    return mask


def get_game_result(board: chess.Board, from_perspective: chess.Color) -> float:
    """
    Get the game result from a player's perspective.
    Returns: 1.0 for win, -1.0 for loss, 0.0 for draw
    """
    result = board.result()
    if result == "1-0":
        return 1.0 if from_perspective == chess.WHITE else -1.0
    elif result == "0-1":
        return 1.0 if from_perspective == chess.BLACK else -1.0
    else:
        return 0.0


def fen_to_tensor(fen: str) -> np.ndarray:
    """Convert a FEN string to a board tensor."""
    board = chess.Board(fen)
    return board_to_tensor(board)
