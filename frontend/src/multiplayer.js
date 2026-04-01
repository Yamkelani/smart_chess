/**
 * Multiplayer Module — Online play with room codes, spectating, and chat
 * 
 * Uses polling-based REST API for real-time multiplayer.
 * Players create/join rooms with 6-character codes.
 */
import { isTauri, getEngineBaseUrl } from './bridge.js';

function getBase() { return isTauri() ? '' : '/api/engine'; }

const POLL_INTERVAL = 1000; // 1 second polling

export class MultiplayerManager {
  constructor() {
    this.playerId = this._getPlayerId();
    this.playerName = localStorage.getItem('chess3d_player_name') || 'Player';
    this.roomId = null;
    this.roomCode = null;
    this.isHost = false;
    this.myColor = 'white';
    this.gameId = null;
    this._pollTimer = null;
    this._lastMoveCount = 0;
    this._lastChatCount = 0;
    this._listeners = {};
    this.connected = false;
    this.spectating = false;
  }

  _getPlayerId() {
    let id = localStorage.getItem('chess3d_player_id');
    if (!id) {
      id = 'p_' + Math.random().toString(36).substr(2, 12);
      localStorage.setItem('chess3d_player_id', id);
    }
    return id;
  }

  setPlayerName(name) {
    this.playerName = name;
    localStorage.setItem('chess3d_player_name', name);
  }

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  }

  async createRoom(options = {}) {
    const resp = await fetch(`${getBase()}/multiplayer/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id: this.playerId,
        player_name: this.playerName,
        host_color: options.color || 'white',
        variant: options.variant || 'standard',
        time_control: options.timeControl || null,
      }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    this.roomId = data.room_id;
    this.roomCode = data.room_code;
    this.isHost = true;
    this.myColor = data.host_color;
    this.connected = true;
    this._startPolling();
    this._emit('room-created', data);
    return data;
  }

  async joinRoom(code) {
    const resp = await fetch(`${getBase()}/multiplayer/room/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id: this.playerId,
        player_name: this.playerName,
        room_code: code.toUpperCase(),
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Failed to join room' }));
      throw new Error(err.error || 'Failed to join room');
    }
    const data = await resp.json();
    this.roomId = data.room_id;
    this.roomCode = data.room_code;
    this.isHost = false;
    this.myColor = data.host_color === 'white' ? 'black' : 'white';
    this.gameId = data.game_id;
    this.connected = true;
    this._startPolling();
    this._emit('room-joined', data);
    return data;
  }

  async spectateRoom(roomId) {
    const resp = await fetch(`${getBase()}/multiplayer/room/${roomId}/spectate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spectator_id: this.playerId,
        spectator_name: this.playerName,
      }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    this.roomId = roomId;
    this.spectating = true;
    this.connected = true;
    this._startPolling();
    this._emit('spectating', await resp.json());
  }

  async makeMove(uci) {
    if (!this.roomId) return null;
    const resp = await fetch(`${getBase()}/multiplayer/room/${this.roomId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id: this.playerId,
        uci,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Move failed' }));
      throw new Error(err.error);
    }
    return resp.json();
  }

  async sendChat(text) {
    if (!this.roomId) return;
    await fetch(`${getBase()}/multiplayer/room/${this.roomId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: this.playerId,
        sender_name: this.playerName,
        content: { type: 'text', text },
      }),
    });
  }

  async sendEmote(emote) {
    if (!this.roomId) return;
    await fetch(`${getBase()}/multiplayer/room/${this.roomId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: this.playerId,
        sender_name: this.playerName,
        content: { type: 'emote', emote },
      }),
    });
  }

  async requestRematch() {
    if (!this.roomId) return;
    const resp = await fetch(`${getBase()}/multiplayer/room/${this.roomId}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: this.playerId }),
    });
    return resp.json();
  }

  async leaveRoom() {
    if (!this.roomId) return;
    this._stopPolling();
    try {
      await fetch(`${getBase()}/multiplayer/room/${this.roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: this.playerId }),
      });
    } catch (e) { /* ignore */ }
    this.roomId = null;
    this.roomCode = null;
    this.gameId = null;
    this.connected = false;
    this.spectating = false;
    this._emit('left', {});
  }

  async listRooms() {
    const resp = await fetch(`${getBase()}/multiplayer/rooms`);
    if (!resp.ok) return [];
    return resp.json();
  }

  async getLeaderboard() {
    const resp = await fetch(`${getBase()}/leaderboard`);
    if (!resp.ok) return [];
    return resp.json();
  }

  async updateLeaderboard(rating, result) {
    await fetch(`${getBase()}/leaderboard/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id: this.playerId,
        player_name: this.playerName,
        rating,
        result,
      }),
    });
  }

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _poll() {
    if (!this.roomId) return;
    try {
      const resp = await fetch(`${getBase()}/multiplayer/room/${this.roomId}/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: this.playerId,
          last_move_count: this._lastMoveCount,
          last_chat_count: this._lastChatCount,
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();

      // Check for new moves
      if (data.move_history && data.move_history.length > this._lastMoveCount) {
        this._lastMoveCount = data.move_history.length;
        this._emit('state-update', data);
      }

      // Check for new chat messages
      if (data.new_chat_messages && data.new_chat_messages.length > 0) {
        this._lastChatCount += data.new_chat_messages.length;
        data.new_chat_messages.forEach(msg => this._emit('chat', msg));
      }

      // Check for game start
      if (data.status === 'Playing' && !this.gameId && data.fen) {
        this.gameId = true;
        this._emit('game-started', data);
      }

      // Check for game end
      if (data.game_status && data.game_status !== 'Active') {
        this._emit('game-over', data);
      }

      // Rematch status
      if (data.rematch_requested_by) {
        this._emit('rematch-requested', { by: data.rematch_requested_by });
      }

      // Always emit turn update
      this._emit('turn-update', {
        yourTurn: data.your_turn,
        sideToMove: data.side_to_move,
      });

    } catch (e) {
      // Network error, keep polling
    }
  }

  getShareLink() {
    if (!this.roomCode) return null;
    const base = window.location.origin + window.location.pathname;
    return `${base}?join=${this.roomCode}`;
  }

  getChallengeLink() {
    return this.getShareLink();
  }

  destroy() {
    this._stopPolling();
    this._listeners = {};
  }
}

// Emote definitions
export const EMOTES = [
  { id: 'gg', emoji: '🤝', label: 'Good Game' },
  { id: 'nice', emoji: '👏', label: 'Nice Move' },
  { id: 'think', emoji: '🤔', label: 'Thinking...' },
  { id: 'oops', emoji: '😅', label: 'Oops' },
  { id: 'wow', emoji: '😮', label: 'Wow!' },
  { id: 'gl', emoji: '🍀', label: 'Good Luck' },
  { id: 'fire', emoji: '🔥', label: 'On Fire' },
  { id: 'sad', emoji: '😢', label: 'Sad' },
];
