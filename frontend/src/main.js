/**
 * 3D Chess — Main Game Controller v2
 *
 * Ties together the 3D board, API communication, UI controls,
 * sound effects, keyboard shortcuts, move timer, theme selector,
 * and game logic. Includes real-time AI learning status display.
 */
import { ChessBoard3D } from './board.js';
import { ChessAPI } from './api.js';
import { sounds } from './sounds.js';

// Piece symbols for captured display (lowercase keys to match engine API)
const PIECE_UNICODE = {
  king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙',
  King: '♔', Queen: '♕', Rook: '♖', Bishop: '♗', Knight: '♘', Pawn: '♙',
};

class ChessGame {
  constructor() {
    this.api = new ChessAPI();
    this.gameId = null;
    this.fen = null;
    this.pieces = [];
    this.legalMoves = [];
    this.moveHistory = [];
    this.capturedWhite = []; // white pieces captured (by black)
    this.capturedBlack = []; // black pieces captured (by white)
    this.status = 'Active';
    this.sideToMove = 'white';
    this.isCheck = false;
    this.playerColor = 'white';
    this.useAI = true;
    this.selectedSquare = null;
    this.thinking = false;

    // Move timer
    this.whiteTime = 0;  // seconds elapsed
    this.blackTime = 0;
    this._timerInterval = null;
    this._lastTimerTick = null;
    this._timerStarted = false; // only start on first actual move

    // Tutor
    this.tutorEnabled = true;

    // Move notation state (for building SAN)
    this._prevPieces = []; // pieces before the last move

    // Init 3D board
    const canvas = document.getElementById('chess-canvas');
    this.board = new ChessBoard3D(canvas);

    this._bindEvents();
    this._bindKeyboard();
    this._bindCameraControls();
    this._initThemeSelector();
    this._initVolumeControl();
    this._initTutor();
    this.newGame();

    // Poll AI learning status every 10 seconds
    this._pollLearningStatus();
    setInterval(() => this._pollLearningStatus(), 10000);
  }

