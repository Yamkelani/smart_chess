"""
AlphaZero-inspired Neural Network for Chess

Architecture:
- Input: 22-channel 8x8 board representation
- Body: Residual tower with batch normalization
- Policy Head: Predicts move probabilities
- Value Head: Predicts position evaluation [-1, 1]

The network learns from self-play data, continuously improving
through reinforcement learning.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import os
from app.config import (
    NN_INPUT_CHANNELS, NN_BOARD_SIZE, NN_RESIDUAL_BLOCKS,
    NN_FILTERS, NN_POLICY_OUTPUT, NN_VALUE_HIDDEN,
    MODEL_DIR, MODEL_FILENAME
)


class ResidualBlock(nn.Module):
    """Residual block with two conv layers and skip connection."""
    
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
    
    def forward(self, x):
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += residual
        out = F.relu(out)
        return out


class ChessNet(nn.Module):
    """
    AlphaZero-style neural network for chess.
    
    Input: (batch, 22, 8, 8) tensor encoding:
        - Channels 0-5: White pieces (K, Q, R, B, N, P)
        - Channels 6-11: Black pieces (K, Q, R, B, N, P)
        - Channel 12: All white pieces
        - Channel 13: All black pieces
        - Channels 14-17: Castling rights (WK, WQ, BK, BQ)
        - Channel 18: En passant square
        - Channel 19: Halfmove clock (normalized)
        - Channel 20: Fullmove number (normalized)
        - Channel 21: Side to move
    
    Output:
        - policy: (batch, 4672) move probabilities
        - value: (batch, 1) position evaluation [-1, 1]
    """
    
    def __init__(self, input_channels=NN_INPUT_CHANNELS, 
                 num_filters=NN_FILTERS,
                 num_blocks=NN_RESIDUAL_BLOCKS,
                 policy_output=NN_POLICY_OUTPUT,
                 value_hidden=NN_VALUE_HIDDEN):
        super().__init__()
        
        # Input convolution
        self.input_conv = nn.Conv2d(input_channels, num_filters, 3, padding=1, bias=False)
        self.input_bn = nn.BatchNorm2d(num_filters)
        
        # Residual tower
        self.residual_tower = nn.Sequential(
            *[ResidualBlock(num_filters) for _ in range(num_blocks)]
        )
        
        # Policy head
        self.policy_conv = nn.Conv2d(num_filters, 32, 1, bias=False)
        self.policy_bn = nn.BatchNorm2d(32)
        self.policy_fc = nn.Linear(32 * 8 * 8, policy_output)
        
        # Value head
        self.value_conv = nn.Conv2d(num_filters, 1, 1, bias=False)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(8 * 8, value_hidden)
        self.value_fc2 = nn.Linear(value_hidden, 1)
    
    def forward(self, x):
        # Input block
        out = F.relu(self.input_bn(self.input_conv(x)))
        
        # Residual tower
        out = self.residual_tower(out)
        
        # Policy head
        policy = F.relu(self.policy_bn(self.policy_conv(out)))
        policy = policy.view(policy.size(0), -1)
        policy = self.policy_fc(policy)
        
        # Value head
        value = F.relu(self.value_bn(self.value_conv(out)))
        value = value.view(value.size(0), -1)
        value = F.relu(self.value_fc1(value))
        value = torch.tanh(self.value_fc2(value))
        
        return policy, value
    
    def predict(self, board_tensor):
        """
        Predict policy and value for a single board position.
        
        Args:
            board_tensor: (18, 8, 8) tensor
            
        Returns:
            policy: (4672,) move probabilities
            value: scalar position evaluation
        """
        self.eval()
        with torch.no_grad():
            x = board_tensor.unsqueeze(0)
            if next(self.parameters()).is_cuda:
                x = x.cuda()
            policy_logits, value = self(x)
            policy = F.softmax(policy_logits, dim=1)
            return policy.squeeze(0).cpu().numpy(), value.item()


class ChessNetManager:
    """Manages the neural network lifecycle: loading, saving, inference."""
    
    def __init__(self, device=None):
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)
        
        self.model = ChessNet().to(self.device)
        self.model_path = os.path.join(MODEL_DIR, MODEL_FILENAME)
        self.generation = 0  # Training generation counter
        
        # Try to load existing model
        self.load_model()
    
    def load_model(self):
        """Load model weights from disk if available."""
        if os.path.exists(self.model_path):
            try:
                checkpoint = torch.load(self.model_path, map_location=self.device, weights_only=False)
                self.model.load_state_dict(checkpoint['model_state_dict'])
                self.generation = checkpoint.get('generation', 0)
                print(f"✓ Loaded model (generation {self.generation}) from {self.model_path}")
                return True
            except Exception as e:
                print(f"⚠ Failed to load model: {e}. Starting fresh.")
                return False
        else:
            print("ℹ No existing model found. Starting with random weights.")
            return False
    
    def save_model(self):
        """Save model weights to disk."""
        os.makedirs(MODEL_DIR, exist_ok=True)
        checkpoint = {
            'model_state_dict': self.model.state_dict(),
            'generation': self.generation,
        }
        torch.save(checkpoint, self.model_path)
        
        # Also save a versioned copy
        versioned_path = os.path.join(MODEL_DIR, f"chess_nn_gen{self.generation}.pth")
        torch.save(checkpoint, versioned_path)
        print(f"✓ Saved model (generation {self.generation}) to {self.model_path}")
    
    def predict(self, board_tensor):
        """Run inference on a board position."""
        return self.model.predict(board_tensor)
    
    def get_model(self):
        """Get the underlying PyTorch model."""
        return self.model
    
    def increment_generation(self):
        """Increment the training generation counter."""
        self.generation += 1
