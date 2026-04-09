/**
 * Position Editor — Drag-and-drop board setup tool
 * Allows placing/removing pieces to create arbitrary positions,
 * then generates a FEN string for starting a game from that position.
 */

export class PositionEditor {
  constructor() {
    this.board = this._emptyBoard();
    this.sideToMove = 'w';
    this.castling = { K: false, Q: false, k: false, q: false };
    this.enPassant = '-';
    this.halfmove = 0;
    this.fullmove = 1;
    this.selectedPiece = null; // { type, color } for placing
    this._listeners = {};
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }

  _emptyBoard() {
    const board = [];
    for (let r = 0; r < 8; r++) {
      board[r] = [];
      for (let f = 0; f < 8; f++) {
        board[r][f] = null;
      }
    }
    return board;
  }

  /**
   * Set standard starting position
   */
  setStartPosition() {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    this.loadFEN(fen + ' w KQkq - 0 1');
  }

  /**
   * Clear the board entirely
   */
  clear() {
    this.board = this._emptyBoard();
    this.castling = { K: false, Q: false, k: false, q: false };
    this.enPassant = '-';
    this._emit('change', this.toFEN());
  }

  /**
   * Place a piece on the board
   * @param {number} rank - 0-7 (0 = rank 1)
   * @param {number} file - 0-7 (0 = file a)
   * @param {string} piece - FEN char: K, Q, R, B, N, P, k, q, r, b, n, p
   */
  placePiece(rank, file, piece) {
    if (rank < 0 || rank > 7 || file < 0 || file > 7) return;
    this.board[rank][file] = piece;
    this._emit('change', this.toFEN());
  }

  /**
   * Remove a piece from the board
   */
  removePiece(rank, file) {
    this.board[rank][file] = null;
    this._emit('change', this.toFEN());
  }

  /**
   * Toggle a piece on a square (place if empty/different, remove if same)
   */
  togglePiece(rank, file, piece) {
    if (this.board[rank][file] === piece) {
      this.removePiece(rank, file);
    } else {
      this.placePiece(rank, file, piece);
    }
  }

  /**
   * Select a piece type for placement
   */
  selectPiece(fenChar) {
    this.selectedPiece = fenChar;
  }

  /**
   * Handle click on a square during editing
   */
  handleSquareClick(rank, file) {
    if (this.selectedPiece) {
      this.togglePiece(rank, file, this.selectedPiece);
    } else {
      this.removePiece(rank, file);
    }
  }

  /**
   * Set side to move
   */
  setSideToMove(side) {
    this.sideToMove = side === 'black' ? 'b' : 'w';
    this._emit('change', this.toFEN());
  }

  /**
   * Set castling rights
   */
  setCastling(rights) {
    this.castling = { ...this.castling, ...rights };
    this._emit('change', this.toFEN());
  }

  /**
   * Generate FEN string from current board state
   */
  toFEN() {
    let fen = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const piece = this.board[r][f];
        if (piece) {
          if (empty > 0) { fen += empty; empty = 0; }
          fen += piece;
        } else {
          empty++;
        }
      }
      if (empty > 0) fen += empty;
      if (r > 0) fen += '/';
    }

    // Castling
    let castStr = '';
    if (this.castling.K) castStr += 'K';
    if (this.castling.Q) castStr += 'Q';
    if (this.castling.k) castStr += 'k';
    if (this.castling.q) castStr += 'q';
    if (!castStr) castStr = '-';

    return `${fen} ${this.sideToMove} ${castStr} ${this.enPassant} ${this.halfmove} ${this.fullmove}`;
  }

  /**
   * Load a FEN string into the editor
   */
  loadFEN(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 1) return false;

    this.board = this._emptyBoard();
    const ranks = parts[0].split('/');
    if (ranks.length !== 8) return false;

    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of ranks[7 - r]) {
        if (ch >= '1' && ch <= '8') {
          f += parseInt(ch);
        } else {
          this.board[r][f] = ch;
          f++;
        }
      }
    }

    if (parts.length > 1) this.sideToMove = parts[1];
    if (parts.length > 2) {
      const c = parts[2];
      this.castling = { K: c.includes('K'), Q: c.includes('Q'), k: c.includes('k'), q: c.includes('q') };
    }
    if (parts.length > 3) this.enPassant = parts[3];
    if (parts.length > 4) this.halfmove = parseInt(parts[4]) || 0;
    if (parts.length > 5) this.fullmove = parseInt(parts[5]) || 1;

    this._emit('change', this.toFEN());
    return true;
  }

  /**
   * Validate the current position
   */
  validate() {
    const errors = [];
    let whiteKings = 0, blackKings = 0;

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = this.board[r][f];
        if (p === 'K') whiteKings++;
        if (p === 'k') blackKings++;
        // Pawns can't be on rank 1 or 8
        if ((p === 'P' || p === 'p') && (r === 0 || r === 7)) {
          errors.push(`Pawn on rank ${r === 0 ? 1 : 8} is invalid`);
        }
      }
    }

    if (whiteKings !== 1) errors.push(`White must have exactly 1 king (found ${whiteKings})`);
    if (blackKings !== 1) errors.push(`Black must have exactly 1 king (found ${blackKings})`);

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get pieces as array for display (matches engine format)
   */
  toPieceList() {
    const pieces = [];
    const typeMap = {
      'K': 'King', 'Q': 'Queen', 'R': 'Rook', 'B': 'Bishop', 'N': 'Knight', 'P': 'Pawn',
      'k': 'King', 'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight', 'p': 'Pawn',
    };
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = this.board[r][f];
        if (p) {
          const file = String.fromCharCode(97 + f);
          const rank = r + 1;
          pieces.push({
            piece_type: typeMap[p],
            color: p === p.toUpperCase() ? 'White' : 'Black',
            square: `${file}${rank}`,
          });
        }
      }
    }
    return pieces;
  }
}

/**
 * Piece palette for the editor UI
 */
export const EDITOR_PIECES = [
  { fen: 'K', name: 'King',   color: 'white', symbol: '♔' },
  { fen: 'Q', name: 'Queen',  color: 'white', symbol: '♕' },
  { fen: 'R', name: 'Rook',   color: 'white', symbol: '♖' },
  { fen: 'B', name: 'Bishop', color: 'white', symbol: '♗' },
  { fen: 'N', name: 'Knight', color: 'white', symbol: '♘' },
  { fen: 'P', name: 'Pawn',   color: 'white', symbol: '♙' },
  { fen: 'k', name: 'King',   color: 'black', symbol: '♚' },
  { fen: 'q', name: 'Queen',  color: 'black', symbol: '♛' },
  { fen: 'r', name: 'Rook',   color: 'black', symbol: '♜' },
  { fen: 'b', name: 'Bishop', color: 'black', symbol: '♝' },
  { fen: 'n', name: 'Knight', color: 'black', symbol: '♞' },
  { fen: 'p', name: 'Pawn',   color: 'black', symbol: '♟' },
];