  _bindEvents() {
    // Board clicks
    this.board.canvas.addEventListener('click', (e) => this._onBoardClick(e));

    // UI controls
    document.getElementById('btn-new-game').addEventListener('click', () => this.newGame());
    document.getElementById('btn-flip').addEventListener('click', () => this.board.flipBoard());
    document.getElementById('btn-undo').addEventListener('click', () => this._undo());
    document.getElementById('use-ai').addEventListener('change', (e) => {
      this.useAI = e.target.checked;
    });
    document.getElementById('color-select').addEventListener('change', (e) => {
      this.playerColor = e.target.value;
      this.newGame();
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't fire shortcuts when typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          this.newGame();
          break;
        case 'f':
          e.preventDefault();
          this.board.flipBoard();
          sounds.playSelect();
          break;
        case 'escape':
          e.preventDefault();
          this.selectedSquare = null;
          this.board.clearHighlights();
          if (this.lastMoveFrom && this.lastMoveTo) {
            this.board.highlightLastMove(this.lastMoveFrom, this.lastMoveTo);
          }
          break;
        case 'm':
          e.preventDefault();
          const enabled = sounds.toggle();
          const soundBtn = document.getElementById('btn-sound');
          if (soundBtn) soundBtn.textContent = enabled ? '🔊' : '🔇';
          break;
      }
    });
  }

  _initThemeSelector() {
    const sel = document.getElementById('theme-select');
    if (!sel) return;
    const themes = this.board.getThemes();
    sel.innerHTML = '';
    for (const { id, name } of themes) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      if (id === 'classic') opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', (e) => {
      this.board.setTheme(e.target.value);
      sounds.playSelect();
    });
  }

  _initVolumeControl() {
    const slider = document.getElementById('volume-slider');
    if (!slider) return;
    slider.addEventListener('input', (e) => {
      sounds.setVolume(parseFloat(e.target.value));
    });
    const soundBtn = document.getElementById('btn-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const enabled = sounds.toggle();
        soundBtn.textContent = enabled ? '🔊' : '🔇';
      });
    }
  }

  _bindCameraControls() {
    const bind = (id, preset) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        this.board.setCameraPreset(preset);
        sounds.playSelect();
      });
    };
    bind('cam-default', 'default');
    bind('cam-top', 'top');
    bind('cam-low', 'low');
    bind('cam-side', 'side');
  }

  _initTutor() {
    const panel = document.getElementById('tutor-panel');
    if (!panel) return;

    // ── Tab switching ──
    const tabs = panel.querySelectorAll('.tutor-tab');
    const contents = panel.querySelectorAll('.tutor-tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        contents.forEach(c => c.classList.toggle('active', c.id === `tab-${target}`));

        // Load lessons on first Learn tab open
        if (target === 'learn' && !this._lessonsLoaded) {
          this._loadLessons();
        }
      });
    });

    // ── Minimize / restore ──
    const minimizeBtn = document.getElementById('tutor-minimize');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        panel.classList.toggle('minimized');
        const icon = minimizeBtn.querySelector('.minimize-icon');
        if (icon) icon.textContent = panel.classList.contains('minimized') ? '▲' : '▼';
      });
    }

    // ── AI Chat: send button + Enter key ──
    const chatInput = document.getElementById('ai-chat-input');
    const chatSend = document.getElementById('ai-chat-send');
    if (chatSend) {
      chatSend.addEventListener('click', () => this._sendChatMessage());
    }
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendChatMessage();
        }
      });
    }

    // ── Quick questions ──
    panel.querySelectorAll('.quick-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        if (chatInput) chatInput.value = q;
        this._sendChatMessage();
      });
    });

    this._lessonsLoaded = false;
    this.tutorEnabled = true;
  }

  // ── AI Chat ──

  async _sendChatMessage() {
    const input = document.getElementById('ai-chat-input');
    const messagesEl = document.getElementById('ai-chat-messages');
    if (!input || !messagesEl) return;

    const question = input.value.trim();
    if (!question) return;
    input.value = '';

    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg user';
    userMsg.textContent = question;
    messagesEl.appendChild(userMsg);

    // Show typing indicator
    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.textContent = 'Chess Coach is thinking...';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Call AI tutor API
    const result = await this.api.askTutor(question, this.fen);
    typing.remove();

    // Add AI response
    const aiMsg = document.createElement('div');
    aiMsg.className = 'chat-msg ai';
    if (result && result.answer) {
      aiMsg.innerHTML = `<div class="msg-label">Chess AI Coach</div>${this._formatMarkdown(result.answer)}`;
    } else {
      aiMsg.innerHTML = `<div class="msg-label">Chess AI Coach</div>Sorry, I couldn't reach the AI service. Try again in a moment!`;
    }
    messagesEl.appendChild(aiMsg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _formatMarkdown(text) {
    // Convert basic markdown to HTML: bold, bullet lists, newlines
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^• (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/gs, '<ul>$&</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  // ── Learn Tab ──

  async _loadLessons() {
    const container = document.getElementById('tutor-learn-content');
    if (!container) return;

    container.innerHTML = '<div class="chat-typing">Loading lessons...</div>';
    const lessons = await this.api.getTutorLessons();
    if (!lessons) {
      container.innerHTML = '<div class="tutor-tip"><span class="tutor-tag warning">OFFLINE</span> Could not load lessons. Check that the AI service is running.</div>';
      return;
    }

    this._lessonsLoaded = true;
    let html = '';
    for (const [catId, cat] of Object.entries(lessons)) {
      html += `<div class="learn-category">
        <div class="learn-category-title">${cat.icon || '📖'} ${cat.title}</div>`;
      for (const item of cat.items) {
        html += `<div class="learn-item" data-lesson="${item.id}">
          <span class="learn-item-title">${item.title}</span>
          <span class="learn-item-desc">${item.desc}</span>
        </div>`;
      }
      html += '</div>';
    }
    container.innerHTML = html;

    // Bind lesson clicks
    container.querySelectorAll('.learn-item').forEach(el => {
      el.addEventListener('click', () => this._openLesson(el.dataset.lesson));
    });
  }

  async _openLesson(lessonId) {
    const container = document.getElementById('tutor-learn-content');
    if (!container) return;

    container.innerHTML = '<div class="chat-typing">Loading lesson...</div>';
    const detail = await this.api.getTutorLessonDetail(lessonId);
    if (!detail) {
      container.innerHTML = '<div class="tutor-tip"><span class="tutor-tag warning">ERROR</span> Could not load this lesson.</div>';
      return;
    }

    container.innerHTML = `
      <div class="learn-detail">
        <button class="learn-back" id="learn-back-btn">← Back to Lessons</button>
        <div class="learn-detail-cat">${detail.category || ''}</div>
        <div class="learn-detail-content">${detail.content}</div>
      </div>`;
    
    const backBtn = document.getElementById('learn-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this._loadLessons());
    }
  }

  async newGame() {
    this.selectedSquare = null;
    this.moveHistory = [];
    this.capturedWhite = [];
    this.capturedBlack = [];
    this.status = 'Active';
    this.playerColor = document.getElementById('color-select').value;
    this.useAI = document.getElementById('use-ai').checked;

    // Reset timer
    this._stopTimer();
    this.whiteTime = 0;
    this.blackTime = 0;
    this._updateTimerDisplay();

    // Hide overlay
    document.getElementById('overlay').style.display = 'none';

    sounds.playSelect();

    try {
      const data = await this.api.newGame();
      this.gameId = data.game_id;
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.sideToMove = 'white';
      this.isCheck = false;

      this.board.clearHighlights();
      this.board.setPieces(this.pieces);
      this._updateUI();

      this._timerStarted = false;

      // If player is black, AI moves first
      if (this.useAI && this.playerColor === 'black') {
        if (this.board.flipped === false) this.board.flipBoard();
        await this._aiMove();
      } else {
        if (this.board.flipped === true) this.board.flipBoard();
      }
    } catch (err) {
      console.error('Failed to start new game:', err);
      this._showStatus('Error starting game — is the engine running?');
    }
  }

  _onBoardClick(e) {
    if (this.thinking || this.status !== 'Active') return;
    if (this.animating) return;

    // Don't handle left-click if it's during orbit (right-click drag)
    if (e.button !== 0) return;

    const sq = this.board.getSquareAtScreen(e.clientX, e.clientY);
    if (!sq) return;

    const isPlayerTurn = this._isPlayerTurn();
    if (!isPlayerTurn && this.useAI) return;

    if (this.selectedSquare) {
      // Try to make a move
      const uci = this.selectedSquare + sq;
      // Check for promotion: if pawn moving to last rank
      const promoUci = this._checkPromotion(this.selectedSquare, sq, uci);

      if (this.legalMoves.includes(promoUci) || this.legalMoves.includes(uci)) {
        this._makeMove(promoUci || uci);
        this.selectedSquare = null;
        return;
      }

      // Clicked own piece — reselect
      if (this._isOwnPiece(sq)) {
        this.selectedSquare = sq;
        this.board.highlightLegalMoves(this.legalMoves, sq);
        sounds.playSelect();
        return;
      }

      // Invalid move — deselect
      this.selectedSquare = null;
      this.board.clearHighlights();
      if (this.lastMoveFrom && this.lastMoveTo) {
        this.board.highlightLastMove(this.lastMoveFrom, this.lastMoveTo);
      }
    } else {
      // Select a piece
      if (this._isOwnPiece(sq)) {
        this.selectedSquare = sq;
        this.board.highlightLegalMoves(this.legalMoves, sq);
        sounds.playSelect();
      }
    }
  }

  _isPlayerTurn() {
    if (this.playerColor === 'white') return this.sideToMove === 'white';
    return this.sideToMove === 'black';
  }

  _isOwnPiece(sq) {
    const piece = this.pieces.find((p) => p.square === sq);
    if (!piece) return false;
    const currentSide = this.sideToMove;
    return piece.color === currentSide;
  }

  _checkPromotion(from, to, uci) {
    const piece = this.pieces.find((p) => p.square === from);
    if (!piece || piece.piece_type !== 'pawn') return null;

    const toRank = parseInt(to[1]);
    if ((piece.color === 'white' && toRank === 8) ||
        (piece.color === 'black' && toRank === 1)) {
      // Auto-promote to queen for now
      return uci + 'q';
    }
    return null;
  }

  async _makeMove(uci) {
    try {
      // Start timer on very first move
      if (!this._timerStarted) {
        this._timerStarted = true;
        this._startTimer();
      }

      const prevPieces = [...this.pieces];
      const data = await this.api.makeMove(this.gameId, uci);
      if (!data.success) return;

      // Track the move
      const fromSq = uci.substring(0, 2);
      const toSq = uci.substring(2, 4);
      this.lastMoveFrom = fromSq;
      this.lastMoveTo = toSq;

      // Track captures
      if (data.captured) {
        const capColor = this.sideToMove === 'white' ? 'black' : 'white';
        if (capColor === 'white') {
          this.capturedWhite.push(data.captured);
        } else {
          this.capturedBlack.push(data.captured);
        }
        sounds.playCapture();
      } else {
        sounds.playMove();
      }

      // Convert to algebraic notation
      const san = this._uciToSAN(uci, prevPieces, data.pieces, data.is_check, data.status, !!data.captured);
      this.moveHistory.push(san);

      // Animate the move
      this.board.animateMove(fromSq, toSq);

      // Update state from response
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.isCheck = data.is_check;
      this.status = data.status;
      this.sideToMove = this.sideToMove === 'white' ? 'black' : 'white';

      // Let animation play, then sync pieces
      setTimeout(() => {
        this.board.setPieces(this.pieces);
        this.board.clearHighlights();
        this.board.highlightLastMove(fromSq, toSq);

        if (this.isCheck) {
          // Find king square
          const king = this.pieces.find(
            (p) => p.piece_type === 'king' && p.color === this.sideToMove
          );
          if (king) this.board.highlightCheck(king.square);
          sounds.playCheck();
        }
      }, 220);

      this._updateUI();
      this._updateTutor(uci, data);

      // Check for game over
      if (this.status !== 'Active') {
        this._stopTimer();
        this._showGameOver();
        return;
      }

      // AI responds
      if (this.useAI && !this._isPlayerTurn()) {
        await this._aiMove();
      }
    } catch (err) {
      console.error('Move failed:', err);
    }
  }

  async _aiMove() {
    this.thinking = true;
    document.getElementById('thinking').style.display = 'block';

    try {
      // Try the neural network AI first
      const difficulty = document.getElementById('difficulty-select').value;
      let moveUci = null;

      const aiResult = await this.api.aiMove(this.fen, difficulty);
      if (aiResult && aiResult.move) {
        moveUci = aiResult.move;
      } else {
        // Fallback to engine alpha-beta
        const engineResult = await this.api.engineMove(this.gameId);
        if (engineResult && engineResult.success) {
          // Engine already made the move — refresh state
          const gameData = await this.api.getGame(this.gameId);
          const lastUci = engineResult.move_uci;
          this.lastMoveFrom = lastUci.substring(0, 2);
          this.lastMoveTo = lastUci.substring(2, 4);

          if (engineResult.captured) {
            const capColor = this.sideToMove === 'white' ? 'black' : 'white';
            if (capColor === 'white') this.capturedWhite.push(engineResult.captured);
            else this.capturedBlack.push(engineResult.captured);
            sounds.playCapture();
          } else {
            sounds.playMove();
          }

          const san = this._uciToSAN(lastUci, this.pieces, gameData.pieces, gameData.is_check, gameData.status, !!engineResult.captured);
          this.moveHistory.push(san);
          this.fen = gameData.fen;
          this.pieces = gameData.pieces;
          this.legalMoves = gameData.legal_moves;
          this.isCheck = gameData.is_check;
          this.status = gameData.status;
          this.sideToMove = gameData.side_to_move;

          this.board.setPieces(this.pieces);
          this.board.clearHighlights();
          this.board.highlightLastMove(this.lastMoveFrom, this.lastMoveTo);
          this._updateUI();

          if (this.status !== 'Active') this._showGameOver();
          return;
        }
      }

      if (moveUci) {
        // AI got a move from the NN service — now make it on the engine
        await this._makeAIMoveOnEngine(moveUci);
      }
    } catch (err) {
      console.error('AI move failed:', err);
      // Try engine fallback
      try {
        const engineResult = await this.api.engineMove(this.gameId);
        if (engineResult && engineResult.success) {
          const prevPieces2 = [...this.pieces];
          const gameData = await this.api.getGame(this.gameId);
          this.fen = gameData.fen;
          this.pieces = gameData.pieces;
          this.legalMoves = gameData.legal_moves;
          this.isCheck = gameData.is_check;
          this.status = gameData.status;
          this.sideToMove = gameData.side_to_move;
          const san2 = this._uciToSAN(engineResult.move_uci, prevPieces2, gameData.pieces, gameData.is_check, gameData.status, false);
          this.moveHistory.push(san2);

          this.board.setPieces(this.pieces);
          this._updateUI();
          if (this.status !== 'Active') this._showGameOver();
        }
      } catch (e2) {
        console.error('Engine fallback also failed:', e2);
      }
    } finally {
      this.thinking = false;
      document.getElementById('thinking').style.display = 'none';
    }
  }

  async _makeAIMoveOnEngine(uci) {
    // Start timer on first move (AI plays first)
    if (!this._timerStarted) {
      this._timerStarted = true;
      this._startTimer();
    }

    const prevPieces = [...this.pieces];
    const data = await this.api.makeMove(this.gameId, uci);
    if (!data.success) return;

    const fromSq = uci.substring(0, 2);
    const toSq = uci.substring(2, 4);
    this.lastMoveFrom = fromSq;
    this.lastMoveTo = toSq;

    if (data.captured) {
      const capColor = this.sideToMove === 'white' ? 'black' : 'white';
      if (capColor === 'white') this.capturedWhite.push(data.captured);
      else this.capturedBlack.push(data.captured);
      sounds.playCapture();
    } else {
      sounds.playMove();
    }

    const san = this._uciToSAN(uci, prevPieces, data.pieces, data.is_check, data.status, !!data.captured);
    this.moveHistory.push(san);
    this.board.animateMove(fromSq, toSq);

    this.fen = data.fen;
    this.pieces = data.pieces;
    this.legalMoves = data.legal_moves;
    this.isCheck = data.is_check;
    this.status = data.status;
    this.sideToMove = this.sideToMove === 'white' ? 'black' : 'white';

    setTimeout(() => {
      this.board.setPieces(this.pieces);
      this.board.clearHighlights();
      this.board.highlightLastMove(fromSq, toSq);
      if (this.isCheck) {
        const king = this.pieces.find(
          (p) => p.piece_type === 'king' && p.color === this.sideToMove
        );
        if (king) this.board.highlightCheck(king.square);
        sounds.playCheck();
      }
    }, 220);

    this._updateUI();
    this._updateTutor(uci, data);
    if (this.status !== 'Active') this._showGameOver();
  }

  // ── Chess Notation ──

  _uciToSAN(uci, piecesBefore, piecesAfter, isCheck, status, isCapture) {
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promo = uci.length > 4 ? uci[4] : null;

    // Castling detection
    const movingPiece = piecesBefore.find(p => p.square === from);
    if (movingPiece && movingPiece.piece_type === 'king') {
      const fromFile = from.charCodeAt(0) - 97;
      const toFile = to.charCodeAt(0) - 97;
      if (Math.abs(toFile - fromFile) === 2) {
        let san = toFile > fromFile ? 'O-O' : 'O-O-O';
        if (status && status.includes('Checkmate')) san += '#';
        else if (isCheck) san += '+';
        return san;
      }
    }

    if (!movingPiece) return uci; // fallback

    const PREFIXES = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '' };
    let prefix = PREFIXES[movingPiece.piece_type] || '';
    let capture = isCapture ? 'x' : '';

    // Disambiguation for non-pawn pieces
    if (prefix && prefix !== '') {
      const sameTypePieces = piecesBefore.filter(
        p => p.piece_type === movingPiece.piece_type &&
             p.color === movingPiece.color &&
             p.square !== from
      );
      // Check if any other piece of same type could also move to 'to'
      // Simplified: if multiple same-type pieces exist, add file or rank
      if (sameTypePieces.length > 0) {
        const sameFile = sameTypePieces.some(p => p.square[0] === from[0]);
        const sameRank = sameTypePieces.some(p => p.square[1] === from[1]);
        if (sameFile && sameRank) {
          prefix += from; // full square
        } else if (sameFile) {
          prefix += from[1]; // rank
        } else {
          prefix += from[0]; // file
        }
      }
    }

    // Pawn captures include the file
    if (movingPiece.piece_type === 'pawn' && capture) {
      prefix = from[0];
    }

    let san = prefix + capture + to;

    // Promotion
    if (promo) {
      const promoMap = { q: 'Q', r: 'R', b: 'B', n: 'N' };
      san += '=' + (promoMap[promo] || promo.toUpperCase());
    }

    // Check / checkmate
    if (status && status.includes('Checkmate')) {
      san += '#';
    } else if (isCheck) {
      san += '+';
    }

    return san;
  }

  // ── Chess Tutor ──

  _updateTutor(uci, data) {
    if (!this.tutorEnabled) return;
    const msgEl = document.getElementById('tutor-coach-content');
    if (!msgEl) return;

    const moveNum = this.moveHistory.length;
    const tips = [];

    // Opening phase advice (first 10 moves)
    if (moveNum <= 10) {
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const piece = (data.pieces || this.pieces).find(p => p.square === to) ||
                    this.pieces.find(p => p.square === from);

      if (moveNum <= 2) {
        tips.push({ tag: 'OPENING', text: 'Control the center with pawns (e4, d4, e5, d5).' });
      }
      if (moveNum >= 3 && moveNum <= 6) {
        const knights = this.pieces.filter(p => p.piece_type === 'knight' && p.color === this.playerColor);
        const bishops = this.pieces.filter(p => p.piece_type === 'bishop' && p.color === this.playerColor);
        const developedKnights = knights.filter(p => p.square[1] !== '1' && p.square[1] !== '8');
        const developedBishops = bishops.filter(p => p.square[1] !== '1' && p.square[1] !== '8');
        if (developedKnights.length < 2 || developedBishops.length < 1) {
          tips.push({ tag: 'TIP', text: 'Develop your knights and bishops before moving the same piece twice.' });
        }
      }
      if (moveNum >= 4 && moveNum <= 8) {
        const king = this.pieces.find(p => p.piece_type === 'king' && p.color === this.playerColor);
        if (king && (king.square === 'e1' || king.square === 'e8')) {
          tips.push({ tag: 'TIP', text: 'Consider castling soon to protect your king.' });
        }
      }
    }

    // Tactical awareness
    if (data.is_check) {
      if (this.sideToMove === this.playerColor) {
        tips.push({ tag: 'WARNING', text: 'You\'re in check! You must block, capture, or move the king.' });
      } else {
        tips.push({ tag: 'GREAT MOVE', text: 'You put the opponent in check!' });
      }
    }

    if (data.captured) {
      tips.push({ tag: 'CAPTURE', text: `A ${data.captured} was captured. Watch for recapture opportunities.` });
    }

    // Material check
    const pieceValues = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };
    let playerMat = 0, oppMat = 0;
    for (const p of this.pieces) {
      const v = pieceValues[p.piece_type] || 0;
      if (p.color === this.playerColor) playerMat += v;
      else oppMat += v;
    }
    const matDiff = playerMat - oppMat;
    if (matDiff >= 3) {
      tips.push({ tag: 'ADVANTAGE', text: `You're up +${matDiff} material. Simplify by trading pieces.` });
    } else if (matDiff <= -3) {
      tips.push({ tag: 'WARNING', text: `You're down ${matDiff} material. Look for tactical chances to recover.` });
    }

    // Game over
    if (data.status && data.status.includes('Checkmate')) {
      const winner = this.sideToMove === 'white' ? 'Black' : 'White';
      if (this.playerColor.charAt(0).toUpperCase() + this.playerColor.slice(1) === winner) {
        tips.push({ tag: 'VICTORY', text: 'Checkmate! Excellent game. Review your moves to see what worked.' });
      } else {
        tips.push({ tag: 'DEFEAT', text: 'Checkmate. Study the last few moves to see where it went wrong.' });
      }
    } else if (data.status && data.status !== 'Active') {
      tips.push({ tag: 'DRAW', text: 'Game drawn. Draws often happen when material is even.' });
    }

    // Middle game advice
    if (moveNum > 10 && moveNum <= 30 && !data.is_check && !data.captured) {
      const rooks = this.pieces.filter(p => p.piece_type === 'rook' && p.color === this.playerColor);
      const onOpenFile = rooks.some(r => {
        const file = r.square[0];
        return !this.pieces.some(p => p.piece_type === 'pawn' && p.square[0] === file);
      });
      if (rooks.length > 0 && !onOpenFile) {
        tips.push({ tag: 'TIP', text: 'Place your rooks on open or semi-open files for maximum activity.' });
      }
    }

    // Display
    if (tips.length === 0) {
      tips.push({ tag: 'TIP', text: 'Good move. Keep playing solidly!' });
    }

    msgEl.innerHTML = tips.map(t =>
      `<div class="tutor-tip"><span class="tutor-tag">${t.tag}</span> ${t.text}</div>`
    ).join('');
    msgEl.scrollTop = msgEl.scrollHeight;
  }

  async _undo() {
    // Undo last two moves (player + AI)
    // For now just refresh the game
    console.log('Undo not yet implemented');
  }

  async _pollLearningStatus() {
    try {
      const resp = await fetch('/api/ai/ai/learning');
      if (resp.ok) {
        const data = await resp.json();
        const countEl = document.getElementById('ai-learn-count');
        if (countEl && data.games_learned !== undefined) {
          const games = data.games_learned;
          const positions = data.total_positions_learned || 0;
          countEl.textContent = `${games} game${games !== 1 ? 's' : ''} · ${positions} pos`;
        }
      }
    } catch (e) {
      // AI service might be unavailable
    }
  }

  // ---- UI Updates ----

  _updateUI() {
    // Turn display
    const turnEl = document.getElementById('turn-display');
    const displaySide = this.sideToMove.charAt(0).toUpperCase() + this.sideToMove.slice(1);
    turnEl.textContent = `${displaySide} to move`;

    // Status info
    const infoEl = document.getElementById('status-info');
    if (this.isCheck) {
      infoEl.textContent = 'Check!';
    } else if (this.status !== 'Active') {
      infoEl.textContent = this.status;
    } else {
      infoEl.textContent = `Move ${Math.floor(this.moveHistory.length / 2) + 1}`;
    }

    // Move list
    this._updateMoveList();

    // Captured pieces
    this._updateCaptured();

    // Evaluation bar (approximate from material)
    this._updateEvalBar();

    // Timer highlight
    this._updateTimerDisplay();
  }

  _updateMoveList() {
    const container = document.getElementById('move-list');
    container.innerHTML = '';

    for (let i = 0; i < this.moveHistory.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const row = document.createElement('div');
      row.className = 'move-row';

      const numEl = document.createElement('span');
      numEl.className = 'move-num';
      numEl.textContent = `${moveNum}.`;
      row.appendChild(numEl);

      const whiteEl = document.createElement('span');
      whiteEl.className = 'move-white';
      whiteEl.textContent = this.moveHistory[i] || '';
      row.appendChild(whiteEl);

      if (i + 1 < this.moveHistory.length) {
        const blackEl = document.createElement('span');
        blackEl.className = 'move-black';
        blackEl.textContent = this.moveHistory[i + 1];
        row.appendChild(blackEl);
      }

      container.appendChild(row);
    }
    container.scrollTop = container.scrollHeight;
  }

  _updateCaptured() {
    const pieceValues = { king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, King: 0, Queen: 9, Rook: 5, Bishop: 3, Knight: 3, Pawn: 1 };
    const sort = (arr) => [...arr].sort((a, b) => (pieceValues[b] || 0) - (pieceValues[a] || 0));

    document.getElementById('captured-white').textContent =
      sort(this.capturedWhite).map((p) => PIECE_UNICODE[p] || p).join(' ');
    document.getElementById('captured-black').textContent =
      sort(this.capturedBlack).map((p) => PIECE_UNICODE[p] || p).join(' ');
  }

  _updateEvalBar() {
    // Simple material count from pieces
    const pieceValues = { king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, King: 0, Queen: 9, Rook: 5, Bishop: 3, Knight: 3, Pawn: 1 };
    let whiteVal = 0, blackVal = 0;
    for (const p of this.pieces) {
      const v = pieceValues[p.piece_type] || 0;
      if (p.color === 'white') whiteVal += v;
      else blackVal += v;
    }
    const diff = whiteVal - blackVal;
    const pct = Math.max(5, Math.min(95, 50 + diff * 3));

    document.getElementById('eval-bar').style.width = `${pct}%`;
    const sign = diff > 0 ? '+' : '';
    document.getElementById('eval-text').textContent = `${sign}${diff.toFixed(1)}`;
  }

  _showGameOver() {
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const msg = document.getElementById('overlay-message');

    let isWin = false;
    if (this.status.includes('Checkmate')) {
      const winner = this.sideToMove === 'white' ? 'Black' : 'White';
      title.textContent = 'Checkmate!';
      msg.textContent = `${winner} wins`;
      // Check if the player won
      const winnerColor = this.sideToMove === 'white' ? 'black' : 'white';
      isWin = winnerColor === this.playerColor;
    } else if (this.status.includes('Stalemate')) {
      title.textContent = 'Stalemate';
      msg.textContent = 'The game is a draw';
    } else if (this.status.includes('Draw')) {
      title.textContent = 'Draw';
      msg.textContent = this.status;
    } else {
      title.textContent = 'Game Over';
      msg.textContent = this.status;
    }

    overlay.style.display = 'block';
    sounds.playGameOver(isWin);

    // Confetti for wins or any checkmate
    if (isWin || this.status.includes('Checkmate')) {
      this.board.triggerConfetti();
    }
  }

  _showStatus(text) {
    document.getElementById('status-info').textContent = text;
  }

  // ── Move Timer ──

  _startTimer() {
    this._stopTimer();
    this._lastTimerTick = Date.now();
    this._timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this._lastTimerTick) / 1000;
      this._lastTimerTick = now;

      if (this.status !== 'Active') {
        this._stopTimer();
        return;
      }

      if (this.sideToMove === 'white') {
        this.whiteTime += elapsed;
      } else {
        this.blackTime += elapsed;
      }
      this._updateTimerDisplay();
    }, 100);
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  _updateTimerDisplay() {
    const fmt = (secs) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };
    const whiteEl = document.getElementById('timer-white');
    const blackEl = document.getElementById('timer-black');
    if (whiteEl) whiteEl.textContent = fmt(this.whiteTime);
    if (blackEl) blackEl.textContent = fmt(this.blackTime);

    // Highlight active timer
    const whiteRow = document.getElementById('timer-white-row');
    const blackRow = document.getElementById('timer-black-row');
    if (whiteRow) whiteRow.classList.toggle('active', this.sideToMove === 'white' && this.status === 'Active');
    if (blackRow) blackRow.classList.toggle('active', this.sideToMove === 'black' && this.status === 'Active');
  }
}

// ---- Bootstrap ----
const game = new ChessGame();
window.game = game;
