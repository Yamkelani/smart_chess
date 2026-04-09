# 3D Chess AI Service - Configuration
import os

# Server settings
AI_SERVICE_HOST = os.getenv("AI_SERVICE_HOST", "0.0.0.0")
AI_SERVICE_PORT = int(os.getenv("AI_SERVICE_PORT", "8082"))

# Engine service URL
ENGINE_URL = os.getenv("ENGINE_URL", "http://localhost:8081")

# Neural Network Architecture
NN_INPUT_CHANNELS = 18     # 12 piece planes + 2 color planes + 4 castling planes
NN_BOARD_SIZE = 8
NN_RESIDUAL_BLOCKS = 10    # Number of residual blocks (AlphaZero uses 19-39)
NN_FILTERS = 128           # Filters per conv layer (AlphaZero uses 256)
NN_POLICY_OUTPUT = 4672    # Total possible moves encoded as (from, to, promotion)
NN_VALUE_HIDDEN = 256      # Hidden layer size for value head

# MCTS Configuration
MCTS_SIMULATIONS = 800     # Number of MCTS simulations per move
MCTS_C_PUCT = 1.5          # Exploration constant
MCTS_TEMPERATURE = 1.0     # Temperature for move selection (1.0 = proportional, 0 = greedy)
MCTS_TEMP_THRESHOLD = 30   # Move number after which temperature drops to near 0
MCTS_DIRICHLET_ALPHA = 0.3 # Dirichlet noise alpha (for exploration in self-play)
MCTS_DIRICHLET_EPSILON = 0.25  # Fraction of noise to add

# Training Configuration
TRAINING_BATCH_SIZE = 256
TRAINING_LEARNING_RATE = 0.001
TRAINING_WEIGHT_DECAY = 1e-4
TRAINING_EPOCHS = 10
TRAINING_GAMES_PER_ITERATION = 25   # Self-play games per training iteration
TRAINING_BUFFER_SIZE = 50000        # Maximum training examples to keep
TRAINING_MIN_BUFFER = 2000          # Minimum examples before training starts

# Online Learning (learns from real gameplay in real-time)
ONLINE_LEARNING_BATCH_SIZE = 64     # Smaller batch for fast online updates
ONLINE_LEARNING_MIN_POSITIONS = 20  # Start learning after just 20 positions (~1 game)
ONLINE_LEARNING_EPOCHS = 3          # Quick epochs per game completion
ONLINE_BUFFER_SIZE = 20000          # Online replay buffer capacity

# Model persistence
MODEL_DIR = os.getenv("MODEL_DIR", "./models")
MODEL_FILENAME = "chess_nn.pth"
TRAINING_DATA_DIR = os.getenv("TRAINING_DATA_DIR", "./training_data")

# Database
DB_PATH = os.getenv("DB_PATH", "./data/chess_ai.db")

# Hard cap on MCTS simulations per request — prevents DoS from malicious clients.
MAX_MCTS_SIMULATIONS = int(os.getenv("MAX_MCTS_SIMULATIONS", "5000"))

# Difficulty levels (MCTS simulations per level)
DIFFICULTY_LEVELS = {
    "beginner": 50,
    "intermediate": 200,
    "advanced": 800,
    "expert": 1600,
    "master": 3200,
}
