/**
 * 3D Chess — Main Game Controller v3
 *
 * Ties together the 3D board, API communication, UI controls,
 * sound effects, keyboard shortcuts, move timer, theme selector,
 * opening explorer, rating system, achievements, PGN export,
 * AI personalities, puzzle mode, game review, undo/redo,
 * multiplayer, daily puzzles, cosmetics, timed drills, and position editor.
 */
import { ChessBoard3D } from './board.js';
import { ChessAPI } from './api.js';
import { sounds } from './sounds.js';
import { identifyOpening, getAllOpenings, OPENING_CATEGORIES, getOpeningsByCategory } from './openings.js';
import { updateRating, getRating, getRankTitle } from './rating.js';
import { checkAchievements, getAllAchievements, getUnlockedCount, getTotalCount, triggerAchievement } from './achievements.js';
import { toPGN, downloadPGN, copyPGN, saveGame, loadHistory, formatGameSummary } from './pgn.js';
import { initBridge, isTauri, getAiBaseUrl } from './bridge.js';
import { MultiplayerManager, EMOTES } from './multiplayer.js';
import { getDailyPuzzle, isDailySolved, solveDailyPuzzle, getDailyStats } from './daily-puzzle.js';
import { PositionEditor, EDITOR_PIECES } from './editor.js';
import { TimedDrillSession, TIMED_DRILL_CONFIGS, getTimedDrillStats, getBestScore } from './timed-drills.js';
import { refreshUnlocks, addXP, getXPState, getCosmeticsState, PIECE_SETS, TITLES, BOARD_BACKGROUNDS, getActivePieceSet, setActivePieceSet, getActiveTitle, setActiveTitle, getActiveBackground, setActiveBackground, getUnlockedPieceSets, getUnlockedBoards, getUnlockedTitles, getUnlockedBackgrounds } from './cosmetics.js';

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

    // Undo/Redo
    this._fenHistory = [];    // Stack of FEN positions (before each move)
    this._moveHistoryUCI = []; // Parallel UCI move stack
    this._redoStack = [];     // Redo stack of { fen, uci, san, captured } objects
    this._capturedHistory = []; // Parallel stack: { piece, color } or null per move

    // Opening explorer
    this._currentOpening = null;

    // Game review
    this._fenLog = [];  // All FENs during the game for post-mortem review
    this._lastGameFenLog = [];   // Preserved copy for review after new game
    this._lastGameMoveHistory = [];
    this._hadPromotion = false;

    // AI Personality
    this.aiPersonality = 'default';

    // Game mode: 'normal' | 'training' | 'friendly'
    this.gameMode = 'normal';

    // Puzzle mode
    this._puzzleMode = false;
    this._currentPuzzle = null;
    this._puzzleMoveIndex = 0;
    this._solvedPuzzles = JSON.parse(localStorage.getItem('chess_solved_puzzles') || '[]');

    // Practice / drill mode
    this._drillMode = false;
    this._currentDrill = null;
    this._drillMoveIndex = 0;
    this._drillProgress = JSON.parse(localStorage.getItem('chess_drill_progress') || '{}');
    // { drillId: { completed: true, attempts: N } }

    // Pre-move system
    this._preMove = null; // { from, to } queued pre-move
    this._preMoveSelectedSquare = null;

    // Move quality badges (engine-evaluated, keyed by move index)
    this._moveQualities = {};

    // Clock mode
    this._clockMode = 'elapsed'; // 'elapsed' | '5' | '10' | '15' | '30'
    this._clockInitialTime = 0; // initial seconds for countdown modes

    // Drag and drop
    this._dragging = false;
    this._dragPieceSq = null;

    // Multiplayer
    this.multiplayer = new MultiplayerManager();
    this._multiplayerActive = false;

    // Variant
    this._gameVariant = 'standard';
    this._chess960Id = null;

    // Blindfold mode
    this._blindfoldMode = false;

    // Position editor
    this._editorMode = false;
    this._positionEditor = new PositionEditor();

    // Timed drill session
    this._timedDrillSession = null;

    // Daily puzzle
    this._dailyPuzzleMode = false;

    // Init 3D board
    const canvas = document.getElementById('chess-canvas');
    this.board = new ChessBoard3D(canvas);

    this._bindEvents();
    this._bindKeyboard();
    this._bindCameraControls();
    this._initThemeSelector();
    this._initVolumeControl();
    this._initTutor();
    this._initPersonalitySelector();
    this._initGameModeSelector();
    this._initRatingDisplay();
    this._initAchievementsPanel();
    this._initGameHistory();
    this._initPuzzlePanel();
    this._initPracticePanel();
    this._initStatsPanel();
    this._initClockModes();
    this._initDragAndDrop();
    this._initMultiplayer();
    this._initDailyPuzzle();
    this._initTimedDrills();
    this._initPositionEditor();
    this._initBlindfoldMode();
    this._initVariantSelector();
    this._initCosmeticsPanel();
    this._initLeaderboard();
    this._checkUrlParams();
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
    const redoBtn = document.getElementById('btn-redo');
    if (redoBtn) redoBtn.addEventListener('click', () => this._redo());
    const exportBtn = document.getElementById('btn-export-pgn');
    if (exportBtn) exportBtn.addEventListener('click', () => this._exportPGN());
    const reviewBtn = document.getElementById('btn-review');
    if (reviewBtn) reviewBtn.addEventListener('click', () => this._reviewGame());
    const analyzeBtn = document.getElementById('btn-analyze');
    if (analyzeBtn) analyzeBtn.addEventListener('click', () => this._toggleAnalysis());
    const attackMapBtn = document.getElementById('btn-attack-map');
    if (attackMapBtn) attackMapBtn.addEventListener('click', () => this._toggleAttackMap());
    const resignBtn = document.getElementById('btn-resign');
    if (resignBtn) resignBtn.addEventListener('click', () => this._resign());
    const offerDrawBtn = document.getElementById('btn-offer-draw');
    if (offerDrawBtn) offerDrawBtn.addEventListener('click', () => this._offerDraw());
    const copyFenBtn = document.getElementById('btn-copy-fen');
    if (copyFenBtn) copyFenBtn.addEventListener('click', () => this._copyFen());
    const openingsBtn = document.getElementById('btn-openings');
    if (openingsBtn) openingsBtn.addEventListener('click', () => this._showOpeningExplorer());
    const importPgnBtn = document.getElementById('btn-import-pgn');
    if (importPgnBtn) importPgnBtn.addEventListener('click', () => this._showImportPGN());
    const loadFenBtn = document.getElementById('btn-load-fen');
    if (loadFenBtn) loadFenBtn.addEventListener('click', () => this._loadFenInput());
    const fenInput = document.getElementById('fen-input');
    if (fenInput) fenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._loadFenInput(); });
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
        case 'h':
          e.preventDefault();
          this._requestHint();
          break;
        case 'a':
          e.preventDefault();
          this._toggleAnalysis();
          break;
        case 'v':
          e.preventDefault();
          this._toggleAttackMap();
          break;
        case 't':
          e.preventDefault();
          this._cycleGameMode();
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this._undo();
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this._redo();
          }
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

    // Free-rotate toggle
    const freeRotateToggle = document.getElementById('free-rotate-toggle');
    if (freeRotateToggle) {
      freeRotateToggle.addEventListener('change', (e) => {
        this.board.setFreeRotate(e.target.checked);
      });
    }
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
    const toggleCoach = () => {
      panel.classList.toggle('minimized');
      const icon = panel.querySelector('#tutor-minimize .minimize-icon');
      if (icon) icon.textContent = panel.classList.contains('minimized') ? '▲ Coach' : '▼ Hide';
    };
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCoach();
      });
    }
    // When minimized, clicking anywhere on the pill expands it
    panel.addEventListener('click', (e) => {
      if (panel.classList.contains('minimized')) {
        toggleCoach();
      }
    });

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

    // ── Hint button ──
    const hintBtn = document.getElementById('btn-hint');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => this._requestHint());
    }

    this._lessonsLoaded = false;
    this._hintTimeout = null;
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

  // ── Hint System ──

  async _requestHint() {
    const btn = document.getElementById('btn-hint');
    const status = document.getElementById('hint-status');

    // Guard: must be player's turn, game active, not thinking
    if (this.thinking || this.status !== 'Active') {
      if (status) status.textContent = 'Wait for your turn...';
      return;
    }
    if (!this._isPlayerTurn()) {
      if (status) status.textContent = 'Wait for your turn...';
      return;
    }
    if (!this.fen) {
      if (status) status.textContent = 'Start a game first!';
      return;
    }

    // Disable button while loading
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Analyzing position...';

    try {
      // Ask AI for the best move at a low simulation count (fast)
      const result = await this.api.aiMove(this.fen, 'beginner');

      if (result && result.move) {
        const fromSq = result.move.substring(0, 2);
        const toSq = result.move.substring(2, 4);

        // Clear existing highlights and show hint
        this.board.clearHighlights();
        this.board.highlightHint(fromSq, toSq);

        // Build a human-readable hint for the coach panel
        const piece = this.pieces.find(p => p.square === fromSq);
        const pieceName = piece ? piece.piece_type.charAt(0).toUpperCase() + piece.piece_type.slice(1) : 'Piece';
        const target = this.pieces.find(p => p.square === toSq);
        const isCapture = target && target.color !== (piece ? piece.color : '');

        let hintText = `Move <strong>${pieceName}</strong> from <strong>${fromSq}</strong> to <strong>${toSq}</strong>`;
        if (isCapture) {
          const capName = target.piece_type.charAt(0).toUpperCase() + target.piece_type.slice(1);
          hintText += ` (captures ${capName}!)`;
        }

        // Show top alternatives if available
        if (result.top_moves && result.top_moves.length > 1) {
          hintText += '<br><span style="color:var(--text-muted);font-size:0.72rem;">Also consider: ';
          hintText += result.top_moves.slice(1, 3).map(m => m.san || m.move).join(', ');
          hintText += '</span>';
        }

        if (status) status.textContent = '';

        // Add hint to coach content
        const coachEl = document.getElementById('tutor-coach-content');
        if (coachEl) {
          const tip = document.createElement('div');
          tip.className = 'tutor-tip';
          tip.innerHTML = `<span class="tutor-tag" style="background:rgba(0,229,255,0.15);color:#00e5ff;">💡 HINT</span> ${hintText}`;
          coachEl.appendChild(tip);
          coachEl.scrollTop = coachEl.scrollHeight;
        }

        // Auto-clear hint highlights after 5 seconds
        if (this._hintTimeout) clearTimeout(this._hintTimeout);
        this._hintTimeout = setTimeout(() => {
          this.board.clearHighlights();
          // Restore last move highlight if exists
          if (this.lastMoveFrom && this.lastMoveTo) {
            this.board.highlightLastMove(this.lastMoveFrom, this.lastMoveTo);
          }
        }, 5000);

        sounds.playSelect();
      } else {
        if (status) status.textContent = 'AI unavailable — try again';
      }
    } catch (err) {
      console.error('Hint request failed:', err);
      if (status) status.textContent = 'Error getting hint';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Best Moves Analysis / Simulation ──

  async _toggleAnalysis() {
    const panel = document.getElementById('analysis-panel');
    if (!panel) return;

    if (panel.style.display !== 'none' && panel.style.display !== '') {
      this._closeAnalysis();
      return;
    }

    await this._runAnalysis();
  }

  async _runAnalysis() {
    const panel = document.getElementById('analysis-panel');
    const statusEl = document.getElementById('analysis-status');
    const movesEl = document.getElementById('analysis-moves');
    const pvEl = document.getElementById('analysis-pv');
    if (!panel || !movesEl) return;

    if (!this.fen || this.status !== 'Active') {
      if (statusEl) statusEl.textContent = 'Start a game first!';
      panel.style.display = 'block';
      return;
    }

    panel.style.display = 'block';
    if (statusEl) statusEl.textContent = 'Analyzing position...';
    movesEl.innerHTML = '';
    if (pvEl) pvEl.style.display = 'none';

    // Store analysis state
    this._analysisActive = true;
    this._analysisData = null;
    this._analysisSelected = null;
    this._analysisSimulating = null;

    try {
      const result = await this.api.analyzePosition(this.fen, 5, 5);
      if (!result || !result.top_moves || result.top_moves.length === 0) {
        if (statusEl) statusEl.textContent = 'No moves to analyze.';
        return;
      }

      this._analysisData = result;
      const totalMoves = result.total_legal_moves || result.top_moves.length;
      if (statusEl) statusEl.textContent = `Showing top ${result.top_moves.length} of ${totalMoves} legal moves`;

      // Draw arrows on the board
      const arrowMoves = result.top_moves.map((m, i) => ({
        from: m.from, to: m.to, rank: i
      }));
      this.board.showAnalysisArrows(arrowMoves);

      // Render the move list
      this._renderAnalysisMoves(result.top_moves);

      // Wire close button
      const closeBtn = document.getElementById('analysis-close');
      if (closeBtn) closeBtn.onclick = () => this._closeAnalysis();

      sounds.playSelect();
    } catch (err) {
      console.error('Analysis failed:', err);
      if (statusEl) statusEl.textContent = 'Analysis failed — engine may be offline.';
    }
  }

  _renderAnalysisMoves(topMoves) {
    const movesEl = document.getElementById('analysis-moves');
    if (!movesEl) return;
    movesEl.innerHTML = '';

    topMoves.forEach((move, idx) => {
      const item = document.createElement('div');
      item.className = 'analysis-move-item';
      if (idx === 0) item.classList.add('active');
      item.dataset.index = idx;

      // Rank badge
      const rank = document.createElement('div');
      rank.className = `analysis-rank analysis-rank-${idx + 1}`;
      rank.textContent = idx + 1;

      // Move SAN (convert from UCI to readable)
      const san = document.createElement('span');
      san.className = 'analysis-move-san';
      san.textContent = this._uciToReadable(move);

      // Badges (capture, check)
      const badges = document.createElement('span');
      badges.className = 'analysis-move-badges';
      if (move.is_capture) {
        const b = document.createElement('span');
        b.className = 'analysis-badge capture';
        b.textContent = 'x';
        badges.appendChild(b);
      }
      if (move.is_check) {
        const b = document.createElement('span');
        b.className = 'analysis-badge check';
        b.textContent = '+';
        badges.appendChild(b);
      }

      // Simulate button
      const simBtn = document.createElement('button');
      simBtn.className = 'analysis-simulate-btn';
      simBtn.textContent = '👁 Preview';
      simBtn.title = 'Preview the board after this move';
      simBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._simulateAnalysisMove(idx);
      });

      // Eval score
      const evalSpan = document.createElement('span');
      evalSpan.className = 'analysis-move-eval';
      if (move.mate_in != null) {
        evalSpan.classList.add('mate');
        evalSpan.textContent = `M${Math.abs(move.mate_in)}`;
      } else {
        const cp = move.score_cp / 100;
        evalSpan.textContent = (cp >= 0 ? '+' : '') + cp.toFixed(1);
        evalSpan.classList.add(cp >= 0 ? 'positive' : 'negative');
      }

      item.appendChild(rank);
      item.appendChild(san);
      item.appendChild(badges);
      item.appendChild(simBtn);
      item.appendChild(evalSpan);

      // Click to highlight this move's arrow
      item.addEventListener('click', () => this._selectAnalysisMove(idx));

      // Hover to show PV
      item.addEventListener('mouseenter', () => this._showAnalysisPV(idx));

      movesEl.appendChild(item);
    });
  }

  _uciToReadable(move) {
    // Attempt to describe the move from its UCI and metadata
    const from = move.from.toUpperCase();
    const to = move.to.toUpperCase();
    // Try to find the piece at the from-square
    const piece = this.pieces.find(p => p.square === move.from);
    if (!piece) return `${from}-${to}`;
    const name = piece.piece_type.charAt(0).toUpperCase() + piece.piece_type.slice(1);
    const abbr = piece.piece_type === 'knight' ? 'N' :
                 piece.piece_type === 'pawn' ? '' :
                 name.charAt(0);
    const cap = move.is_capture ? 'x' : '';
    const check = move.is_check ? '+' : '';
    if (piece.piece_type === 'pawn' && move.is_capture) {
      return `${move.from[0]}x${to}${check}`;
    }
    return `${abbr}${cap}${to.toLowerCase()}${check}`;
  }

  _selectAnalysisMove(idx) {
    if (!this._analysisData) return;
    this._analysisSelected = idx;

    // Update UI
    const items = document.querySelectorAll('.analysis-move-item');
    items.forEach((el, i) => el.classList.toggle('active', i === idx));

    // Update arrows — highlight the selected move
    const arrowMoves = this._analysisData.top_moves.map((m, i) => ({
      from: m.from, to: m.to, rank: i
    }));
    this.board.showAnalysisArrows(arrowMoves, idx);

    this._showAnalysisPV(idx);
    sounds.playSelect();
  }

  _showAnalysisPV(idx) {
    const pvEl = document.getElementById('analysis-pv');
    const pvText = document.getElementById('analysis-pv-text');
    if (!pvEl || !pvText || !this._analysisData) return;

    const move = this._analysisData.top_moves[idx];
    if (!move || !move.principal_variation || move.principal_variation.length <= 1) {
      pvEl.style.display = 'none';
      return;
    }

    pvText.textContent = move.principal_variation.join(' → ');
    pvEl.style.display = 'block';
  }

  _simulateAnalysisMove(idx) {
    if (!this._analysisData) return;
    const move = this._analysisData.top_moves[idx];
    if (!move) return;

    const items = document.querySelectorAll('.analysis-move-item');
    const simBtns = document.querySelectorAll('.analysis-simulate-btn');

    if (this._analysisSimulating === idx) {
      // Toggle off — restore real position
      this._analysisSimulating = null;
      this.board._clearPreview();
      items.forEach(el => el.classList.remove('simulating'));
      simBtns.forEach(btn => btn.classList.remove('active'));
      return;
    }

    this._analysisSimulating = idx;
    items.forEach((el, i) => {
      el.classList.toggle('simulating', i === idx);
    });
    simBtns.forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });

    // Show ghost pieces for the resulting position
    if (move.resulting_pieces) {
      this.board.previewPosition(move.resulting_pieces);
    }

    sounds.playSelect();

    // Add coaching tip about the simulated move
    const coachEl = document.getElementById('tutor-coach-content');
    if (coachEl) {
      const readable = this._uciToReadable(move);
      let desc = `Simulating <strong>#${idx + 1}: ${readable}</strong>`;
      if (move.is_capture) desc += ' — captures a piece';
      if (move.is_check) desc += ' — gives check!';
      if (move.mate_in != null) desc += ` — checkmate in ${Math.abs(move.mate_in)}`;

      const tip = document.createElement('div');
      tip.className = 'tutor-tip';
      tip.innerHTML = `<span class="tutor-tag" style="background:rgba(0,255,136,0.15);color:#00ff88;">🔬 SIM</span> ${desc}`;
      coachEl.appendChild(tip);
      coachEl.scrollTop = coachEl.scrollHeight;
    }
  }

  _closeAnalysis() {
    const panel = document.getElementById('analysis-panel');
    if (panel) panel.style.display = 'none';
    this._analysisActive = false;
    this._analysisData = null;
    this._analysisSelected = null;
    this._analysisSimulating = null;
    this.board.clearAnalysis();

    // Restore last-move highlight
    if (this.lastMoveFrom && this.lastMoveTo) {
      this.board.highlightLastMove(this.lastMoveFrom, this.lastMoveTo);
    }
  }

  // ── Attack & Defense Map ──

  async _toggleAttackMap() {
    const btn = document.getElementById('btn-attack-map');
    if (this._attackMapActive) {
      this.board.clearAttackMap();
      this._attackMapActive = false;
      if (btn) { btn.textContent = 'Attack Map'; btn.classList.remove('active'); }
      return;
    }
    await this._refreshAttackMap();
    if (btn) { btn.textContent = 'Hide Map'; btn.classList.add('active'); }
  }

  async _refreshAttackMap() {
    if (!this.fen) return;
    try {
      const data = await this.api.getAttackMap(this.fen);
      this.board.showAttackMap(data);
      this._attackMapActive = true;
    } catch (e) {
      console.warn('Attack map unavailable:', e.message);
    }
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
    this.board.clearAttackMap();
    this._attackMapActive = false;
    const attackBtn = document.getElementById('btn-attack-map');
    if (attackBtn) { attackBtn.textContent = 'Attack Map'; attackBtn.classList.remove('active'); }
    this.status = 'Active';
    this.playerColor = document.getElementById('color-select').value;
    this.useAI = document.getElementById('use-ai').checked;

    // Preserve last game data for review
    if (this._fenLog.length > 1) {
      this._lastGameFenLog = [...this._fenLog];
      this._lastGameMoveHistory = [...this.moveHistory];
    }

    // Reset undo/redo
    this._fenHistory = [];
    this._moveHistoryUCI = [];
    this._redoStack = [];
    this._capturedHistory = [];
    this._fenLog = [];
    this._hadPromotion = false;
    this._currentOpening = null;
    this._puzzleMode = false;
    this._drillMode = false;
    this._currentDrill = null;
    this._drillMoveIndex = 0;

    // Restore AI if it was toggled off for puzzle/drill mode
    if (this._savedUseAI !== undefined) {
      this.useAI = this._savedUseAI;
      delete this._savedUseAI;
    }

    // Clear pre-move
    this._clearPreMove();

    // Close analysis if open
    this._closeAnalysis();

    // Reset move qualities
    this._moveQualities = {};

    // Reset timer for clock mode
    this._stopTimer();
    if (this._clockMode === 'elapsed') {
      this.whiteTime = 0;
      this.blackTime = 0;
    } else {
      this.whiteTime = this._clockInitialTime;
      this.blackTime = this._clockInitialTime;
    }
    this._updateTimerDisplay();

    // Hide overlay
    document.getElementById('overlay').style.display = 'none';

    // Keep review button enabled if there's a previous game to review
    const reviewBtn = document.getElementById('btn-review');
    if (reviewBtn && this._lastGameFenLog && this._lastGameFenLog.length >= 2) {
      reviewBtn.disabled = false;
    }

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
      this._updateUndoRedoButtons();

      // Log starting position
      this._fenLog.push(this.fen);

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

  async _onBoardClick(e) {
    if (this.thinking || this.status !== 'Active') return;
    if (this.animating) return;

    // Don't handle left-click if it's during orbit (right-click drag)
    if (e.button !== 0) return;

    const sq = this.board.getSquareAtScreen(e.clientX, e.clientY);
    if (!sq) return;

    // Clear annotations on left click
    if (this.board.clearAnnotations) this.board.clearAnnotations();

    const isPlayerTurn = this._isPlayerTurn();

    // Pre-move system: if it's not our turn, queue the pre-move
    if (!isPlayerTurn && this.useAI) {
      this._handlePreMoveClick(sq);
      return;
    }

    if (this.selectedSquare) {
      // Try to make a move
      const uci = this.selectedSquare + sq;
      // Check for promotion: if pawn moving to last rank
      const promoResult = this._checkPromotion(this.selectedSquare, sq, uci);

      if (promoResult instanceof Promise) {
        // Wait for user to choose promotion piece
        const promoUci = await promoResult;
        if (this.legalMoves.includes(promoUci)) {
          this._makeMove(promoUci);
          this.selectedSquare = null;
          return;
        }
      } else {
        const promoUci = promoResult;
        if (this.legalMoves.includes(promoUci || uci)) {
          this._makeMove(promoUci || uci);
          this.selectedSquare = null;
          return;
        }
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
      // Return a promise that resolves with the chosen promotion piece
      return new Promise((resolve) => {
        const dialog = document.getElementById('promotion-dialog');
        if (!dialog) { resolve(uci + 'q'); return; }

        // Update piece symbols for the correct color
        const isWhite = piece.color === 'white';
        const symbols = isWhite
          ? { q: '♕', r: '♖', b: '♗', n: '♘' }
          : { q: '♛', r: '♜', b: '♝', n: '♞' };
        dialog.querySelectorAll('.promo-piece').forEach(el => {
          el.textContent = symbols[el.dataset.piece];
        });

        dialog.style.display = 'block';

        const onClick = (e) => {
          const pieceEl = e.target.closest('.promo-piece');
          if (!pieceEl) return;
          dialog.style.display = 'none';
          dialog.removeEventListener('click', onClick);
          resolve(uci + pieceEl.dataset.piece);
        };
        dialog.addEventListener('click', onClick);
      });
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

      // Track for undo
      this._fenHistory.push(this.fen);
      this._moveHistoryUCI.push(uci);
      this._redoStack = []; // Clear redo on new move

      // Track promotion
      if (uci.length > 4) this._hadPromotion = true;

      const prevPieces = [...this.pieces];
      const data = await this.api.makeMove(this.gameId, uci);
      if (!data.success) {
        // Rollback tracking
        this._fenHistory.pop();
        this._moveHistoryUCI.pop();
        return;
      }

      // Log FEN for review
      this._fenLog.push(data.fen);

      // Close analysis panel when a move is made
      if (this._analysisActive) this._closeAnalysis();

      // Refresh attack map overlay if it's visible
      if (this._attackMapActive) this._refreshAttackMap();

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
        this._capturedHistory.push({ piece: data.captured, color: capColor });
        sounds.playCapture();
      } else {
        this._capturedHistory.push(null);
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
      this._updateOpening();
      this._updateUndoRedoButtons();

      // Live coaching — non-blocking, fires after every move in training/normal mode
      if (this.gameMode !== 'friendly' && !this._puzzleMode && !this._drillMode) {
        this._liveTutorAnalysis();
      }

      // Check for game over
      if (this.status !== 'Active') {
        this._stopTimer();
        this._showGameOver();
        this._onGameEnd();
        return;
      }

      // Puzzle mode: check the move first (don't let AI respond)
      if (this._puzzleMode && this._currentPuzzle) {
        this._checkPuzzleMove(uci);
        return;
      }

      // Drill / practice mode: check the move against drill solution
      if (this._drillMode && this._currentDrill) {
        this._checkDrillMove(uci);
        return;
      }

      // AI responds
      if (this.useAI && !this._isPlayerTurn()) {
        await this._aiMove();
        // Execute pre-move if one was queued
        if (this._preMove && this._isPlayerTurn() && this.status === 'Active') {
          await this._executePreMove();
        }
      }

      // Request NN evaluation (non-blocking)
      this._updateNNEval();

      // Training mode: auto-show hint for next move
      if ((this.gameMode === 'training' || this.gameMode === 'friendly') && this._isPlayerTurn() && this.status === 'Active') {
        setTimeout(() => this._requestHint(), 600);
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

      const aiResult = await this.api.aiMove(this.fen, difficulty, this.gameId, this.playerColor, this.aiPersonality);
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
        // Non-blocking move explanation in training mode
        if (this.gameMode !== 'friendly') this._explainAIMove(moveUci, aiResult);
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

  async _explainAIMove(uci, aiResult) {
    // Build a concise prompt from the move + eval context
    const eval_ = aiResult && aiResult.evaluation != null ? aiResult.evaluation.toFixed(2) : null;
    const topMoves = aiResult && aiResult.top_moves ? aiResult.top_moves.slice(0, 2).map(m => m.san || m.move).join(', ') : null;
    const prompt = `The AI just played ${uci}. In 1-2 short sentences, explain why this is a good move in this position. Be concrete (mention piece activity, threats, or structure). Evaluation: ${eval_ || 'unknown'}.`;

    try {
      const resp = await fetch(`${this._getAiBase()}/ai/tutor/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt, fen: this.fen }),
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const answer = data.answer || '';
      if (!answer) return;

      const coachEl = document.getElementById('tutor-coach-content');
      if (!coachEl) return;
      const div = document.createElement('div');
      div.className = 'tutor-tip';
      div.style.cssText = 'border-left:3px solid var(--accent-cyan);padding-left:8px;margin-bottom:4px;';
      div.innerHTML = `<span class="tutor-tag" style="background:var(--accent-cyan)22;color:var(--accent-cyan);">🤖 AI MOVE</span> ${answer}${topMoves ? `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:3px;">Considered: ${topMoves}</div>` : ''}`;
      coachEl.prepend(div);
      // Keep coach panel trim
      while (coachEl.children.length > 6) coachEl.removeChild(coachEl.lastChild);
    } catch (e) {
      // Silent — explanation is non-critical
    }
  }

  async _makeAIMoveOnEngine(uci) {
    // Start timer on first move (AI plays first)
    if (!this._timerStarted) {
      this._timerStarted = true;
      this._startTimer();
    }

    // Track for undo
    this._fenHistory.push(this.fen);
    this._moveHistoryUCI.push(uci);

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

    // Log FEN for review
    this._fenLog.push(data.fen);

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
    this._updateOpening();
    this._updateUndoRedoButtons();
    if (this.status !== 'Active') {
      this._showGameOver();
      this._onGameEnd();
    }
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

    // Training / Friendly mode: always add extra context about the last move
    if (this.gameMode === 'training' || this.gameMode === 'friendly') {
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const movedPiece = (data.pieces || this.pieces).find(p => p.square === to) ||
                          this.pieces.find(p => p.square === from);
      const pieceName = movedPiece ? movedPiece.piece_type.charAt(0).toUpperCase() + movedPiece.piece_type.slice(1) : 'Piece';
      const side = this.sideToMove === 'white' ? 'Black' : 'White';

      if (!this._isPlayerTurn()) {
        // This was the player's move — explain what it achieved
        tips.push({ tag: 'YOUR MOVE', text: `You moved <strong>${pieceName}</strong> ${from} → ${to}. ${data.captured ? 'Captured material! ' : ''}${data.is_check ? 'Check! Excellent pressure!' : 'Develop pieces and control the center.'}` });
      } else {
        // This was the AI's move — explain what the opponent did
        tips.push({ tag: 'OPPONENT', text: `${side} played <strong>${pieceName}</strong> ${from} → ${to}. ${data.captured ? 'They captured material. Look for counterplay!' : 'Consider how to respond to this move.'}` });
      }

      if (this.gameMode === 'training') {
        tips.push({ tag: 'TRAINING', text: 'Press <strong>H</strong> or click 💡 Show Hint to see the best move. A hint will auto-appear shortly.' });
      }
      if (this.gameMode === 'friendly') {
        tips.push({ tag: 'FRIENDLY', text: 'Take your time! Use ↩ Undo freely to try different moves and learn.' });
      }
    }

    msgEl.innerHTML = tips.map(t =>
      `<div class="tutor-tip"><span class="tutor-tag">${t.tag}</span> ${t.text}</div>`
    ).join('');
    msgEl.scrollTop = msgEl.scrollHeight;
  }

  async _undo() {
    // Undo exactly one move by restoring from FEN history
    if (this.thinking || this.status !== 'Active') return;
    if (this._fenHistory.length === 0) return;

    // Pop the last move's data
    const targetFen = this._fenHistory.pop();
    const undoneUci = this._moveHistoryUCI.pop();
    const undoneSan = this.moveHistory.pop();
    const undoneCap = this._capturedHistory.pop();
    this._fenLog.pop();

    // Save to redo stack so we can redo this move later
    this._redoStack.push({
      uci: undoneUci,
      san: undoneSan,
      captured: undoneCap,
    });

    // Reverse captured-piece tracking
    if (undoneCap) {
      if (undoneCap.color === 'white') {
        this.capturedWhite.pop();
      } else {
        this.capturedBlack.pop();
      }
    }

    try {
      // Create a new engine game at the target position
      const data = await this.api.newGame(targetFen);
      this.gameId = data.game_id;
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.sideToMove = this.moveHistory.length % 2 === 0 ? 'white' : 'black';
      this.isCheck = false;
      this.selectedSquare = null;

      // Restore last-move highlight from remaining history
      if (this._moveHistoryUCI.length > 0) {
        const prevUci = this._moveHistoryUCI[this._moveHistoryUCI.length - 1];
        this.lastMoveFrom = prevUci.substring(0, 2);
        this.lastMoveTo = prevUci.substring(2, 4);
      } else {
        this.lastMoveFrom = null;
        this.lastMoveTo = null;
      }

      this.board.clearHighlights();
      this.board.setPieces(this.pieces);
      if (this.lastMoveFrom && this.lastMoveTo) {
        this.board.highlightLastMove(this.lastMoveFrom, this.lastMoveTo);
      }
      this._updateUI();
      this._updateUndoRedoButtons();
      sounds.playSelect();
    } catch (err) {
      console.error('Undo failed:', err);
      // Rollback — re-push everything we popped
      const redoItem = this._redoStack.pop();
      this._fenHistory.push(targetFen);
      this._moveHistoryUCI.push(redoItem.uci);
      this.moveHistory.push(redoItem.san);
      this._capturedHistory.push(redoItem.captured);
      if (redoItem.captured) {
        if (redoItem.captured.color === 'white') {
          this.capturedWhite.push(redoItem.captured.piece);
        } else {
          this.capturedBlack.push(redoItem.captured.piece);
        }
      }
    }
  }

  async _redo() {
    if (this.thinking || this._redoStack.length === 0 || this.status !== 'Active') return;

    const redoItem = this._redoStack.pop();

    try {
      // Track state before replaying the move (for potential future undo)
      this._fenHistory.push(this.fen);
      this._moveHistoryUCI.push(redoItem.uci);
      this.moveHistory.push(redoItem.san);
      this._capturedHistory.push(redoItem.captured);

      // Replay the move on the engine
      const data = await this.api.makeMove(this.gameId, redoItem.uci);
      if (!data.success) {
        // Rollback tracking
        this._fenHistory.pop();
        this._moveHistoryUCI.pop();
        this.moveHistory.pop();
        this._capturedHistory.pop();
        this._redoStack.push(redoItem);
        return;
      }

      this._fenLog.push(data.fen);
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.isCheck = data.is_check;
      this.status = data.status;
      this.sideToMove = this.moveHistory.length % 2 === 0 ? 'white' : 'black';
      this.selectedSquare = null;

      // Restore captured-piece tracking
      if (redoItem.captured) {
        if (redoItem.captured.color === 'white') {
          this.capturedWhite.push(redoItem.captured.piece);
        } else {
          this.capturedBlack.push(redoItem.captured.piece);
        }
      }

      // Highlight the replayed move
      const fromSq = redoItem.uci.substring(0, 2);
      const toSq = redoItem.uci.substring(2, 4);
      this.lastMoveFrom = fromSq;
      this.lastMoveTo = toSq;

      this.board.clearHighlights();
      this.board.setPieces(this.pieces);
      this.board.highlightLastMove(fromSq, toSq);

      if (this.isCheck) {
        const king = this.pieces.find(
          (p) => p.piece_type === 'king' && p.color === this.sideToMove
        );
        if (king) this.board.highlightCheck(king.square);
      }

      this._updateUI();
      this._updateUndoRedoButtons();
      sounds.playSelect();
    } catch (err) {
      console.error('Redo failed:', err);
      // Rollback
      this._fenHistory.pop();
      this._moveHistoryUCI.pop();
      this.moveHistory.pop();
      this._capturedHistory.pop();
      this._redoStack.push(redoItem);
    }
  }

  _updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = this._fenHistory.length === 0 || this.status !== 'Active';
    if (redoBtn) redoBtn.disabled = this._redoStack.length === 0 || this.status !== 'Active';
  }

  // ── Opening Explorer ──

  _updateOpening() {
    const opening = identifyOpening(this._moveHistoryUCI);
    if (opening && (!this._currentOpening || opening.moves > this._currentOpening.moves)) {
      this._currentOpening = opening;
    }
    const el = document.getElementById('opening-display');
    if (el && this._currentOpening) {
      el.innerHTML = `<span class="opening-eco">${this._currentOpening.eco || ''}</span> ${this._currentOpening.name}`;
      el.title = this._currentOpening.desc || '';
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  // ── AI Personality Selector ──

  _initPersonalitySelector() {
    const sel = document.getElementById('personality-select');
    if (!sel) return;
    sel.addEventListener('change', (e) => {
      this.aiPersonality = e.target.value;
      sounds.playSelect();
    });
  }

  // ── Game Mode Selector (Normal / Training / Friendly) ──

  _initGameModeSelector() {
    const sel = document.getElementById('game-mode-select');
    if (!sel) return;

    sel.addEventListener('change', (e) => {
      this.gameMode = e.target.value;
      sounds.playSelect();

      // Toggle info banners
      const trainingInfo = document.getElementById('training-mode-info');
      const friendlyInfo = document.getElementById('friendly-mode-info');
      if (trainingInfo) trainingInfo.style.display = this.gameMode === 'training' ? 'block' : 'none';
      if (friendlyInfo) friendlyInfo.style.display = this.gameMode === 'friendly' ? 'block' : 'none';

      // Open coach panel automatically in training/friendly mode
      const tutorPanel = document.getElementById('tutor-panel');
      if (tutorPanel && (this.gameMode === 'training' || this.gameMode === 'friendly')) {
        tutorPanel.classList.remove('minimized');
        const icon = document.querySelector('#tutor-minimize .minimize-icon');
        if (icon) icon.textContent = '▼ Hide';
      }

      // In friendly mode AI is beginner and unlimited undo
      if (this.gameMode === 'friendly') {
        const diffSel = document.getElementById('difficulty-select');
        if (diffSel) diffSel.value = 'beginner';
      }
    });
  }

  _cycleGameMode() {
    const modes = ['normal', 'training', 'friendly'];
    const currentIndex = modes.indexOf(this.gameMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    const sel = document.getElementById('game-mode-select');
    if (sel) {
      sel.value = nextMode;
      sel.dispatchEvent(new Event('change'));
    }
  }

  // ── Player Rating Display ──

  _initRatingDisplay() {
    this._refreshRatingDisplay();
  }

  _refreshRatingDisplay() {
    const el = document.getElementById('player-rating');
    if (!el) return;
    const data = getRating();
    const rank = getRankTitle(data.rating);
    el.innerHTML = `<span class="rating-icon">${rank.icon}</span><span class="rating-value" style="color:${rank.color}">${data.rating}</span><span class="rating-rank">${rank.title}</span>`;
  }

  // ── Achievement Panel ──

  _initAchievementsPanel() {
    const btn = document.getElementById('btn-achievements');
    if (btn) {
      btn.addEventListener('click', () => this._showAchievements());
    }
    this._updateAchievementCount();
  }

  _updateAchievementCount() {
    const el = document.getElementById('achievement-count');
    if (el) {
      el.textContent = `${getUnlockedCount()}/${getTotalCount()}`;
    }
  }

  _showAchievements() {
    const all = getAllAchievements();
    const categories = {};
    for (const a of all) {
      const cat = a.category || 'other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(a);
    }

    let html = '<div class="achievements-grid">';
    const catNames = { milestones: '🏆 Milestones', streaks: '🔥 Streaks', difficulty: '⭐ Difficulty', special: '✨ Special', rating: '📈 Rating', learning: '📚 Learning' };
    for (const [cat, items] of Object.entries(categories)) {
      html += `<div class="achievement-category"><div class="achievement-cat-title">${catNames[cat] || cat}</div>`;
      for (const a of items) {
        const cls = a.unlocked ? 'unlocked' : 'locked';
        html += `<div class="achievement-item ${cls}" title="${a.desc}">
          <span class="achievement-icon">${a.icon}</span>
          <div class="achievement-info">
            <div class="achievement-title">${a.title}</div>
            <div class="achievement-desc">${a.desc}</div>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    this._showModal('Achievements', html);
  }

  _showAchievementToast(achievement) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `<span class="toast-icon">${achievement.icon}</span><div><strong>Achievement Unlocked!</strong><br>${achievement.title}</div>`;
    document.body.appendChild(toast);
    sounds.playAchievement();
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ── Game History Panel ──

  _initGameHistory() {
    const btn = document.getElementById('btn-history');
    if (btn) {
      btn.addEventListener('click', () => this._showGameHistory());
    }
  }

  _showGameHistory() {
    const history = loadHistory();
    if (history.length === 0) {
      this._showModal('Game History', '<p style="color:var(--text-muted);text-align:center;padding:20px;">No games played yet. Complete a game to see it here!</p>');
      return;
    }

    let html = '<div class="game-history-list">';
    for (const game of history) {
      const summary = formatGameSummary(game);
      const resultClass = game.result === 'win' ? 'result-win' : game.result === 'loss' ? 'result-loss' : 'result-draw';
      const changeStr = summary.ratingChange > 0 ? `+${summary.ratingChange}` : summary.ratingChange;
      html += `<div class="history-item">
        <div class="history-date">${summary.dateStr}</div>
        <div class="history-result ${resultClass}">${summary.resultText}</div>
        <div class="history-details">
          ${summary.moves} moves · ${summary.difficulty}
          ${summary.opening ? ` · ${summary.opening}` : ''}
          ${summary.ratingChange ? ` · <span class="${summary.ratingChange > 0 ? 'text-green' : 'text-red'}">${changeStr}</span>` : ''}
        </div>
        <button class="btn secondary history-pgn-btn" data-game-id="${game.id}">📋 PGN</button>
      </div>`;
    }
    html += '</div>';

    this._showModal('Game History', html);

    // Bind PGN copy buttons
    setTimeout(() => {
      document.querySelectorAll('.history-pgn-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const gameId = e.target.dataset.gameId;
          const game = history.find(g => g.id === gameId);
          if (game && game.moveHistory) {
            const pgn = toPGN({
              moveHistory: game.moveHistory,
              result: game.status || game.result,
              difficulty: game.difficulty,
              opening: game.opening,
              date: game.date,
              white: game.playerColor === 'white' ? 'Player' : 'AI',
              black: game.playerColor === 'black' ? 'Player' : 'AI',
            });
            copyPGN(pgn);
            e.target.textContent = '✓ Copied';
            setTimeout(() => { e.target.textContent = '📋 PGN'; }, 2000);
          }
        });
      });
    }, 100);
  }

  // ── PGN Export ──

  _exportPGN() {
    if (this.moveHistory.length === 0) return;
    const pgn = toPGN({
      moveHistory: this.moveHistory,
      result: this.status,
      difficulty: document.getElementById('difficulty-select').value,
      opening: this._currentOpening ? this._currentOpening.name : null,
      white: this.playerColor === 'white' ? 'Player' : 'AI',
      black: this.playerColor === 'black' ? 'Player' : 'AI',
    });
    downloadPGN(pgn, `chess_${new Date().toISOString().slice(0, 10)}.pgn`);
    sounds.playSelect();
  }

  // ── Game Review / Post-Mortem ──

  async _reviewGame() {
    // Use current game data, or fall back to last completed game
    let fenLog = this._fenLog.length >= 2 ? this._fenLog : this._lastGameFenLog;
    let moves = this._fenLog.length >= 2 ? this.moveHistory : this._lastGameMoveHistory;
    if (!fenLog || fenLog.length < 2) {
      this._showModal('Game Review', '<p style="color:var(--text-muted);text-align:center;padding:20px;">Play a game first to review it.</p>');
      return;
    }

    // Dismiss the game-over overlay if open
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';

    const reviewBtn = document.getElementById('btn-review');
    const overlayReviewBtn = document.getElementById('overlay-review-btn');
    if (reviewBtn) { reviewBtn.disabled = true; reviewBtn.textContent = 'Analyzing...'; }
    if (overlayReviewBtn) { overlayReviewBtn.disabled = true; overlayReviewBtn.textContent = 'Analyzing...'; }

    // Show progress modal while analyzing
    this._showModal('Game Review', `<div id="review-progress" style="text-align:center;padding:30px;">
      <div style="font-size:1.5rem;margin-bottom:12px;">Analyzing game...</div>
      <div style="color:var(--text-muted);">Evaluating <span id="review-pos-count">0</span> / ${fenLog.length} positions</div>
      <div style="margin-top:16px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
        <div id="review-progress-bar" style="height:100%;width:0%;background:var(--accent-cyan);transition:width 0.3s;"></div>
      </div>
    </div>`);

    try {
      const result = await this.api.reviewGame(fenLog, moves, (current, total) => {
        const countEl = document.getElementById('review-pos-count');
        const barEl = document.getElementById('review-progress-bar');
        if (countEl) countEl.textContent = current;
        if (barEl) barEl.style.width = `${Math.round((current / total) * 100)}%`;
      });
      if (result) {
        this._showReviewResults(result);
      } else {
        this._showModal('Game Review', '<p style="color:var(--text-muted);text-align:center;">Review failed. No moves to analyze.</p>');
      }
    } catch (e) {
      console.error('Review failed:', e);
      this._showModal('Game Review', '<p style="color:var(--text-muted);text-align:center;">Review failed: ' + (e.message || 'Unknown error') + '</p>');
    } finally {
      if (reviewBtn) { reviewBtn.disabled = false; reviewBtn.textContent = '📊 Review'; }
      if (overlayReviewBtn) { overlayReviewBtn.disabled = false; overlayReviewBtn.textContent = '📊 Review Game'; }
    }
  }

  _showReviewResults(result) {
    const classColors = {
      brilliant: { color: '#00e5ff', label: '!!' },
      good: { color: '#4ade80', label: '✓' },
      book: { color: '#8888aa', label: '·' },
      inaccuracy: { color: '#fbbf24', label: '?!' },
      mistake: { color: '#f97316', label: '?' },
      blunder: { color: '#ef4444', label: '??' },
      game_over: { color: '#888', label: '' },
    };

    const sourceLabel = result.source === 'engine' ? ' (Engine)' : '';
    let html = `<div class="review-summary">
      <div class="review-accuracy">${result.accuracy}%</div>
      <div class="review-label">Accuracy${sourceLabel}</div>
    </div>
    <div class="review-moves">`;

    for (let i = 0; i < result.evaluations.length; i++) {
      const ev = result.evaluations[i];
      const cls = classColors[ev.classification] || classColors.book;
      const moveNum = Math.floor(i / 2) + 1;
      const side = i % 2 === 0 ? 'W' : 'B';
      html += `<div class="review-move" style="border-left: 3px solid ${cls.color}">
        <span class="review-move-num">${moveNum}${side === 'W' ? '.' : '...'}</span>
        <span class="review-move-san">${ev.move || ''}</span>
        <span class="review-move-class" style="color:${cls.color}">${cls.label}</span>
        <span class="review-eval">${ev.evaluation > 0 ? '+' : ''}${ev.evaluation.toFixed(2)}</span>
      </div>`;
    }
    html += '</div>';

    this._showModal('Game Review', html);
  }

  // ── Game End Handler (rating, achievements, save, learn) ──

  _onGameEnd() {
    // Signal AI learning
    if (this.useAI) {
      this.api.gameComplete(this.gameId, this.status, this.playerColor);
    }

    // Determine result
    let result = 'draw';
    let isCheckmate = false;
    if (this.status.includes('Checkmate')) {
      isCheckmate = true;
      const winner = this.sideToMove === 'white' ? 'black' : 'white';
      result = winner === this.playerColor ? 'win' : 'loss';
    } else if (this.status.includes('Stalemate') || this.status.includes('Draw')) {
      result = 'draw';
    }

    const difficulty = document.getElementById('difficulty-select').value;

    // Update rating (skip in friendly mode)
    let ratingResult = { change: 0, newRating: getRating().rating };
    if (this.gameMode !== 'friendly') {
      ratingResult = updateRating(result, difficulty);
      this._refreshRatingDisplay();
    }

    // Play rating change sound
    if (ratingResult.change > 0) sounds.playRatingUp();
    else if (ratingResult.change < 0) sounds.playRatingDown();

    // Check achievements
    const newAchievements = checkAchievements({
      gameCompleted: true,
      result,
      isCheckmate,
      difficulty,
      moveCount: this.moveHistory.length,
      rating: ratingResult.newRating,
      hadPromotion: this._hadPromotion,
    });

    // Show achievement toasts
    for (const a of newAchievements) {
      this._showAchievementToast(a);
    }
    this._updateAchievementCount();

    // Save to game history
    saveGame({
      moveHistory: [...this.moveHistory],
      status: this.status,
      result,
      difficulty,
      playerColor: this.playerColor,
      opening: this._currentOpening ? this._currentOpening.name : null,
      moveCount: this.moveHistory.length,
      ratingChange: ratingResult.change,
      whiteTime: this.whiteTime,
      blackTime: this.blackTime,
    });

    // Show rating change in overlay
    const overlay = document.getElementById('overlay');
    if (overlay) {
      let ratingHtml = '';
      if (ratingResult.change !== 0) {
        const sign = ratingResult.change > 0 ? '+' : '';
        const color = ratingResult.change > 0 ? '#4ade80' : '#ef4444';
        ratingHtml = `<div class="overlay-rating" style="color:${color};font-size:1.1rem;margin-top:8px;">${sign}${ratingResult.change} Rating (${ratingResult.newRating})</div>`;
      }
      const msg = document.getElementById('overlay-message');
      if (msg) msg.insertAdjacentHTML('afterend', ratingHtml);
    }
  }

  // ── Pre-move System ──

  _handlePreMoveClick(sq) {
    if (!this._preMoveSelectedSquare) {
      // Select piece for pre-move
      const piece = this.pieces.find(p => p.square === sq);
      if (piece && piece.color === this.playerColor) {
        this._preMoveSelectedSquare = sq;
        this.board.highlightSquare(sq, 0x9966ff, 0.4, true);
        sounds.playSelect();
      }
    } else {
      // Complete pre-move
      const uci = this._preMoveSelectedSquare + sq;
      this._preMove = { from: this._preMoveSelectedSquare, to: sq, uci };
      this.board.clearHighlights();
      this.board.highlightSquare(this._preMoveSelectedSquare, 0x9966ff, 0.3);
      this.board.highlightSquare(sq, 0x9966ff, 0.3);
      if (this.lastMoveFrom && this.lastMoveTo) {
        this.board.highlightLastMove(this.lastMoveFrom, this.lastMoveTo);
      }
      this._preMoveSelectedSquare = null;
      const indicator = document.getElementById('premove-indicator');
      if (indicator) indicator.style.display = 'block';
    }
  }

  _clearPreMove() {
    this._preMove = null;
    this._preMoveSelectedSquare = null;
    const indicator = document.getElementById('premove-indicator');
    if (indicator) indicator.style.display = 'none';
  }

  async _executePreMove() {
    if (!this._preMove) return;
    const pm = this._preMove;
    this._clearPreMove();

    // Check if the pre-move is legal
    const promoResult = this._checkPromotion(pm.from, pm.to, pm.uci);
    let moveUci = pm.uci;
    if (promoResult instanceof Promise) {
      moveUci = await promoResult;
    } else if (promoResult) {
      moveUci = promoResult;
    }

    if (this.legalMoves.includes(moveUci)) {
      await this._makeMove(moveUci);
    } else {
      sounds.playIllegal();
    }
  }

  // ── Puzzle Mode ──

  _initPuzzlePanel() {
    const btn = document.getElementById('btn-puzzles');
    if (btn) btn.addEventListener('click', () => this._showPuzzleBrowser());
  }

  async _showPuzzleBrowser() {
    let puzzles = await this.api.getPuzzles(0, 3000, null, 20);

    // Fallback: built-in puzzle data when API is unavailable
    if (!puzzles || !puzzles.puzzles) {
      puzzles = { puzzles: this._getLocalPuzzles() };
    }

    if (!puzzles.puzzles || puzzles.puzzles.length === 0) {
      this._showModal('Puzzles', '<p style="color:var(--text-muted);text-align:center;padding:20px;">No puzzles available. Make sure the AI service is running for the full puzzle library.</p>');
      return;
    }

    let themes = [];
    try {
      const t = await fetch('/api/ai/ai/puzzles/themes/list');
      if (t.ok) themes = (await t.json()).themes || [];
    } catch (e) {}

    let html = '<div class="puzzle-container">';
    html += '<div class="puzzle-filter-row">';
    html += '<select id="puzzle-theme-filter"><option value="">All Themes</option>';
    for (const th of themes) html += `<option value="${th}">${th.charAt(0).toUpperCase() + th.slice(1)}</option>`;
    html += '</select></div>';
    html += '<div class="puzzle-list" id="puzzle-list-container">';

    for (const p of puzzles.puzzles) {
      const solved = this._solvedPuzzles.includes(p.id);
      html += `<div class="puzzle-item ${solved ? 'solved' : ''}" data-puzzle-id="${p.id}">
        <span class="puzzle-icon">🧩</span>
        <div>
          <div class="puzzle-name">${p.title}</div>
          <div class="puzzle-meta">Rating: ${p.rating} · ${(p.themes || (p.theme ? [p.theme] : [])).map(t => `<span class="puzzle-theme-tag">${t}</span>`).join(' ')}</div>
        </div>
        ${solved ? '<span class="puzzle-solved-badge">✓ Solved</span>' : ''}
      </div>`;
    }
    html += '</div></div>';

    this._showModal('Puzzles', html);

    setTimeout(() => {
      document.querySelectorAll('.puzzle-item').forEach(el => {
        el.addEventListener('click', () => this._startPuzzle(el.dataset.puzzleId));
      });
      const filter = document.getElementById('puzzle-theme-filter');
      if (filter) {
        filter.addEventListener('change', async () => {
          const theme = filter.value || null;
          const filtered = await this.api.getPuzzles(0, 3000, theme, 20);
          if (filtered && filtered.puzzles) {
            const container = document.getElementById('puzzle-list-container');
            if (container) {
              container.innerHTML = filtered.puzzles.map(p => {
                const solved = this._solvedPuzzles.includes(p.id);
                return `<div class="puzzle-item ${solved ? 'solved' : ''}" data-puzzle-id="${p.id}">
                  <span class="puzzle-icon">🧩</span>
                  <div>
                    <div class="puzzle-name">${p.title}</div>
                    <div class="puzzle-meta">Rating: ${p.rating} · ${(p.themes || (p.theme ? [p.theme] : [])).map(t => `<span class="puzzle-theme-tag">${t}</span>`).join(' ')}</div>
                  </div>
                  ${solved ? '<span class="puzzle-solved-badge">✓ Solved</span>' : ''}
                </div>`;
              }).join('');
              container.querySelectorAll('.puzzle-item').forEach(el => {
                el.addEventListener('click', () => this._startPuzzle(el.dataset.puzzleId));
              });
            }
          }
        });
      }
    }, 100);
  }

  async _startPuzzle(puzzleId) {
    // Close modal
    const existing = document.getElementById('feature-modal');
    if (existing) existing.remove();

    try {
      // Try API first, fall back to local data
      let puzzle = null;
      try {
        const resp = await fetch(`/api/ai/ai/puzzles/${puzzleId}`);
        if (resp.ok) puzzle = await resp.json();
      } catch (e) {
        console.warn('Puzzle API unavailable, using local data');
      }

      // Fallback to local puzzle data
      if (!puzzle) {
        puzzle = this._getLocalPuzzles().find(p => p.id === puzzleId);
      }
      if (!puzzle) return;

      this._puzzleMode = true;
      this._currentPuzzle = puzzle;
      this._puzzleMoveIndex = 0;
      this._savedUseAI = this.useAI;
      this.useAI = false; // Disable AI auto-response during puzzles

      // Load the puzzle FEN position
      const data = await this.api.newGame(puzzle.fen);
      this.gameId = data.game_id;
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.sideToMove = puzzle.fen.includes(' w ') ? 'white' : 'black';
      this.playerColor = this.sideToMove;
      this.status = 'Active';
      this.moveHistory = [];

      this.board.clearHighlights();
      this.board.setPieces(this.pieces);
      this._updateUI();

      // Show puzzle info in coach panel
      const coachEl = document.getElementById('tutor-coach-content');
      if (coachEl) {
        coachEl.innerHTML = `
          <div class="tutor-tip"><span class="tutor-tag gold">🧩 PUZZLE</span> <strong>${puzzle.title}</strong></div>
          <div class="tutor-tip">${puzzle.description || 'Find the best move!'}</div>
          <div class="tutor-tip" style="font-size:0.7rem;color:var(--text-muted);">Rating: ${puzzle.rating} · Theme: ${puzzle.theme || 'general'}</div>
        `;
      }
      // Open coach panel
      const tutorPanel = document.getElementById('tutor-panel');
      if (tutorPanel) tutorPanel.classList.remove('minimized');

      // Show puzzle info bar
      this._showPuzzleStatus(`🧩 ${puzzle.title} — Find the best move!`, 'info');
    } catch (e) {
      console.error('Failed to start puzzle:', e);
    }
  }

  _showPuzzleStatus(text, type) {
    // Remove existing
    const existing = document.getElementById('puzzle-status-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'puzzle-status-bar';
    bar.className = `puzzle-status ${type}`;
    bar.textContent = text;
    bar.style.position = 'absolute';
    bar.style.top = '16px';
    bar.style.left = '16px';
    bar.style.zIndex = '60';
    bar.style.minWidth = '200px';
    bar.style.maxWidth = 'calc(100% - 400px)';
    document.getElementById('canvas-container').appendChild(bar);

    if (type === 'correct' || type === 'wrong') {
      setTimeout(() => bar.remove(), 3000);
    }
  }

  async _checkPuzzleMove(uci) {
    if (!this._currentPuzzle) return false;

    try {
      // Try API first
      let result = await this.api.checkPuzzleMove(
        this._currentPuzzle.id,
        this._puzzleMoveIndex,
        uci
      );

      // Fallback: check locally if API is unavailable
      if (!result && this._currentPuzzle._solution) {
        const solution = this._currentPuzzle._solution;
        const correct = this._puzzleMoveIndex < solution.length && uci === solution[this._puzzleMoveIndex];
        const isComplete = correct && this._puzzleMoveIndex === solution.length - 1;
        let nextMove = null;
        if (correct && !isComplete && this._puzzleMoveIndex + 1 < solution.length) {
          nextMove = solution[this._puzzleMoveIndex + 1];
        }
        result = { correct, completed: isComplete, next_move: nextMove };
      }

      if (!result) {
        this._showPuzzleStatus('Could not check move — service unavailable', 'wrong');
        return false;
      }

      if (result && result.correct) {
        this._puzzleMoveIndex++;
        sounds.playPuzzleCorrect();

        if (result.completed) {
          this._showPuzzleStatus('✅ Puzzle Solved! Excellent!', 'correct');
          if (!this._solvedPuzzles.includes(this._currentPuzzle.id)) {
            this._solvedPuzzles.push(this._currentPuzzle.id);
            localStorage.setItem('chess_solved_puzzles', JSON.stringify(this._solvedPuzzles));
          }
          this._puzzleMode = false;
          this._currentPuzzle = null;
          // Restore AI setting
          if (this._savedUseAI !== undefined) {
            this.useAI = this._savedUseAI;
            delete this._savedUseAI;
          }

          // Show congratulations in coach
          const coachEl = document.getElementById('tutor-coach-content');
          if (coachEl) {
            coachEl.innerHTML += `<div class="tutor-tip"><span class="tutor-tag success">✅ SOLVED</span> Great work! Click 🧩 Puzzles to try another one.</div>`;
          }
        } else if (result.next_move) {
          this._showPuzzleStatus('✓ Correct! Opponent responds...', 'correct');
          // Opponent's reply
          setTimeout(async () => {
            await this._makeMove(result.next_move);
            this._puzzleMoveIndex++;
            this._showPuzzleStatus('Your turn — find the next move!', 'info');
          }, 800);
        }
        return true;
      } else {
        sounds.playPuzzleWrong();
        this._showPuzzleStatus('✗ Not the best move. Try again!', 'wrong');
        return false;
      }
    } catch (e) {
      console.error('Puzzle check failed:', e);
      return false;
    }
  }

  // ── Local Puzzle Fallback (when API is unavailable) ──

  _getLocalPuzzles() {
    return [
      { id: 'p001', title: "Scholar's Mate", rating: 800, theme: 'checkmate',
        description: 'White can deliver checkmate in one move!',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
        _solution: ['h5f7'] },
      { id: 'p002', title: 'Free Pawn', rating: 800, theme: 'capture',
        description: 'Capture the undefended pawn in the center.',
        fen: 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/3B4/PPPP1PPP/RNBQK1NR w KQkq d6 0 3',
        _solution: ['e4d5'] },
      { id: 'p003', title: 'Undefended Pawn', rating: 850, theme: 'tactics',
        description: 'The e5 pawn is only defended by the queen. Win material!',
        fen: 'rnb1kbnr/ppppqppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 3',
        _solution: ['f3e5'] },
      { id: 'p005', title: "Fool's Mate", rating: 850, theme: 'checkmate',
        description: "Punish White's weak king position with checkmate!",
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
        _solution: ['d8h4'] },
      { id: 'p004', title: 'Knight Attack', rating: 900, theme: 'attack',
        description: 'Attack the weak f7 square with your knight!',
        fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        _solution: ['f3g5'] },
      { id: 'p006', title: 'Bishop Sacrifice on f7', rating: 1200, theme: 'sacrifice',
        description: 'Sacrifice the bishop to expose the king, then attack!',
        fen: 'r2qk2r/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/3P1N2/PPP2PPP/RN1QK2R w KQkq - 2 6',
        _solution: ['c4f7', 'e8f7', 'f3g5'] },
      { id: 'p015', title: 'Castle Now!', rating: 1200, theme: 'safety',
        description: 'Secure your king before launching an attack.',
        fen: 'r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 2 7',
        _solution: ['e1g1'] },
      { id: 'p010', title: 'Opening Trap', rating: 1250, theme: 'opening_trap',
        description: 'Recapture to get a strong attacking position.',
        fen: 'rnbq1rk1/pp3ppp/4pn2/3p4/1bPP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 2 6',
        _solution: ['c4d5', 'e6d5', 'f1d3'] },
    ];
  }

  // ── Practice / Drill Mode ──

  _initPracticePanel() {
    const btn = document.getElementById('btn-practice');
    if (btn) btn.addEventListener('click', () => this._showPracticeMenu());
  }

  async _showPracticeMenu() {
    // Try to load categories from AI service
    let categories = null;
    try {
      const data = await this.api.getDrillCategories();
      if (data && data.categories) categories = data.categories;
    } catch (e) {}

    // Fallback built-in categories
    if (!categories) {
      categories = [
        { id: 'fork',      name: 'Forks',              icon: '🍴', description: 'Attack two pieces at once to win material.',        count: 5, color: '#f59e0b' },
        { id: 'pin',       name: 'Pins',               icon: '📌', description: 'Pin a piece to the king or a more valuable piece.', count: 3, color: '#3b82f6' },
        { id: 'skewer',    name: 'Skewers',            icon: '⚔️', description: 'Force a valuable piece to move, win what\'s behind.', count: 3, color: '#8b5cf6' },
        { id: 'discovery', name: 'Discovered Attacks', icon: '💥', description: 'Move one piece to unleash a hidden attack.',        count: 3, color: '#ef4444' },
        { id: 'back_rank', name: 'Back Rank Mates',    icon: '🏰', description: 'Exploit a weak back rank to deliver checkmate.',    count: 3, color: '#10b981' },
        { id: 'checkmate', name: 'Checkmate Patterns', icon: '♟️', description: 'Classic mating patterns you must know.',            count: 4, color: '#ec4899' },
        { id: 'opening',   name: 'Opening Principles', icon: '📖', description: 'Master the fundamentals of the opening phase.',     count: 4, color: '#06b6d4' },
        { id: 'endgame',   name: 'Endgame Technique',  icon: '🏁', description: 'Key endgame positions every player must know.',     count: 4, color: '#84cc16' },
      ];
    }

    // Build category cards
    let html = `
      <div style="padding:4px 0 12px;">
        <p style="color:var(--text-muted);font-size:0.8rem;margin:0 0 16px;">
          Choose a category to practice. Each drill shows a real position — find the correct move to complete the tactic.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
    `;

    for (const cat of categories) {
      const done = this._countDrillsDone(cat.id);
      const total = cat.count || 0;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      html += `
        <div class="practice-cat-card" data-cat-id="${cat.id}"
             style="border:1px solid ${cat.color}33;border-radius:10px;padding:12px;cursor:pointer;
                    background:${cat.color}11;transition:background 0.2s;">
          <div style="font-size:1.5rem;margin-bottom:6px;">${cat.icon}</div>
          <div style="font-weight:600;font-size:0.85rem;color:var(--text);">${cat.name}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);margin:4px 0 8px;">${cat.description}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;height:4px;background:var(--surface-2);border-radius:2px;">
              <div style="width:${pct}%;height:100%;background:${cat.color};border-radius:2px;"></div>
            </div>
            <span style="font-size:0.65rem;color:var(--text-muted);">${done}/${total}</span>
          </div>
        </div>
      `;
    }

    html += '</div></div>';
    this._showModal('🎯 Practice Mode', html);

    setTimeout(() => {
      document.querySelectorAll('.practice-cat-card').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = el.style.borderColor.replace('33)', '22)'));
        el.addEventListener('mouseleave', () => el.style.background = el.style.borderColor.replace('22)', '11)'));
        el.addEventListener('click', () => this._showDrillList(el.dataset.catId, categories));
      });
    }, 80);
  }

  async _showDrillList(categoryId, categories) {
    const cat = categories.find(c => c.id === categoryId) || { name: categoryId, icon: '🎯', color: '#888' };

    let drills = null;
    try {
      const data = await this.api.getDrillsByCategory(categoryId);
      if (data && data.drills) drills = data.drills;
    } catch (e) {}

    if (!drills || drills.length === 0) {
      this._showModal('🎯 Practice', `<p style="color:var(--text-muted);padding:20px;text-align:center;">No drills found. Make sure the AI service is running.</p>`);
      return;
    }

    let html = `
      <div>
        <button id="practice-back-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.8rem;margin-bottom:12px;">← Back to categories</button>
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:4px;">${cat.icon} ${cat.name}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:16px;">${drills.length} drill${drills.length !== 1 ? 's' : ''} — click one to start</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
    `;

    for (const drill of drills) {
      const progress = this._drillProgress[drill.id];
      const done = progress && progress.completed;
      const attempts = progress ? progress.attempts : 0;
      html += `
        <div class="drill-list-item" data-drill-id="${drill.id}"
             style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;
                    background:var(--surface-2);cursor:pointer;border:1px solid ${done ? cat.color + '66' : 'transparent'};">
          <div style="font-size:1.2rem;">${done ? '✅' : '⬜'}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.85rem;">${drill.title}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">
              Rating ${drill.rating} · ${drill.tactic ? drill.tactic.replace(/_/g,' ') : ''}
              ${attempts > 0 ? ` · ${attempts} attempt${attempts !== 1 ? 's' : ''}` : ''}
            </div>
          </div>
          ${done ? `<span style="font-size:0.65rem;color:${cat.color};font-weight:700;">DONE</span>` : ''}
        </div>
      `;
    }

    html += '</div></div>';
    this._showModal(`🎯 ${cat.name}`, html);

    setTimeout(() => {
      const backBtn = document.getElementById('practice-back-btn');
      if (backBtn) backBtn.addEventListener('click', () => this._showPracticeMenu());

      document.querySelectorAll('.drill-list-item').forEach(el => {
        el.addEventListener('click', () => this._startDrill(el.dataset.drillId, drills));
      });
    }, 80);
  }

  async _startDrill(drillId, drillsCache = null) {
    // Close modal
    const modal = document.getElementById('feature-modal');
    if (modal) modal.remove();

    // Load drill data (from cache or API)
    let drill = drillsCache ? drillsCache.find(d => d.id === drillId) : null;
    if (!drill) {
      try {
        drill = await this.api.getDrill(drillId);
      } catch (e) {}
    }
    if (!drill) {
      this._showPuzzleStatus('Could not load drill — AI service unavailable', 'wrong');
      return;
    }

    try {
      this._drillMode = true;
      this._currentDrill = drill;
      this._drillMoveIndex = 0;
      this._savedUseAI = this.useAI;
      this.useAI = false;

      // Track attempts
      if (!this._drillProgress[drillId]) this._drillProgress[drillId] = { completed: false, attempts: 0 };
      this._drillProgress[drillId].attempts++;
      localStorage.setItem('chess_drill_progress', JSON.stringify(this._drillProgress));

      // Load the drill FEN
      const data = await this.api.newGame(drill.fen);
      this.gameId = data.game_id;
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.sideToMove = drill.fen.split(' ')[1] === 'w' ? 'white' : 'black';
      this.playerColor = this.sideToMove;
      this.status = 'Active';
      this.moveHistory = [];

      this.board.clearHighlights();
      this.board.setPieces(this.pieces);
      this._updateUI();

      // Category info for color
      const catColors = { fork:'#f59e0b', pin:'#3b82f6', skewer:'#8b5cf6', discovery:'#ef4444',
                          back_rank:'#10b981', checkmate:'#ec4899', opening:'#06b6d4', endgame:'#84cc16' };
      const catColor = catColors[drill.category] || 'var(--accent)';
      const catIcons = { fork:'🍴', pin:'📌', skewer:'⚔️', discovery:'💥', back_rank:'🏰',
                         checkmate:'♟️', opening:'📖', endgame:'🏁' };
      const catIcon = catIcons[drill.category] || '🎯';

      // Show drill info in coach panel
      const coachEl = document.getElementById('tutor-coach-content');
      if (coachEl) {
        coachEl.innerHTML = `
          <div class="tutor-tip">
            <span class="tutor-tag" style="background:${catColor}33;color:${catColor};border:1px solid ${catColor}55;">
              ${catIcon} ${(drill.category || 'drill').replace(/_/g,' ').toUpperCase()}
            </span>
            <strong style="margin-left:6px;">${drill.title}</strong>
          </div>
          <div class="tutor-tip" style="margin-top:6px;">${drill.hint || 'Find the best move!'}</div>
          <div class="tutor-tip" style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Rating: ${drill.rating} · ${(drill.tactic || '').replace(/_/g,' ')}</div>
          <div style="margin-top:10px;">
            <button id="drill-hint-btn" class="btn secondary" style="font-size:0.72rem;padding:3px 8px;">💡 Show Hint</button>
            <button id="drill-skip-btn" class="btn secondary" style="font-size:0.72rem;padding:3px 8px;margin-left:6px;">⏭ Skip</button>
          </div>
        `;
        const tutorPanel = document.getElementById('tutor-panel');
        if (tutorPanel) tutorPanel.classList.remove('minimized');

        setTimeout(() => {
          const hintBtn = document.getElementById('drill-hint-btn');
          if (hintBtn) hintBtn.addEventListener('click', () => {
            const tip = document.createElement('div');
            tip.className = 'tutor-tip';
            tip.style.cssText = 'margin-top:8px;padding:8px;background:var(--surface-2);border-radius:6px;font-size:0.75rem;';
            tip.textContent = `💡 ${drill.hint}`;
            coachEl.appendChild(tip);
            hintBtn.remove();
          });
          const skipBtn = document.getElementById('drill-skip-btn');
          if (skipBtn) skipBtn.addEventListener('click', () => {
            this._drillMode = false;
            this._currentDrill = null;
            if (this._savedUseAI !== undefined) { this.useAI = this._savedUseAI; delete this._savedUseAI; }
            this._showPuzzleStatus('Drill skipped.', 'info');
            setTimeout(() => this._showPracticeMenu(), 800);
          });
        }, 100);
      }

      this._showPuzzleStatus(`🎯 ${drill.title} — ${drill.hint}`, 'info');
    } catch (e) {
      console.error('Failed to start drill:', e);
      this._drillMode = false;
    }
  }

  async _checkDrillMove(uci) {
    if (!this._currentDrill) return false;

    // Optimistically count the move
    const drillId = this._currentDrill.id;

    try {
      const result = await this.api.checkDrillMove(drillId, this._drillMoveIndex, uci);

      if (!result) {
        this._showPuzzleStatus('Could not check move — service unavailable', 'wrong');
        return false;
      }

      if (result.correct) {
        this._drillMoveIndex++;
        sounds.playPuzzleCorrect();

        if (result.completed) {
          // Mark as completed
          if (!this._drillProgress[drillId]) this._drillProgress[drillId] = { completed: false, attempts: 1 };
          this._drillProgress[drillId].completed = true;
          localStorage.setItem('chess_drill_progress', JSON.stringify(this._drillProgress));

          this._showPuzzleStatus('✅ Excellent! Tactic mastered!', 'correct');
          this._drillMode = false;
          if (this._savedUseAI !== undefined) { this.useAI = this._savedUseAI; delete this._savedUseAI; }

          // Show explanation in coach
          const coachEl = document.getElementById('tutor-coach-content');
          if (coachEl && result.explanation) {
            const expDiv = document.createElement('div');
            expDiv.className = 'tutor-tip';
            expDiv.style.cssText = 'margin-top:10px;padding:10px;background:var(--surface-2);border-radius:6px;font-size:0.75rem;border-left:3px solid #10b981;';
            expDiv.innerHTML = `<strong style="color:#10b981;">✅ Well done!</strong><br><br>${result.explanation}`;
            coachEl.appendChild(expDiv);

            // Add "Next drill" button
            const nextDiv = document.createElement('div');
            nextDiv.style.marginTop = '10px';
            nextDiv.innerHTML = `<button id="drill-next-btn" class="btn secondary" style="font-size:0.75rem;">🎯 Next Drill</button>`;
            coachEl.appendChild(nextDiv);
            setTimeout(() => {
              const nb = document.getElementById('drill-next-btn');
              if (nb) nb.addEventListener('click', () => this._showPracticeMenu());
            }, 100);
          }
        } else if (result.next_move) {
          this._showPuzzleStatus('✓ Correct! Opponent responds...', 'correct');
          setTimeout(async () => {
            await this._makeMove(result.next_move);
            this._drillMoveIndex++;
            this._showPuzzleStatus('Keep going — find the next move!', 'info');
          }, 800);
        }
        return true;
      } else {
        sounds.playPuzzleWrong();
        this._showPuzzleStatus('✗ Not quite right. Look at the hint and try again!', 'wrong');
        return false;
      }
    } catch (e) {
      console.error('Drill check error:', e);
      return false;
    }
  }

  _countDrillsDone(_categoryId) {
    // Count completed drills from local progress cache.
    // Full category filtering requires the drill list; total is fine for progress display.
    return Object.values(this._drillProgress)
      .filter(p => p.completed)
      .length;
  }

  // ── Opening Explorer ──

  _showOpeningExplorer(activeCatId = null) {
    const cats = OPENING_CATEGORIES;

    // Build tab bar + content
    let tabsHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">';
    for (const cat of cats) {
      const active = cat.id === activeCatId;
      tabsHtml += `<button class="opening-cat-tab btn secondary" data-cat="${cat.id}"
        style="font-size:0.72rem;padding:4px 10px;border:1px solid ${cat.color}55;
               ${active ? `background:${cat.color}33;color:${cat.color};` : ''}">
        ${cat.icon} ${cat.name.split(' ')[0]}
      </button>`;
    }
    tabsHtml += '</div>';

    let contentHtml = '';
    if (activeCatId) {
      const entries = getOpeningsByCategory(activeCatId);
      const cat = cats.find(c => c.id === activeCatId);
      contentHtml += `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">${cat.name} — ${entries.length} openings</div>`;
      contentHtml += '<div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;">';
      for (const o of entries) {
        const moveStr = o.moves.join(' ');
        contentHtml += `
          <div class="opening-entry" data-moves="${moveStr}"
               style="padding:8px 10px;border-radius:8px;background:var(--surface-2);
                      border:1px solid transparent;cursor:pointer;">
            <div style="display:flex;align-items:baseline;gap:8px;">
              <span style="font-weight:600;font-size:0.82rem;">${o.name}</span>
              ${o.eco ? `<span style="font-size:0.65rem;color:${cat.color};background:${cat.color}22;padding:1px 5px;border-radius:4px;">${o.eco}</span>` : ''}
              <span style="font-size:0.65rem;color:var(--text-muted);margin-left:auto;">${o.moves.length} moves</span>
            </div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:3px;">${o.desc}</div>
            <div style="font-size:0.65rem;color:var(--border);margin-top:4px;font-family:monospace;">${o.moves.slice(0,6).join(' ')}${o.moves.length>6?'…':''}</div>
          </div>`;
      }
      contentHtml += '</div>';
    } else {
      contentHtml = '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:20px;">Select a category above to browse openings.<br><br>Click any opening to practice its moves on the board.</div>';
    }

    this._showModal('📚 Opening Explorer', tabsHtml + contentHtml);

    setTimeout(() => {
      document.querySelectorAll('.opening-cat-tab').forEach(btn => {
        btn.addEventListener('click', () => this._showOpeningExplorer(btn.dataset.cat));
      });
      document.querySelectorAll('.opening-entry').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.borderColor = 'var(--accent)');
        el.addEventListener('mouseleave', () => el.style.borderColor = 'transparent');
        el.addEventListener('click', () => this._practiceOpening(el.dataset.moves.split(' ')));
      });
    }, 80);
  }

  async _practiceOpening(moves) {
    const modal = document.getElementById('feature-modal');
    if (modal) modal.remove();

    // Start a new game from the starting position
    await this.newGame();

    // Replay opening moves one by one with a short delay
    this._showPuzzleStatus(`📚 Replaying opening: ${moves.length} moves…`, 'info');
    for (let i = 0; i < moves.length; i++) {
      await new Promise(r => setTimeout(r, 350));
      if (this.status !== 'Active') break;
      try {
        await this._makeMove(moves[i]);
      } catch (e) {
        break;
      }
    }
    this._showPuzzleStatus('📚 Opening loaded — continue playing from here!', 'info');
  }

  // ── PGN Import ──

  _showImportPGN() {
    const html = `
      <div>
        <p style="color:var(--text-muted);font-size:0.78rem;margin:0 0 10px;">
          Paste a PGN game below. The game will be loaded and you can step through it or continue from any position.
        </p>
        <textarea id="pgn-import-text" placeholder='[Event "My Game"]\n[White "Player"]\n[Black "AI"]\n\n1. e4 e5 2. Nf3 Nc6 …'
          style="width:100%;height:160px;resize:vertical;font-size:0.72rem;font-family:monospace;
                 background:var(--surface-2);border:1px solid var(--border);border-radius:6px;
                 color:var(--text);padding:8px;box-sizing:border-box;"></textarea>
        <div id="pgn-import-error" style="color:#ef4444;font-size:0.72rem;margin-top:6px;display:none;"></div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button id="pgn-import-btn" class="btn" style="flex:1;">📥 Import Game</button>
          <button id="pgn-import-cancel" class="btn secondary">Cancel</button>
        </div>
      </div>`;
    this._showModal('📥 Import PGN', html);

    setTimeout(() => {
      const cancelBtn = document.getElementById('pgn-import-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => {
        const m = document.getElementById('feature-modal');
        if (m) m.remove();
      });
      const importBtn = document.getElementById('pgn-import-btn');
      if (importBtn) importBtn.addEventListener('click', () => this._doImportPGN());
    }, 80);
  }

  async _doImportPGN() {
    const ta = document.getElementById('pgn-import-text');
    const errEl = document.getElementById('pgn-import-error');
    const btn = document.getElementById('pgn-import-btn');
    if (!ta) return;

    const pgn = ta.value.trim();
    if (!pgn) { errEl.textContent = 'Please paste a PGN first.'; errEl.style.display = 'block'; return; }

    btn.textContent = 'Parsing…';
    btn.disabled = true;
    errEl.style.display = 'none';

    try {
      const result = await this.api.importPGN(pgn);
      const modal = document.getElementById('feature-modal');
      if (modal) modal.remove();

      // Load the starting position
      const startFen = result.starting_fen;
      const data = await this.api.newGame(startFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' ? null : startFen);
      this.gameId = data.game_id;
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.status = 'Active';
      this.moveHistory = [];
      this._moveHistoryUCI = [];
      this._fenLog = [this.fen];
      this.sideToMove = data.side_to_move || 'white';
      this._savedUseAI = this.useAI;
      this.useAI = false; // Don't let AI interfere during replay

      this.board.clearHighlights();
      this.board.setPieces(this.pieces);
      this._updateUI();

      // Store imported game for stepping through
      this._importedMoves = result.uci_moves || [];
      this._importedFens = result.fens || [];
      this._importedHeaders = result.headers || {};
      this._importMoveIndex = 0;

      const white = result.headers.White || 'White';
      const black = result.headers.Black || 'Black';
      const event = result.headers.Event || 'Imported Game';

      // Show replay controls in coach panel
      const coachEl = document.getElementById('tutor-coach-content');
      if (coachEl) {
        coachEl.innerHTML = `
          <div class="tutor-tip"><span class="tutor-tag gold">📥 IMPORT</span> <strong>${event}</strong></div>
          <div class="tutor-tip" style="font-size:0.72rem;">⬜ ${white} vs ⬛ ${black} · ${result.move_count} moves</div>
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
            <button id="pgn-prev-btn" class="btn secondary" style="font-size:0.72rem;padding:3px 10px;" disabled>◀ Prev</button>
            <button id="pgn-next-btn" class="btn secondary" style="font-size:0.72rem;padding:3px 10px;">▶ Next</button>
            <button id="pgn-play-btn" class="btn secondary" style="font-size:0.72rem;padding:3px 10px;">▶▶ Auto</button>
            <button id="pgn-stop-btn" class="btn secondary" style="font-size:0.72rem;padding:3px 10px;display:none;">⏹ Stop</button>
            <button id="pgn-continue-btn" class="btn" style="font-size:0.72rem;padding:3px 10px;">Play from here</button>
          </div>
          <div id="pgn-move-label" style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">Move 0 / ${result.move_count}</div>
        `;
        const tutorPanel = document.getElementById('tutor-panel');
        if (tutorPanel) tutorPanel.classList.remove('minimized');

        setTimeout(() => this._bindPgnReplayControls(), 100);
      }

      this._showPuzzleStatus(`📥 ${event} loaded — ${result.move_count} moves. Use ▶ in the Coach panel to step through.`, 'info');
    } catch (e) {
      if (btn) { btn.textContent = '📥 Import Game'; btn.disabled = false; }
      if (errEl) { errEl.textContent = e.message || 'Import failed. Check the PGN format and ensure the AI service is running.'; errEl.style.display = 'block'; }
    }
  }

  _bindPgnReplayControls() {
    const step = async (dir) => {
      if (!this._importedMoves) return;
      const newIdx = this._importMoveIndex + dir;
      if (newIdx < 0 || newIdx > this._importedMoves.length) return;
      this._importMoveIndex = newIdx;

      // Load the FEN for this position
      const fen = this._importedFens[newIdx];
      if (fen) {
        const data = await this.api.newGame(fen);
        this.gameId = data.game_id;
        this.fen = data.fen;
        this.pieces = data.pieces;
        this.legalMoves = data.legal_moves;
        this.board.setPieces(this.pieces);
        if (newIdx > 0) {
          const prevMove = this._importedMoves[newIdx - 1];
          this.board.highlightLastMove(prevMove.slice(0,2), prevMove.slice(2,4));
        } else {
          this.board.clearHighlights();
        }
        this._updateUI();
      }

      const label = document.getElementById('pgn-move-label');
      if (label) label.textContent = `Move ${newIdx} / ${this._importedMoves.length}`;
      const prevBtn = document.getElementById('pgn-prev-btn');
      const nextBtn = document.getElementById('pgn-next-btn');
      if (prevBtn) prevBtn.disabled = newIdx <= 0;
      if (nextBtn) nextBtn.disabled = newIdx >= this._importedMoves.length;
    };

    const prevBtn = document.getElementById('pgn-prev-btn');
    const nextBtn = document.getElementById('pgn-next-btn');
    const playBtn = document.getElementById('pgn-play-btn');
    const stopBtn = document.getElementById('pgn-stop-btn');
    const contBtn = document.getElementById('pgn-continue-btn');

    if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => step(1));

    if (playBtn) playBtn.addEventListener('click', () => {
      playBtn.style.display = 'none';
      stopBtn.style.display = '';
      this._pgnAutoInterval = setInterval(async () => {
        if (this._importMoveIndex >= this._importedMoves.length) {
          clearInterval(this._pgnAutoInterval);
          playBtn.style.display = '';
          stopBtn.style.display = 'none';
          return;
        }
        await step(1);
      }, 900);
    });

    if (stopBtn) stopBtn.addEventListener('click', () => {
      clearInterval(this._pgnAutoInterval);
      playBtn.style.display = '';
      stopBtn.style.display = 'none';
    });

    if (contBtn) contBtn.addEventListener('click', () => {
      // Resume playing from current position
      this._importedMoves = null;
      if (this._savedUseAI !== undefined) { this.useAI = this._savedUseAI; delete this._savedUseAI; }
      const coachEl = document.getElementById('tutor-coach-content');
      if (coachEl) coachEl.innerHTML = '<div class="tutor-tip">▶ Playing from imported position. Good luck!</div>';
      this._showPuzzleStatus('Playing from imported position.', 'info');
    });
  }

  // ── FEN Loader ──

  async _loadFenInput() {
    const input = document.getElementById('fen-input');
    if (!input) return;
    const fen = input.value.trim();
    if (!fen) return;

    // Basic FEN sanity check
    const parts = fen.split(' ');
    if (parts.length < 2 || !fen.includes('/')) {
      this._showCopyToast('Invalid FEN format.');
      return;
    }

    try {
      const data = await this.api.newGame(fen);
      this.gameId = data.game_id;
      this.fen = data.fen;
      this.pieces = data.pieces;
      this.legalMoves = data.legal_moves;
      this.sideToMove = parts[1] === 'w' ? 'white' : 'black';
      this.playerColor = this.sideToMove;
      this.status = 'Active';
      this.moveHistory = [];
      this._moveHistoryUCI = [];
      this._fenLog = [this.fen];
      this._currentOpening = null;

      this.board.clearHighlights();
      this.board.setPieces(this.pieces);
      this._updateUI();
      this._updateOpening();

      input.value = '';
      this._showCopyToast('Position loaded!');
      sounds.playSelect();
    } catch (e) {
      this._showCopyToast('Invalid position — check the FEN string.');
    }
  }

  // ── Stats Dashboard ──

  _initStatsPanel() {
    const btn = document.getElementById('btn-stats');
    if (btn) btn.addEventListener('click', () => this._showStats());
  }

  _showStats() {
    const history = loadHistory();
    const rating = getRating();
    const ratingHistory = typeof getRating === 'function' ? [] : [];

    // Compute stats
    const total = history.length;
    const wins = history.filter(g => g.result === 'win').length;
    const losses = history.filter(g => g.result === 'loss').length;
    const draws = total - wins - losses;
    const winRate = total > 0 ? Math.round(wins / total * 100) : 0;

    // Streaks
    let currentStreak = 0, bestStreak = 0, streak = 0;
    for (const g of history) {
      if (g.result === 'win') { streak++; bestStreak = Math.max(bestStreak, streak); }
      else { streak = 0; }
    }
    currentStreak = streak;

    // Avg moves
    const avgMoves = total > 0 ? Math.round(history.reduce((s, g) => s + (g.moveCount || 0), 0) / total) : 0;

    // Opening stats
    const openingCounts = {};
    for (const g of history) {
      if (g.opening) {
        openingCounts[g.opening] = (openingCounts[g.opening] || 0) + 1;
      }
    }
    const topOpenings = Object.entries(openingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // By difficulty
    const byDiff = {};
    for (const g of history) {
      const d = g.difficulty || 'unknown';
      if (!byDiff[d]) byDiff[d] = { wins: 0, total: 0 };
      byDiff[d].total++;
      if (g.result === 'win') byDiff[d].wins++;
    }

    // Build HTML
    let html = '<div class="stats-grid">';
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-cyan);">${total}</div><div class="stat-label">Games Played</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-gold);">${rating.rating}</div><div class="stat-label">Current Rating</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:#4ade80;">${winRate}%</div><div class="stat-label">Win Rate</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-secondary);">${bestStreak}</div><div class="stat-label">Best Streak</div></div>`;
    html += '</div>';

    // Win/Loss/Draw bars
    html += '<div class="stat-section-title">Results Breakdown</div>';
    const makeBar = (label, value, max, color) => {
      const pct = max > 0 ? Math.round(value / max * 100) : 0;
      return `<div class="stat-bar-row">
        <span class="stat-bar-label">${label}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:${color};"></div></div>
        <span style="font-size:0.72rem;color:var(--text-secondary);width:40px;text-align:right;">${value}</span>
      </div>`;
    };
    html += makeBar('Wins', wins, total, '#4ade80');
    html += makeBar('Losses', losses, total, '#ef4444');
    html += makeBar('Draws', draws, total, '#fbbf24');

    // By difficulty
    if (Object.keys(byDiff).length > 0) {
      html += '<div class="stat-section-title">By Difficulty</div>';
      for (const [diff, data] of Object.entries(byDiff)) {
        const wr = Math.round(data.wins / data.total * 100);
        html += makeBar(diff.charAt(0).toUpperCase() + diff.slice(1), data.wins, data.total, 'var(--accent-primary)');
      }
    }

    // Top openings
    if (topOpenings.length > 0) {
      html += '<div class="stat-section-title">Favorite Openings</div>';
      for (const [name, count] of topOpenings) {
        html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.78rem;">
          <span style="color:var(--text-primary);">${name}</span>
          <span style="color:var(--text-muted);">${count} games</span>
        </div>`;
      }
    }

    // More stats
    html += '<div class="stat-section-title">More</div>';
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.78rem;">
      <span style="color:var(--text-secondary);">Avg. Game Length</span>
      <span style="color:var(--text-primary);">${avgMoves} moves</span>
    </div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.78rem;">
      <span style="color:var(--text-secondary);">Current Streak</span>
      <span style="color:var(--text-primary);">${currentStreak} wins</span>
    </div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.78rem;">
      <span style="color:var(--text-secondary);">Puzzles Solved</span>
      <span style="color:var(--text-primary);">${this._solvedPuzzles.length}</span>
    </div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.78rem;">
      <span style="color:var(--text-secondary);">Achievements</span>
      <span style="color:var(--text-primary);">${getUnlockedCount()}/${getTotalCount()}</span>
    </div>`;

    this._showModal('Statistics', html);
  }

  // ── Clock Countdown Modes ──

  _initClockModes() {
    const container = document.getElementById('clock-modes');
    if (!container) return;

    container.querySelectorAll('.clock-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.clock-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._clockMode = btn.dataset.mode;
        if (this._clockMode === 'elapsed') {
          this._clockInitialTime = 0;
        } else {
          this._clockInitialTime = parseInt(this._clockMode) * 60;
        }
        sounds.playSelect();
        // Apply to current game if just starting
        if (this.moveHistory.length === 0) {
          this._resetClockForMode();
        }
      });
    });
  }

  _resetClockForMode() {
    if (this._clockMode === 'elapsed') {
      this.whiteTime = 0;
      this.blackTime = 0;
    } else {
      this.whiteTime = this._clockInitialTime;
      this.blackTime = this._clockInitialTime;
    }
    this._updateTimerDisplay();
  }

  // ── Drag and Drop ──

  _initDragAndDrop() {
    const canvas = this.board.canvas;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.shiftKey || e.altKey) return;
      if (this.thinking || this.status !== 'Active') return;

      const sq = this.board.getSquareAtScreen(e.clientX, e.clientY);
      if (!sq) return;

      // Only start drag on own pieces
      if (this._isOwnPiece(sq) && this._isPlayerTurn()) {
        this._dragging = true;
        this._dragPieceSq = sq;
        this.selectedSquare = sq;
        this.board.highlightLegalMoves(this.legalMoves, sq);
        // Lift the piece
        if (this.board.liftPiece) this.board.liftPiece(sq);
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging || !this._dragPieceSq) return;
      // Follow cursor
      if (this.board.dragPiece) {
        this.board.dragPiece(this._dragPieceSq, e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('pointerup', async (e) => {
      if (!this._dragging || !this._dragPieceSq) return;
      this._dragging = false;

      const dropSq = this.board.getSquareAtScreen(e.clientX, e.clientY);
      if (this.board.dropPiece) this.board.dropPiece(this._dragPieceSq);

      if (dropSq && dropSq !== this._dragPieceSq) {
        const uci = this._dragPieceSq + dropSq;
        const promoResult = this._checkPromotion(this._dragPieceSq, dropSq, uci);

        if (promoResult instanceof Promise) {
          const promoUci = await promoResult;
          if (this.legalMoves.includes(promoUci)) {
            this._makeMove(promoUci);
          }
        } else {
          const promoUci = promoResult;
          if (this.legalMoves.includes(promoUci || uci)) {
            this._makeMove(promoUci || uci);
          }
        }
      }

      this._dragPieceSq = null;
      this.selectedSquare = null;
    });
  }

  // ── Animated NN Eval Bar ──

  async _updateNNEval() {
    // Non-blocking NN evaluation after each move
    if (!this.fen) return;
    try {
      const resp = await fetch('/api/ai/ai/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: this.fen, num_simulations: 50 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && typeof data.value === 'number') {
          const evalScore = data.value;
          // Convert NN output (-1 to 1) to percentage (5 to 95)
          const pct = Math.max(5, Math.min(95, 50 + evalScore * 45));
          const evalBar = document.getElementById('eval-bar');
          const evalText = document.getElementById('eval-text');
          if (evalBar) evalBar.style.width = `${pct}%`;
          if (evalText) {
            const sign = evalScore > 0 ? '+' : '';
            evalText.textContent = `${sign}${evalScore.toFixed(2)}`;
          }
        }
      }
    } catch (e) {
      // NN eval unavailable, keep material count  
    }
  }

  // ── Modal Helper ──

  _showModal(title, content) {
    // Remove existing modal
    const existing = document.getElementById('feature-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'feature-modal';
    modal.className = 'feature-modal-overlay';
    modal.innerHTML = `
      <div class="feature-modal">
        <div class="feature-modal-header">
          <h3>${title}</h3>
          <button class="feature-modal-close">&times;</button>
        </div>
        <div class="feature-modal-body">${content}</div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector('.feature-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
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

    // Resign / Draw buttons — only active during a live game with moves played
    const active = this.status === 'Active' && this.moveHistory.length > 0;
    const resignBtn = document.getElementById('btn-resign');
    const drawBtn = document.getElementById('btn-offer-draw');
    if (resignBtn) resignBtn.disabled = !active;
    if (drawBtn) drawBtn.disabled = !active;
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
      whiteEl.innerHTML = this._moveWithBadge(this.moveHistory[i], i);
      row.appendChild(whiteEl);

      if (i + 1 < this.moveHistory.length) {
        const blackEl = document.createElement('span');
        blackEl.className = 'move-black';
        blackEl.innerHTML = this._moveWithBadge(this.moveHistory[i + 1], i + 1);
        row.appendChild(blackEl);
      }

      container.appendChild(row);
    }
    container.scrollTop = container.scrollHeight;
  }

  // Rate a move for display quality badge
  _moveWithBadge(san, index) {
    if (!san) return '';
    const quality = this._getMoveQuality(san, index);
    const escaped = san.replace(/</g, '&lt;');
    if (!quality) return escaped;
    return `${escaped} <span class="move-quality ${quality.cls}" title="${quality.label}">${quality.symbol}</span>`;
  }

  _getMoveQuality(san, index) {
    if (!san) return null;

    // Checkmate is always brilliant
    if (san.includes('#')) return { cls: 'brilliant', symbol: '!!', label: 'Brilliant — Checkmate!' };

    // Check + capture is great
    if (san.includes('+') && san.includes('x')) return { cls: 'great', symbol: '!', label: 'Great move' };

    // Queen sacrifice (captured piece after moving queen, losing position) 
    // Approximate: if we have move quality data from engine eval, use it
    if (this._moveQualities && this._moveQualities[index]) {
      return this._moveQualities[index];
    }

    // Heuristic classification from SAN
    const isCapture = san.includes('x');
    const isCheck = san.includes('+');
    const isCastle = san.startsWith('O-');
    const isPromotion = san.includes('=');

    if (isPromotion && isCheck) return { cls: 'brilliant', symbol: '!!', label: 'Brilliant' };
    if (isPromotion) return { cls: 'great', symbol: '!', label: 'Great' };
    if (isCastle) return { cls: 'good', symbol: '✓', label: 'Good — King safety' };
    if (isCheck) return { cls: 'good', symbol: '✓', label: 'Good — Check' };

    // Only show badges for notable moves (not every move)
    return null;
  }

  // Store engine-evaluated move qualities (populated during game review)
  setMoveQuality(index, quality) {
    if (!this._moveQualities) this._moveQualities = {};
    this._moveQualities[index] = quality;
  }

  _updateCaptured() {
    const pieceValues = { king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, King: 0, Queen: 9, Rook: 5, Bishop: 3, Knight: 3, Pawn: 1 };
    const sort = (arr) => [...arr].sort((a, b) => (pieceValues[b] || 0) - (pieceValues[a] || 0));

    document.getElementById('captured-white').textContent =
      sort(this.capturedWhite).map((p) => PIECE_UNICODE[p] || p).join(' ');
    document.getElementById('captured-black').textContent =
      sort(this.capturedBlack).map((p) => PIECE_UNICODE[p] || p).join(' ');

    // Update player info bars on canvas
    this._updatePlayerBars();
  }

  _updatePlayerBars() {
    const pieceValues = { king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, King: 0, Queen: 9, Rook: 5, Bishop: 3, Knight: 3, Pawn: 1 };
    const sort = (arr) => [...arr].sort((a, b) => (pieceValues[b] || 0) - (pieceValues[a] || 0));

    // Calculate material advantage
    let whiteMatVal = 0, blackMatVal = 0;
    for (const p of this.pieces) {
      const v = pieceValues[p.piece_type] || 0;
      if (p.color === 'white') whiteMatVal += v;
      else blackMatVal += v;
    }
    const diff = whiteMatVal - blackMatVal;

    // Determine which bar is which player
    const isPlayerWhite = this.playerColor === 'white';
    const topColor = isPlayerWhite ? 'black' : 'white';
    const bottomColor = isPlayerWhite ? 'white' : 'black';

    // Top bar = opponent
    const topName = document.getElementById('pb-top-name');
    const topCaptures = document.getElementById('pb-top-captures');
    const topAdv = document.getElementById('pb-top-advantage');
    const topClock = document.getElementById('pb-top-clock');
    const topAvatar = document.getElementById('pb-top-avatar');
    const topBar = document.getElementById('player-bar-top');

    // Bottom bar = player
    const bottomName = document.getElementById('pb-bottom-name');
    const bottomCaptures = document.getElementById('pb-bottom-captures');
    const bottomAdv = document.getElementById('pb-bottom-advantage');
    const bottomClock = document.getElementById('pb-bottom-clock');
    const bottomAvatar = document.getElementById('pb-bottom-avatar');
    const bottomBar = document.getElementById('player-bar-bottom');

    if (topName) topName.textContent = this.useAI ? 'AI Engine' : 'Opponent';
    if (bottomName) bottomName.textContent = 'You';
    if (topAvatar) topAvatar.textContent = topColor === 'black' ? '♚' : '♔';
    if (bottomAvatar) bottomAvatar.textContent = bottomColor === 'white' ? '♔' : '♚';

    // Captured pieces for each bar
    const topCapturedPieces = topColor === 'black' ? this.capturedWhite : this.capturedBlack;
    const bottomCapturedPieces = bottomColor === 'white' ? this.capturedBlack : this.capturedWhite;
    if (topCaptures) topCaptures.textContent = sort(topCapturedPieces).map(p => PIECE_UNICODE[p] || p).join('');
    if (bottomCaptures) bottomCaptures.textContent = sort(bottomCapturedPieces).map(p => PIECE_UNICODE[p] || p).join('');

    // Material advantage
    const topAdvantagePts = topColor === 'white' ? diff : -diff;
    const bottomAdvantagePts = bottomColor === 'white' ? diff : -diff;
    if (topAdv) topAdv.textContent = topAdvantagePts > 0 ? `+${topAdvantagePts}` : '';
    if (bottomAdv) bottomAdv.textContent = bottomAdvantagePts > 0 ? `+${bottomAdvantagePts}` : '';

    // Active turn indicator
    if (topBar) topBar.classList.toggle('active-turn', this.sideToMove === topColor);
    if (bottomBar) bottomBar.classList.toggle('active-turn', this.sideToMove === bottomColor);

    // Clocks
    const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    const topTime = topColor === 'white' ? this.whiteTime : this.blackTime;
    const bottomTime = bottomColor === 'white' ? this.whiteTime : this.blackTime;
    if (topClock) topClock.textContent = formatTime(topTime);
    if (bottomClock) bottomClock.textContent = formatTime(bottomTime);
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

  // ── Resign & Draw ──

  _resign() {
    if (this.status !== 'Active' || this.moveHistory.length === 0) return;
    const confirmed = window.confirm('Are you sure you want to resign?');
    if (!confirmed) return;
    this._stopTimer();
    const winner = this.playerColor === 'white' ? 'Black' : 'White';
    this.status = `${winner} wins by resignation`;
    this._showGameOver();
    this._onGameEnd();
  }

  _offerDraw() {
    if (this.status !== 'Active' || this.moveHistory.length === 0) return;
    if (this.useAI) {
      // AI always accepts draw when behind or equal (eval < 0.1 from player's perspective),
      // declines when clearly winning. Simple heuristic based on move count & material.
      const moves = this.moveHistory.length;
      const accept = moves >= 20 && Math.random() < 0.45; // AI accepts ~45% of draws after move 20
      if (accept) {
        this._stopTimer();
        this.status = 'Draw by agreement';
        this._showGameOver();
        this._onGameEnd();
      } else {
        this._showPuzzleStatus('The AI declines the draw offer.', 'info');
      }
    } else {
      // vs human: show confirmation
      const accepted = window.confirm('Draw offered. Does the opponent accept?');
      if (accepted) {
        this._stopTimer();
        this.status = 'Draw by agreement';
        this._showGameOver();
        this._onGameEnd();
      }
    }
  }

  // ── Clipboard Utilities ──

  async _copyFen() {
    if (!this.fen) return;
    try {
      await navigator.clipboard.writeText(this.fen);
      this._showCopyToast('FEN copied to clipboard!');
    } catch (e) {
      this._showCopyToast('Could not copy — try manually selecting the FEN.');
    }
  }

  _showCopyToast(msg) {
    const existing = document.getElementById('copy-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'copy-toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:var(--surface-2);color:var(--text);border:1px solid var(--border);
      border-radius:8px;padding:8px 18px;font-size:0.8rem;z-index:200;
      box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:none;
      animation:fadeInUp 0.2s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  // ── Live Coaching (post-move position analysis) ──

  async _liveTutorAnalysis() {
    if (!this.fen || this.status !== 'Active') return;
    try {
      const resp = await fetch(`${this._getAiBase()}/ai/tutor/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: this.fen }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      this._showLiveCoachTip(data);
    } catch (e) {
      // Silent fail — live coaching is non-critical
    }
  }

  _getAiBase() {
    return getAiBaseUrl();
  }

  _showLiveCoachTip(data) {
    const coachEl = document.getElementById('tutor-coach-content');
    if (!coachEl) return;

    const tips = data.tips || data.coaching || [];
    const evaluation = data.evaluation;
    const best_move = data.best_move;

    if (!tips.length && !evaluation) return;

    // Build a compact tip block
    let html = '';
    if (evaluation) {
      const score = typeof evaluation === 'number' ? evaluation.toFixed(2) : evaluation;
      const color = evaluation > 0.1 ? '#10b981' : evaluation < -0.1 ? '#ef4444' : '#fbbf24';
      html += `<div class="tutor-tip" style="border-left:3px solid ${color};padding-left:8px;">
        <span class="tutor-tag" style="background:${color}22;color:${color};">EVAL ${score}</span>
        ${best_move ? ` <span style="font-size:0.7rem;color:var(--text-muted);">Best: ${best_move}</span>` : ''}
      </div>`;
    }
    for (const tip of tips.slice(0, 3)) {
      const text = typeof tip === 'string' ? tip : (tip.text || tip.message || '');
      const tag = tip.tag || tip.category || 'TIP';
      if (text) {
        html += `<div class="tutor-tip"><span class="tutor-tag">${tag.toUpperCase()}</span> ${text}</div>`;
      }
    }

    if (html) {
      coachEl.innerHTML = html + coachEl.innerHTML.slice(0, 600); // prepend, keep old tips trimmed
    }
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

    // Add mode-specific message
    if (this.gameMode === 'friendly') {
      msg.textContent += ' — Friendly match (no rating change)';
    } else if (this.gameMode === 'training') {
      msg.textContent += ' — Review the coach tips above to learn from this game!';
    }

    // Enable review button
    const reviewBtn = document.getElementById('btn-review');
    if (reviewBtn) reviewBtn.disabled = false;

    // Confetti for wins or any checkmate — dramatic camera zoom first
    if (isWin || this.status.includes('Checkmate')) {
      this.board.triggerCheckmateZoom();
    } else if (this.status.includes('Stalemate') || this.status.includes('Draw')) {
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

      if (this._clockMode === 'elapsed') {
        // Count up
        if (this.sideToMove === 'white') {
          this.whiteTime += elapsed;
        } else {
          this.blackTime += elapsed;
        }
      } else {
        // Count down
        if (this.sideToMove === 'white') {
          this.whiteTime = Math.max(0, this.whiteTime - elapsed);
          if (this.whiteTime <= 0) {
            this._stopTimer();
            this.status = 'White lost on time';
            this._showGameOver();
            this._onGameEnd();
            return;
          }
        } else {
          this.blackTime = Math.max(0, this.blackTime - elapsed);
          if (this.blackTime <= 0) {
            this._stopTimer();
            this.status = 'Black lost on time';
            this._showGameOver();
            this._onGameEnd();
            return;
          }
        }
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
    if (whiteRow) {
      whiteRow.classList.toggle('active', this.sideToMove === 'white' && this.status === 'Active');
      whiteRow.classList.toggle('time-warning', this._clockMode !== 'elapsed' && this.whiteTime < 30);
    }
    if (blackRow) {
      blackRow.classList.toggle('active', this.sideToMove === 'black' && this.status === 'Active');
      blackRow.classList.toggle('time-warning', this._clockMode !== 'elapsed' && this.blackTime < 30);
    }

    // Sync player bar clocks
    const topClock = document.querySelector('.top-bar .pb-clock');
    const botClock = document.querySelector('.bottom-bar .pb-clock');
    if (topClock && botClock) {
      const playerIsWhite = this.playerColor === 'white';
      topClock.textContent = fmt(playerIsWhite ? this.blackTime : this.whiteTime);
      botClock.textContent = fmt(playerIsWhite ? this.whiteTime : this.blackTime);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  MULTIPLAYER
  // ══════════════════════════════════════════════════════════════

  _initMultiplayer() {
    this.multiplayer.on('room-created', (data) => {
      this._showMultiplayerLobby(data);
    });
    this.multiplayer.on('room-joined', (data) => {
      this._startMultiplayerGame(data);
    });
    this.multiplayer.on('game-started', (data) => {
      this._startMultiplayerGame(data);
    });
    this.multiplayer.on('state-update', (data) => {
      if (!this._multiplayerActive) return;
      this._syncMultiplayerState(data);
    });
    this.multiplayer.on('chat', (msg) => {
      this._addChatMessage(msg);
    });
    this.multiplayer.on('game-over', (data) => {
      this._handleMultiplayerGameOver(data);
    });
    this.multiplayer.on('left', () => {
      this._multiplayerActive = false;
      this._closeModal('multiplayer-modal');
    });

    const mpBtn = document.getElementById('btn-multiplayer');
    if (mpBtn) mpBtn.addEventListener('click', () => this._showMultiplayerPanel());
  }

  _showMultiplayerPanel() {
    const html = `
      <div style="min-width:340px">
        <h3 style="margin-bottom:16px;text-align:center">🌐 Online Play</h3>
        <div style="margin-bottom:12px">
          <label style="font-size:0.8rem;color:var(--text-secondary)">Your Name</label>
          <input type="text" id="mp-name" value="${this.multiplayer.playerName}" 
            style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border-glow);background:var(--bg-card);color:var(--text-primary);font-family:Inter,sans-serif;margin-top:4px" />
        </div>
        <div class="btn-row" style="margin-bottom:16px">
          <button class="btn" id="mp-create">Create Room</button>
          <button class="btn secondary" id="mp-join-btn">Join Room</button>
        </div>
        <div id="mp-join-section" style="display:none;margin-bottom:16px">
          <label style="font-size:0.8rem;color:var(--text-secondary)">Room Code</label>
          <div style="display:flex;gap:6px;margin-top:4px">
            <input type="text" id="mp-code" placeholder="ABCDEF" maxlength="6"
              style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border-glow);background:var(--bg-card);color:var(--text-primary);font-family:JetBrains Mono,monospace;text-transform:uppercase;font-size:1.1rem;letter-spacing:2px;text-align:center" />
            <button class="btn" id="mp-join-go" style="width:80px">Join</button>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:0.8rem;color:var(--text-secondary)">Variant</label>
          <select id="mp-variant" style="margin-top:4px">
            <option value="standard">Standard</option>
            <option value="chess960">Chess960</option>
            <option value="kingofthehill">King of the Hill</option>
            <option value="threecheck">Three-Check</option>
          </select>
        </div>
        <div id="mp-lobby-list" style="margin-top:16px">
          <h4 style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">OPEN ROOMS</h4>
          <div id="mp-rooms" style="max-height:200px;overflow-y:auto"></div>
        </div>
      </div>
    `;
    this._showFeatureModal('multiplayer-modal', html);
    this._loadOpenRooms();

    document.getElementById('mp-name').addEventListener('change', (e) => {
      this.multiplayer.setPlayerName(e.target.value.trim() || 'Player');
    });
    document.getElementById('mp-create').addEventListener('click', async () => {
      const variant = document.getElementById('mp-variant').value;
      try {
        await this.multiplayer.createRoom({ variant, color: this.playerColor });
      } catch (e) { console.warn('Create room failed:', e); }
    });
    document.getElementById('mp-join-btn').addEventListener('click', () => {
      const sec = document.getElementById('mp-join-section');
      sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('mp-join-go').addEventListener('click', async () => {
      const code = document.getElementById('mp-code').value.trim();
      if (code.length !== 6) return;
      try { await this.multiplayer.joinRoom(code); } catch (e) {
        alert(e.message || 'Could not join room');
      }
    });
  }

  async _loadOpenRooms() {
    try {
      const rooms = await this.multiplayer.listRooms();
      const container = document.getElementById('mp-rooms');
      if (!container) return;
      if (rooms.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;padding:8px">No open rooms. Create one!</div>';
        return;
      }
      container.innerHTML = rooms.map(r => `
        <div style="display:flex;align-items:center;padding:8px;border:1px solid var(--border-glow);border-radius:8px;margin-bottom:6px;cursor:pointer" 
          data-code="${r.room_code}" class="mp-room-item">
          <span style="flex:1;font-weight:600">${r.host_name}</span>
          <span style="font-size:0.75rem;color:var(--text-secondary)">${r.variant}</span>
          <span style="font-family:JetBrains Mono;font-size:0.8rem;margin-left:8px;color:var(--accent-cyan)">${r.room_code}</span>
        </div>
      `).join('');
      container.querySelectorAll('.mp-room-item').forEach(el => {
        el.addEventListener('click', async () => {
          try { await this.multiplayer.joinRoom(el.dataset.code); } catch (e) { alert(e.message); }
        });
      });
    } catch (e) { /* rooms not available */ }
  }

  _showMultiplayerLobby(data) {
    const html = `
      <div style="text-align:center;min-width:300px">
        <h3 style="margin-bottom:12px">Waiting for opponent...</h3>
        <div style="font-size:2.5rem;font-family:JetBrains Mono,monospace;letter-spacing:6px;color:var(--accent-cyan);margin:20px 0">${data.room_code}</div>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">Share this code with a friend to play!</p>
        <button class="btn secondary" id="mp-copy-link" style="margin-bottom:8px">📋 Copy Invite Link</button>
        <button class="btn danger" id="mp-cancel" style="margin-top:6px">Cancel</button>
        <div id="mp-chat-area" style="margin-top:16px"></div>
      </div>
    `;
    this._showFeatureModal('multiplayer-modal', html);
    document.getElementById('mp-copy-link').addEventListener('click', () => {
      const link = this.multiplayer.getShareLink();
      navigator.clipboard.writeText(link).catch(() => {});
      document.getElementById('mp-copy-link').textContent = '✓ Copied!';
    });
    document.getElementById('mp-cancel').addEventListener('click', () => this.multiplayer.leaveRoom());
  }

  async _startMultiplayerGame(data) {
    this._closeModal('multiplayer-modal');
    this._multiplayerActive = true;
    this.useAI = false;
    if (data.fen) {
      await this._loadPosition(data.fen, data.pieces, data.legal_moves);
    }
    this._updateStatus(`Multiplayer — ${this.multiplayer.myColor === 'white' ? '⬜' : '⬛'} You play ${this.multiplayer.myColor}`);
    this._showMultiplayerChat();
  }

  _syncMultiplayerState(data) {
    if (data.fen) {
      this.fen = data.fen;
      this.pieces = data.pieces || [];
      this.legalMoves = data.legal_moves || [];
      this.sideToMove = data.side_to_move || 'white';
      this.isCheck = data.is_check || false;
      this.moveHistory = data.move_history || [];
      this.board.updatePieces(this.pieces);
      this._updateUI();
    }
  }

  _showMultiplayerChat() {
    // Floating chat button
    let chatBtn = document.getElementById('mp-chat-btn');
    if (!chatBtn) {
      chatBtn = document.createElement('button');
      chatBtn.id = 'mp-chat-btn';
      chatBtn.className = 'btn';
      chatBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;width:48px;height:48px;border-radius:50%;z-index:200;font-size:1.4rem;padding:0;display:flex;align-items:center;justify-content:center';
      chatBtn.textContent = '💬';
      chatBtn.addEventListener('click', () => this._toggleChatPanel());
      document.body.appendChild(chatBtn);
    }
  }

  _toggleChatPanel() {
    let panel = document.getElementById('mp-chat-panel');
    if (panel) { panel.remove(); return; }

    panel = document.createElement('div');
    panel.id = 'mp-chat-panel';
    panel.style.cssText = 'position:fixed;bottom:80px;right:20px;width:280px;background:var(--bg-panel);border:1px solid var(--border-glow);border-radius:12px;z-index:200;display:flex;flex-direction:column;max-height:350px;backdrop-filter:blur(12px)';
    panel.innerHTML = `
      <div style="padding:10px 12px;border-bottom:1px solid var(--border-glow);font-weight:600;font-size:0.85rem">Chat</div>
      <div id="mp-chat-msgs" style="flex:1;overflow-y:auto;padding:8px;min-height:120px;max-height:200px"></div>
      <div style="display:flex;gap:4px;padding:8px;flex-wrap:wrap;border-top:1px solid var(--border-glow)">
        ${EMOTES.map(e => `<button class="mp-emote-btn" data-emote="${e.id}" title="${e.label}" style="cursor:pointer;font-size:1.2rem;background:none;border:none;padding:2px 4px">${e.emoji}</button>`).join('')}
      </div>
      <div style="display:flex;gap:4px;padding:0 8px 8px">
        <input type="text" id="mp-chat-input" placeholder="Type..." style="flex:1;padding:6px;border-radius:6px;border:1px solid var(--border-glow);background:var(--bg-card);color:var(--text-primary);font-size:0.8rem" />
        <button class="btn" id="mp-chat-send" style="padding:6px 12px;font-size:0.8rem">Send</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelectorAll('.mp-emote-btn').forEach(btn => {
      btn.addEventListener('click', () => this.multiplayer.sendEmote(btn.dataset.emote));
    });
    document.getElementById('mp-chat-send').addEventListener('click', () => {
      const input = document.getElementById('mp-chat-input');
      if (input.value.trim()) { this.multiplayer.sendChat(input.value.trim()); input.value = ''; }
    });
    document.getElementById('mp-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('mp-chat-send').click();
    });
  }

  _addChatMessage(msg) {
    const container = document.getElementById('mp-chat-msgs');
    if (!container) return;
    const isEmote = msg.content.type === 'emote';
    const emote = isEmote ? EMOTES.find(e => e.id === msg.content.emote) : null;
    const div = document.createElement('div');
    div.style.cssText = 'margin-bottom:4px;font-size:0.8rem';
    div.innerHTML = isEmote
      ? `<span style="color:var(--accent-cyan)">${msg.sender_name}</span> ${emote?.emoji || msg.content.emote}`
      : `<span style="color:var(--accent-cyan)">${msg.sender_name}:</span> ${msg.content.text}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  _handleMultiplayerGameOver(data) {
    this._multiplayerActive = false;
    // Clean up chat button
    const chatBtn = document.getElementById('mp-chat-btn');
    if (chatBtn) chatBtn.remove();
    const chatPanel = document.getElementById('mp-chat-panel');
    if (chatPanel) chatPanel.remove();
  }

  // ══════════════════════════════════════════════════════════════
  //  DAILY PUZZLE
  // ══════════════════════════════════════════════════════════════

  _initDailyPuzzle() {
    const btn = document.getElementById('btn-daily-puzzle');
    if (btn) btn.addEventListener('click', () => this._showDailyPuzzle());

    // Auto-show notification if today's not solved
    if (!isDailySolved()) {
      setTimeout(() => {
        const badge = document.getElementById('daily-badge');
        if (badge) { badge.style.display = 'flex'; }
      }, 2000);
    }
  }

  _showDailyPuzzle() {
    const puzzle = getDailyPuzzle();
    const stats = getDailyStats();
    const solved = isDailySolved();

    const html = `
      <div style="min-width:360px;max-width:420px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3>📅 Daily Puzzle #${puzzle.puzzleNumber}</h3>
          <div style="font-size:0.75rem;color:var(--text-muted)">${puzzle.date}</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border-glow);border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:4px">${puzzle.title}</div>
          <div style="font-size:0.85rem;color:var(--text-secondary)">${puzzle.desc}</div>
          <div style="margin-top:6px;font-size:0.75rem;color:var(--accent-gold)">Rating: ${puzzle.rating} · Theme: ${puzzle.theme}</div>
        </div>
        ${solved 
          ? '<div style="text-align:center;font-size:1.5rem;margin:12px 0">✅ Solved!</div>'
          : '<button class="btn" id="daily-play" style="width:100%">▶ Play</button>'
        }
        <div style="display:flex;gap:16px;margin-top:16px;justify-content:center">
          <div style="text-align:center">
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-cyan)">${stats.currentStreak}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">STREAK</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-gold)">${stats.bestStreak}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">BEST</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary)">${stats.totalSolved}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">TOTAL</div>
          </div>
        </div>
      </div>
    `;
    this._showFeatureModal('daily-modal', html);

    if (!solved) {
      document.getElementById('daily-play').addEventListener('click', () => {
        this._closeModal('daily-modal');
        this._startDailyPuzzle(puzzle);
      });
    }
  }

  _startDailyPuzzle(puzzle) {
    this._dailyPuzzleMode = true;
    this._currentPuzzle = puzzle;
    this._puzzleMoveIndex = 0;
    this._puzzleMode = true;
    this.newGame(puzzle.fen);
    this._updateStatus(`📅 Daily Puzzle: ${puzzle.title}`);
  }

  _checkDailyPuzzleMove(uci) {
    if (!this._dailyPuzzleMode || !this._currentPuzzle) return false;
    const expected = this._currentPuzzle.solution[this._puzzleMoveIndex];
    if (uci === expected) {
      this._puzzleMoveIndex++;
      if (this._puzzleMoveIndex >= this._currentPuzzle.solution.length) {
        // Solved!
        const stats = solveDailyPuzzle();
        addXP('daily_puzzle');
        sounds.playPuzzleCorrect?.() || sounds.playCapture?.();
        this._dailyPuzzleMode = false;
        this._puzzleMode = false;
        this._updateStatus('✅ Daily Puzzle Solved! Streak: ' + stats.currentStreak);
        const badge = document.getElementById('daily-badge');
        if (badge) badge.style.display = 'none';
        return true;
      }
      return true;
    }
    sounds.playIllegal?.();
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  //  TIMED DRILLS
  // ══════════════════════════════════════════════════════════════

  _initTimedDrills() {
    const btn = document.getElementById('btn-timed-drills');
    if (btn) btn.addEventListener('click', () => this._showTimedDrillMenu());
  }

  _showTimedDrillMenu() {
    const stats = getTimedDrillStats();
    const html = `
      <div style="min-width:360px">
        <h3 style="margin-bottom:16px;text-align:center">⏱️ Timed Drills</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${TIMED_DRILL_CONFIGS.map(c => `
            <div class="drill-option" data-drill="${c.id}" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-card);border:1px solid var(--border-glow);border-radius:8px;cursor:pointer;transition:border-color 0.2s">
              <span style="font-size:1.5rem">${c.icon}</span>
              <div style="flex:1">
                <div style="font-weight:600">${c.name}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary)">${c.puzzleCount === 999 ? 'Unlimited' : c.puzzleCount} puzzles · ${c.timeLimitSec}s</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:0.9rem;font-weight:700;color:var(--accent-gold)">${stats.bestScores[c.id] || 0}</div>
                <div style="font-size:0.65rem;color:var(--text-muted)">BEST</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    this._showFeatureModal('drill-modal', html);
    document.querySelectorAll('.drill-option').forEach(el => {
      el.addEventListener('click', () => {
        this._closeModal('drill-modal');
        this._startTimedDrill(el.dataset.drill);
      });
      el.addEventListener('mouseenter', () => el.style.borderColor = 'var(--accent-primary)');
      el.addEventListener('mouseleave', () => el.style.borderColor = 'var(--border-glow)');
    });
  }

  _startTimedDrill(configId) {
    this._timedDrillSession = new TimedDrillSession(configId);
    this._puzzleMode = true;

    this._timedDrillSession.onTick((remaining, solved) => {
      this._updateStatus(`⏱️ ${Math.ceil(remaining)}s — Solved: ${solved}/${this._timedDrillSession.puzzles.length}`);
    });

    this._timedDrillSession.onComplete((result) => {
      this._puzzleMode = false;
      this._showDrillResult(result);
    });

    this._timedDrillSession.start();
    const first = this._timedDrillSession.getCurrentPuzzle();
    if (first) this.newGame(first.fen);
  }

  _handleTimedDrillMove(uci) {
    if (!this._timedDrillSession || !this._timedDrillSession.active) return false;
    const result = this._timedDrillSession.submitMove(uci);
    if (result.correct) sounds.playPuzzleCorrect?.();
    else sounds.playIllegal?.();

    if (!result.finished && result.nextPuzzle) {
      setTimeout(() => this.newGame(result.nextPuzzle.fen), 500);
    }
    return true;
  }

  _showDrillResult(result) {
    addXP('puzzle_solved');
    const html = `
      <div style="text-align:center;min-width:300px">
        <h3 style="margin-bottom:12px">⏱️ ${result.configName}</h3>
        <div style="font-size:3rem;font-weight:700;color:var(--accent-gold);margin:16px 0">${result.score}</div>
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">points</div>
        <div style="display:flex;gap:20px;justify-content:center;margin-bottom:16px">
          <div><span style="font-size:1.2rem;font-weight:700;color:#96bc4b">${result.solved}</span><br/><span style="font-size:0.7rem;color:var(--text-muted)">Solved</span></div>
          <div><span style="font-size:1.2rem;font-weight:700;color:#ca3431">${result.mistakes}</span><br/><span style="font-size:0.7rem;color:var(--text-muted)">Wrong</span></div>
          <div><span style="font-size:1.2rem;font-weight:700;color:var(--text-primary)">${Math.floor(result.timeTaken)}s</span><br/><span style="font-size:0.7rem;color:var(--text-muted)">Time</span></div>
        </div>
        <button class="btn" onclick="document.getElementById('drill-result-modal')?.remove()">Close</button>
      </div>
    `;
    this._showFeatureModal('drill-result-modal', html);
  }

  // ══════════════════════════════════════════════════════════════
  //  POSITION EDITOR
  // ══════════════════════════════════════════════════════════════

  _initPositionEditor() {
    const btn = document.getElementById('btn-position-editor');
    if (btn) btn.addEventListener('click', () => this._showPositionEditor());
  }

  _showPositionEditor() {
    this._positionEditor.setStartPosition();

    const html = `
      <div style="min-width:400px">
        <h3 style="margin-bottom:12px;text-align:center">🔧 Position Editor</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:12px" id="editor-palette">
          ${EDITOR_PIECES.map(p => `
            <button class="editor-piece-btn" data-fen="${p.fen}" title="${p.color} ${p.name}"
              style="font-size:1.6rem;width:40px;height:40px;border:2px solid var(--border-glow);border-radius:6px;background:var(--bg-card);cursor:pointer;display:flex;align-items:center;justify-content:center;color:${p.color === 'white' ? '#f0f0f0' : '#333'}">${p.symbol}</button>
          `).join('')}
          <button class="editor-piece-btn" data-fen="" title="Eraser"
            style="font-size:1.2rem;width:40px;height:40px;border:2px solid var(--border-glow);border-radius:6px;background:var(--bg-card);cursor:pointer">🧹</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn secondary" id="editor-standard" style="flex:1;font-size:0.8rem">Standard</button>
          <button class="btn secondary" id="editor-clear" style="flex:1;font-size:0.8rem">Clear</button>
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:0.75rem;color:var(--text-muted)">Side to move</label>
          <select id="editor-stm" style="margin-top:2px">
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:0.75rem;color:var(--text-muted)">Castling</label>
          <div style="display:flex;gap:8px;margin-top:4px">
            <label class="toggle-label"><input type="checkbox" id="ed-K" checked /> K</label>
            <label class="toggle-label"><input type="checkbox" id="ed-Q" checked /> Q</label>
            <label class="toggle-label"><input type="checkbox" id="ed-k" checked /> k</label>
            <label class="toggle-label"><input type="checkbox" id="ed-q" checked /> q</label>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:0.75rem;color:var(--text-muted)">FEN</label>
          <input type="text" id="editor-fen" style="width:100%;padding:6px;font-family:JetBrains Mono;font-size:0.75rem;border-radius:6px;border:1px solid var(--border-glow);background:var(--bg-card);color:var(--text-primary);margin-top:2px" />
        </div>
        <div id="editor-errors" style="color:var(--accent-secondary);font-size:0.8rem;margin-bottom:8px"></div>
        <div class="btn-row">
          <button class="btn" id="editor-play">▶ Play from Position</button>
          <button class="btn secondary" id="editor-cancel">Cancel</button>
        </div>
      </div>
    `;
    this._showFeatureModal('editor-modal', html);

    const fenInput = document.getElementById('editor-fen');
    fenInput.value = this._positionEditor.toFEN();

    this._positionEditor.on('change', (fen) => {
      fenInput.value = fen;
      const v = this._positionEditor.validate();
      document.getElementById('editor-errors').textContent = v.valid ? '' : v.errors.join('; ');
    });

    document.querySelectorAll('.editor-piece-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.editor-piece-btn').forEach(b => b.style.borderColor = 'var(--border-glow)');
        btn.style.borderColor = 'var(--accent-primary)';
        this._positionEditor.selectPiece(btn.dataset.fen || null);
      });
    });

    document.getElementById('editor-standard').addEventListener('click', () => {
      this._positionEditor.setStartPosition();
    });
    document.getElementById('editor-clear').addEventListener('click', () => {
      this._positionEditor.clear();
    });
    document.getElementById('editor-stm').addEventListener('change', (e) => {
      this._positionEditor.setSideToMove(e.target.value);
    });
    ['K','Q','k','q'].forEach(c => {
      document.getElementById(`ed-${c}`).addEventListener('change', (e) => {
        this._positionEditor.setCastling({ [c]: e.target.checked });
      });
    });
    fenInput.addEventListener('change', () => {
      this._positionEditor.loadFEN(fenInput.value);
    });
    document.getElementById('editor-play').addEventListener('click', () => {
      const v = this._positionEditor.validate();
      if (!v.valid) { alert(v.errors.join('\n')); return; }
      const fen = this._positionEditor.toFEN();
      this._closeModal('editor-modal');
      this.newGame(fen);
    });
    document.getElementById('editor-cancel').addEventListener('click', () => {
      this._closeModal('editor-modal');
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  BLINDFOLD MODE
  // ══════════════════════════════════════════════════════════════

  _initBlindfoldMode() {
    const btn = document.getElementById('btn-blindfold');
    if (btn) btn.addEventListener('click', () => this._toggleBlindfold());
  }

  _toggleBlindfold() {
    this._blindfoldMode = !this._blindfoldMode;
    this.board.setBlindfold?.(this._blindfoldMode);
    const btn = document.getElementById('btn-blindfold');
    if (btn) {
      btn.textContent = this._blindfoldMode ? '👁️ Show Pieces' : '🙈 Blindfold';
      btn.classList.toggle('active', this._blindfoldMode);
    }
    this._updateStatus(this._blindfoldMode ? '🙈 Blindfold Mode — pieces hidden!' : 'Pieces visible');
  }

  // ══════════════════════════════════════════════════════════════
  //  VARIANT SELECTOR
  // ══════════════════════════════════════════════════════════════

  _initVariantSelector() {
    const sel = document.getElementById('variant-select');
    if (sel) {
      sel.addEventListener('change', (e) => {
        this._gameVariant = e.target.value;
        if (this._gameVariant === 'chess960') {
          this._chess960Id = null; // random
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  COSMETICS / UNLOCKABLES
  // ══════════════════════════════════════════════════════════════

  _initCosmeticsPanel() {
    const btn = document.getElementById('btn-cosmetics');
    if (btn) btn.addEventListener('click', () => this._showCosmeticsPanel());
  }

  _showCosmeticsPanel() {
    const state = getCosmeticsState();
    const xp = getXPState();

    const html = `
      <div style="min-width:400px;max-height:80vh;overflow-y:auto">
        <h3 style="margin-bottom:8px;text-align:center">✨ Cosmetics & Rewards</h3>
        
        <!-- XP Bar -->
        <div style="margin-bottom:16px;padding:12px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border-glow)">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:0.8rem;font-weight:600">Level ${xp.level}</span>
            <span style="font-size:0.75rem;color:var(--text-secondary)">${xp.xpInLevel}/${xp.xpToNextLevel} XP</span>
          </div>
          <div style="height:6px;background:var(--bg-primary);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${xp.progress * 100}%;background:linear-gradient(90deg,var(--accent-primary),var(--accent-cyan));border-radius:3px;transition:width 0.3s"></div>
          </div>
        </div>

        <!-- Piece Sets -->
        <h4 style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">PIECE SETS</h4>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:16px">
          ${Object.entries(PIECE_SETS).map(([id, set]) => {
            const unlocked = state.unlockedPieceSets.includes(id);
            const active = state.activePieceSet === id;
            return `
              <div class="cosmetic-item ${unlocked ? 'unlocked' : 'locked'} ${active ? 'active' : ''}" data-type="pieceset" data-id="${id}"
                style="padding:8px;border:1px solid ${active ? 'var(--accent-primary)' : 'var(--border-glow)'};border-radius:8px;cursor:${unlocked ? 'pointer' : 'default'};opacity:${unlocked ? 1 : 0.5};background:${active ? 'rgba(108,92,231,0.1)' : 'var(--bg-card)'}">
                <div style="font-size:1.2rem">${set.icon} ${set.name}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary)">${unlocked ? set.description : '🔒 ' + this._describeCondition(set.unlockCondition)}</div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Titles -->
        <h4 style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">TITLES</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
          ${Object.entries(TITLES).map(([id, title]) => {
            const unlocked = state.unlockedTitles.includes(id);
            const active = state.activeTitle === id;
            return `
              <div class="cosmetic-item ${active ? 'active' : ''}" data-type="title" data-id="${id}"
                style="padding:6px 12px;border:1px solid ${active ? 'var(--accent-gold)' : 'var(--border-glow)'};border-radius:20px;cursor:${unlocked ? 'pointer' : 'default'};opacity:${unlocked ? 1 : 0.5};font-size:0.8rem;background:${active ? 'rgba(201,168,76,0.1)' : 'var(--bg-card)'}">
                ${title.icon} ${title.name}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Backgrounds -->
        <h4 style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">BACKGROUNDS</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
          ${Object.entries(BOARD_BACKGROUNDS).map(([id, bg]) => {
            const unlocked = state.unlockedBackgrounds.includes(id);
            const active = state.activeBackground === id;
            return `
              <div class="cosmetic-item" data-type="background" data-id="${id}"
                style="padding:6px 12px;border:1px solid ${active ? 'var(--accent-cyan)' : 'var(--border-glow)'};border-radius:8px;cursor:${unlocked ? 'pointer' : 'default'};opacity:${unlocked ? 1 : 0.5};font-size:0.8rem">
                <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${bg.preview};vertical-align:middle;margin-right:6px"></span>
                ${bg.name}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    this._showFeatureModal('cosmetics-modal', html);

    document.querySelectorAll('.cosmetic-item.unlocked, .cosmetic-item').forEach(el => {
      el.addEventListener('click', () => {
        const type = el.dataset.type;
        const id = el.dataset.id;
        if (type === 'pieceset') setActivePieceSet(id);
        else if (type === 'title') setActiveTitle(id);
        else if (type === 'background') setActiveBackground(id);
        this._showCosmeticsPanel(); // refresh
      });
    });
  }

  _describeCondition(cond) {
    if (!cond) return 'Available';
    switch (cond.type) {
      case 'games': return `Play ${cond.count} games`;
      case 'rating': return `Reach ${cond.value} rating`;
      case 'streak': return `${cond.count}-game win streak`;
      case 'puzzles': return `Solve ${cond.count} puzzles`;
      case 'achievement': return `Unlock achievement "${cond.id}"`;
      default: return 'Unknown';
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  LEADERBOARD
  // ══════════════════════════════════════════════════════════════

  _initLeaderboard() {
    const btn = document.getElementById('btn-leaderboard');
    if (btn) btn.addEventListener('click', () => this._showLeaderboard());
  }

  async _showLeaderboard() {
    let entries = [];
    try { entries = await this.multiplayer.getLeaderboard(); } catch (e) { /* offline */ }
    
    const html = `
      <div style="min-width:380px">
        <h3 style="margin-bottom:16px;text-align:center">🏆 Leaderboard</h3>
        ${entries.length === 0
          ? '<div style="text-align:center;color:var(--text-muted);padding:20px">No entries yet. Play multiplayer games to appear!</div>'
          : `<div style="max-height:400px;overflow-y:auto">
              <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
                <thead>
                  <tr style="color:var(--text-muted);border-bottom:1px solid var(--border-glow)">
                    <th style="padding:6px;text-align:left">#</th>
                    <th style="padding:6px;text-align:left">Player</th>
                    <th style="padding:6px;text-align:right">Rating</th>
                    <th style="padding:6px;text-align:right">W/L/D</th>
                  </tr>
                </thead>
                <tbody>
                  ${entries.slice(0, 50).map((e, i) => `
                    <tr style="border-bottom:1px solid rgba(100,120,255,0.05)">
                      <td style="padding:6px;color:${i < 3 ? 'var(--accent-gold)' : 'var(--text-muted)'}">${i + 1}</td>
                      <td style="padding:6px;font-weight:${i < 3 ? 600 : 400}">${e.player_name}</td>
                      <td style="padding:6px;text-align:right;color:var(--accent-cyan)">${e.rating}</td>
                      <td style="padding:6px;text-align:right;font-size:0.75rem;color:var(--text-secondary)">${e.wins}/${e.losses}/${e.draws}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>
    `;
    this._showFeatureModal('leaderboard-modal', html);
  }

  // ══════════════════════════════════════════════════════════════
  //  URL PARAMS (challenge links)
  // ══════════════════════════════════════════════════════════════

  _checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode && joinCode.length === 6) {
      setTimeout(async () => {
        try {
          await this.multiplayer.joinRoom(joinCode);
        } catch (e) {
          console.warn('Auto-join failed:', e);
        }
        // Clean URL
        history.replaceState(null, '', window.location.pathname);
      }, 1000);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  UTILITY (shared modal helpers)
  // ══════════════════════════════════════════════════════════════

  _showFeatureModal(id, html) {
    // Remove existing modal with same ID
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = id;
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)';
    modal.innerHTML = `
      <div style="background:var(--bg-panel);border:1px solid var(--border-glow);border-radius:16px;padding:24px;max-width:90vw;max-height:90vh;overflow-y:auto;position:relative;animation:overlay-in 0.2s ease-out">
        <button class="modal-close-btn" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;padding:4px 8px">✕</button>
        ${html}
      </div>
    `;
    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    modal.querySelector('.modal-close-btn').addEventListener('click', () => modal.remove());
  }

  _closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.remove();
  }

  _loadPosition(fen, pieces, legalMoves) {
    this.fen = fen;
    this.pieces = pieces || [];
    this.legalMoves = legalMoves || [];
    this.board.updatePieces(this.pieces);
    this._updateUI();
  }
}

// ---- Bootstrap ----
(async () => {
  await initBridge();
  const game = new ChessGame();
  window.game = game;
})();
