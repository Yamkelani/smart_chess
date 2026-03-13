/**
 * Chess Sound Effects — Web Audio API
 *
 * Procedurally generated sounds (no external assets needed).
 * Warm, satisfying audio feedback for every interaction.
 */

class ChessSounds {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.35;
    this._initialized = false;
  }

  /** Lazily create AudioContext on first user gesture */
  _ensureContext() {
    if (this._initialized) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._initialized = true;
      return true;
    } catch (e) {
      console.warn('Web Audio API not available');
      return false;
    }
  }

  _gain(vol = this.volume) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.ctx.destination);
    return g;
  }

  /** Short percussive "click" for piece placement */
  playMove() {
    if (!this.enabled || !this._ensureContext()) return;
    const t = this.ctx.currentTime;

    // Wooden "tok" — filtered noise burst + pitched tone
    const g = this._gain(this.volume * 0.7);
    g.gain.setValueAtTime(this.volume * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.06;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 1.5;
    noise.connect(filter);
    filter.connect(g);
    noise.start(t);
    noise.stop(t + 0.06);

    // Pitched "tok"
    const osc = this.ctx.createOscillator();
    const og = this._gain(this.volume * 0.3);
    og.gain.setValueAtTime(this.volume * 0.3, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    osc.connect(og);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** Heavier impact for captures */
  playCapture() {
    if (!this.enabled || !this._ensureContext()) return;
    const t = this.ctx.currentTime;

    // Low thud
    const g1 = this._gain(this.volume * 0.9);
    g1.gain.setValueAtTime(this.volume * 0.9, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(180, t);
    osc1.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    osc1.connect(g1);
    osc1.start(t);
    osc1.stop(t + 0.25);

    // Noise burst (impact)
    const g2 = this._gain(this.volume * 0.6);
    g2.gain.setValueAtTime(this.volume * 0.6, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
    noise.connect(filter);
    filter.connect(g2);
    noise.start(t);
    noise.stop(t + 0.1);

    // Glass shatter overtone
    const g3 = this._gain(this.volume * 0.15);
    g3.gain.setValueAtTime(this.volume * 0.15, t + 0.02);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2400, t + 0.02);
    osc2.frequency.exponentialRampToValueAtTime(800, t + 0.18);
    osc2.connect(g3);
    osc2.start(t + 0.02);
    osc2.stop(t + 0.18);
  }

  /** Alert ping for check */
  playCheck() {
    if (!this.enabled || !this._ensureContext()) return;
    const t = this.ctx.currentTime;

    // Two-tone alert
    for (let i = 0; i < 2; i++) {
      const start = t + i * 0.12;
      const g = this._gain(this.volume * 0.5);
      g.gain.setValueAtTime(this.volume * 0.5, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1100;
      osc.connect(g);
      osc.start(start);
      osc.stop(start + 0.1);
    }
  }

  /** Fanfare for game end */
  playGameOver(isWin = false) {
    if (!this.enabled || !this._ensureContext()) return;
    const t = this.ctx.currentTime;

    if (isWin) {
      // Victory fanfare — ascending arpeggio
      const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const start = t + i * 0.12;
        const g = this._gain(this.volume * 0.4);
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(this.volume * 0.4, start + 0.02);
        g.gain.setValueAtTime(this.volume * 0.4, start + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.connect(g);
        osc.start(start);
        osc.stop(start + 0.35);
      });
    } else {
      // Loss/draw — descending tone
      const g = this._gain(this.volume * 0.4);
      g.gain.setValueAtTime(this.volume * 0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.6);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.8);
    }
  }

  /** Soft click for UI interactions */
  playSelect() {
    if (!this.enabled || !this._ensureContext()) return;
    const t = this.ctx.currentTime;

    const g = this._gain(this.volume * 0.2);
    g.gain.setValueAtTime(this.volume * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /** Illegal move buzzer */
  playIllegal() {
    if (!this.enabled || !this._ensureContext()) return;
    const t = this.ctx.currentTime;

    const g = this._gain(this.volume * 0.25);
    g.gain.setValueAtTime(this.volume * 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 150;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Gentle notification for AI learning events */
  playNotification() {
    if (!this.enabled || !this._ensureContext()) return;
    const t = this.ctx.currentTime;

    const g = this._gain(this.volume * 0.15);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(this.volume * 0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, t);   // G5
    osc.frequency.setValueAtTime(1047, t + 0.08); // C6
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

export const sounds = new ChessSounds();
