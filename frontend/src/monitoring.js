/**
 * AI Model Monitoring Dashboard
 *
 * Provides real-time visibility into:
 *  - Training loss curves (policy + value)
 *  - Win/loss/draw rates over time
 *  - ELO rating trend
 *  - Model drift detection
 *  - Benchmark evaluation accuracy
 *  - Active alerts
 */

import { getAiBaseUrl } from './bridge.js';

function aiBase() { return getAiBaseUrl(); }

// ── API helpers ──

async function fetchJSON(path) {
  const resp = await fetch(`${aiBase()}${path}`);
  if (!resp.ok) throw new Error(`Monitor API error: ${resp.status}`);
  return resp.json();
}

export async function fetchDashboard()   { return fetchJSON('/ai/monitoring/dashboard'); }
export async function fetchLossHistory() { return fetchJSON('/ai/monitoring/loss-history'); }
export async function fetchWinRate()     { return fetchJSON('/ai/monitoring/win-rate'); }
export async function fetchDrift()       { return fetchJSON('/ai/monitoring/drift'); }
export async function fetchEvaluate()    { return fetchJSON('/ai/monitoring/evaluate'); }

export async function acknowledgeAlert(index) {
  const resp = await fetch(`${aiBase()}/ai/monitoring/acknowledge-alert?index=${index}`, {
    method: 'POST',
  });
  return resp.json();
}

// ── Canvas chart drawing ──

function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

/**
 * Draw a simple line chart on a <canvas> element.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{x:number, y:number}>} data
 * @param {Object} opts  - color, label, yMin, yMax, showDots
 */
function drawLineChart(canvas, data, opts = {}) {
  if (!canvas || !data || data.length === 0) return;

  const ctx = clearCanvas(canvas);
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 24, right: 16, bottom: 28, left: 48 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const color = opts.color || '#4fc3f7';
  const label = opts.label || '';

  // Compute extents
  const ys = data.map(d => d.y);
  let yMin = opts.yMin !== undefined ? opts.yMin : Math.min(...ys);
  let yMax = opts.yMax !== undefined ? opts.yMax : Math.max(...ys);
  if (yMax === yMin) { yMax += 1; yMin -= 0.1; }
  const yRange = yMax - yMin;

  const xMin = 0;
  const xMax = data.length - 1 || 1;

  function toX(i) { return pad.left + (i / xMax) * chartW; }
  function toY(v) { return pad.top + chartH - ((v - yMin) / yRange) * chartH; }

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = pad.top + (i / gridSteps) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    // Y labels
    const val = yMax - (i / gridSteps) * yRange;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(3), pad.left - 4, y + 3);
  }

  // X axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  const labelCount = Math.min(6, data.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.round((i / (labelCount - 1 || 1)) * xMax);
    ctx.fillText(idx + 1, toX(idx), H - 4);
  }

  // Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = toX(i);
    const y = toY(d.y);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  if (opts.showDots !== false && data.length < 80) {
    ctx.fillStyle = color;
    data.forEach((d, i) => {
      ctx.beginPath();
      ctx.arc(toX(i), toY(d.y), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Label
  if (label) {
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, pad.left + 4, pad.top - 6);
  }
}

/**
 * Draw dual-line chart (e.g. policy + value loss).
 */
function drawDualLineChart(canvas, data1, data2, opts = {}) {
  if (!canvas || (!data1.length && !data2.length)) return;

  const ctx = clearCanvas(canvas);
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 28, right: 16, bottom: 28, left: 48 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const c1 = opts.color1 || '#4fc3f7';
  const c2 = opts.color2 || '#ff7043';
  const l1 = opts.label1 || 'Series 1';
  const l2 = opts.label2 || 'Series 2';

  const allY = [...data1.map(d => d.y), ...data2.map(d => d.y)];
  let yMin = Math.min(...allY);
  let yMax = Math.max(...allY);
  if (yMax === yMin) { yMax += 1; yMin -= 0.1; }
  const yRange = yMax - yMin;
  const xMax = Math.max(data1.length, data2.length) - 1 || 1;

  function toX(i) { return pad.left + (i / xMax) * chartW; }
  function toY(v) { return pad.top + chartH - ((v - yMin) / yRange) * chartH; }

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    const val = yMax - (i / 4) * yRange;
    ctx.fillText(val.toFixed(3), pad.left - 4, y + 3);
  }

  // Draw line helper
  function drawLine(data, color) {
    if (!data.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = toX(i);
      const y = toY(d.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  drawLine(data1, c1);
  drawLine(data2, c2);

  // Legend
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = c1; ctx.fillText(`● ${l1}`, pad.left + 4, pad.top - 8);
  ctx.fillStyle = c2; ctx.fillText(`● ${l2}`, pad.left + 120, pad.top - 8);
}

/**
 * Draw a bar chart (e.g., win/loss/draw distribution).
 */
function drawBarChart(canvas, labels, values, colors) {
  if (!canvas) return;

  const ctx = clearCanvas(canvas);
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 20, right: 16, bottom: 32, left: 16 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  const maxVal = Math.max(...values, 1);
  const barW = chartW / labels.length * 0.6;
  const gap = chartW / labels.length;

  labels.forEach((label, i) => {
    const barH = (values[i] / maxVal) * chartH;
    const x = pad.left + i * gap + (gap - barW) / 2;
    const y = pad.top + chartH - barH;

    ctx.fillStyle = colors[i] || '#4fc3f7';
    ctx.fillRect(x, y, barW, barH);

    // Value text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(values[i], x + barW / 2, y - 4);

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px sans-serif';
    ctx.fillText(label, x + barW / 2, H - 8);
  });
}


// ── Dashboard Renderer ──

export class MonitoringDashboard {
  constructor(containerEl) {
    this.container = containerEl;
    this._refreshTimer = null;
    this._built = false;
  }

  /**
   * Build the dashboard UI and start auto-refresh.
   */
  async init() {
    this._buildUI();
    await this.refresh();
    // Auto-refresh every 30 seconds
    this._refreshTimer = setInterval(() => this.refresh(), 30000);
  }

  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
  }

  _buildUI() {
    if (this._built) return;
    this._built = true;

    this.container.innerHTML = `
      <div class="monitor-dashboard">
        <div class="monitor-header">
          <h3>AI Model Monitoring</h3>
          <div class="monitor-actions">
            <button id="monitor-refresh" title="Refresh now">↻ Refresh</button>
            <button id="monitor-evaluate" title="Run benchmark evaluation">🧪 Evaluate</button>
            <button id="monitor-drift" title="Run drift check">📊 Drift Check</button>
          </div>
        </div>

        <!-- Alerts -->
        <div id="monitor-alerts" class="monitor-alerts"></div>

        <!-- Summary cards -->
        <div class="monitor-cards">
          <div class="monitor-card">
            <div class="card-label">ELO Rating</div>
            <div class="card-value" id="m-elo">—</div>
          </div>
          <div class="monitor-card">
            <div class="card-label">Games Played</div>
            <div class="card-value" id="m-games">—</div>
          </div>
          <div class="monitor-card">
            <div class="card-label">Win Rate</div>
            <div class="card-value" id="m-winrate">—</div>
          </div>
          <div class="monitor-card">
            <div class="card-label">Model Gen</div>
            <div class="card-value" id="m-generation">—</div>
          </div>
          <div class="monitor-card">
            <div class="card-label">Benchmark</div>
            <div class="card-value" id="m-benchmark">—</div>
          </div>
          <div class="monitor-card">
            <div class="card-label">Avg Moves</div>
            <div class="card-value" id="m-avgmoves">—</div>
          </div>
        </div>

        <!-- Charts row 1 -->
        <div class="monitor-charts-row">
          <div class="monitor-chart-box">
            <canvas id="chart-loss" width="420" height="200"></canvas>
          </div>
          <div class="monitor-chart-box">
            <canvas id="chart-elo" width="420" height="200"></canvas>
          </div>
        </div>

        <!-- Charts row 2 -->
        <div class="monitor-charts-row">
          <div class="monitor-chart-box">
            <canvas id="chart-winrate" width="420" height="200"></canvas>
          </div>
          <div class="monitor-chart-box">
            <canvas id="chart-results" width="420" height="200"></canvas>
          </div>
        </div>

        <!-- Drift & eval details -->
        <div class="monitor-details">
          <div id="monitor-drift-info" class="monitor-detail-box">
            <h4>Drift Detection</h4>
            <p class="muted">Play more games to enable drift detection.</p>
          </div>
          <div id="monitor-eval-info" class="monitor-detail-box">
            <h4>Benchmark Evaluation</h4>
            <p class="muted">No evaluations yet.</p>
          </div>
        </div>
      </div>
    `;

    // Wire buttons
    this.container.querySelector('#monitor-refresh').addEventListener('click', () => this.refresh());
    this.container.querySelector('#monitor-evaluate').addEventListener('click', () => this._runEval());
    this.container.querySelector('#monitor-drift').addEventListener('click', () => this._runDrift());
  }

  async refresh() {
    try {
      const data = await fetchDashboard();
      this._render(data);
    } catch (err) {
      console.warn('[Monitor] dashboard fetch failed:', err);
    }
  }

  _render(data) {
    const s = data.summary || {};

    // Summary cards
    this._setText('m-elo', s.elo_rating ?? '—');
    this._setText('m-games', s.total_games ?? 0);
    this._setText('m-winrate', s.overall_win_rate !== undefined
      ? `${(s.overall_win_rate * 100).toFixed(1)}%` : '—');
    this._setText('m-generation', s.model_generation ?? '—');
    this._setText('m-avgmoves', s.avg_game_length ?? '—');

    // Benchmark
    const evalInfo = data.latest_evaluation;
    this._setText('m-benchmark', evalInfo
      ? `${(evalInfo.accuracy * 100).toFixed(0)}%`
      : '—');

    // Alerts
    this._renderAlerts(data.active_alerts || []);

    // Loss chart (dual: policy + value)
    const lossTrend = data.loss_trend || [];
    if (lossTrend.length > 0) {
      const pData = lossTrend.map((e, i) => ({ x: i, y: e.policy_loss }));
      const vData = lossTrend.map((e, i) => ({ x: i, y: e.value_loss }));
      drawDualLineChart(
        document.getElementById('chart-loss'),
        pData, vData,
        { color1: '#4fc3f7', color2: '#ff7043', label1: 'Policy Loss', label2: 'Value Loss' }
      );
    }

    // ELO chart
    const eloTrend = data.elo_trend || [];
    if (eloTrend.length > 0) {
      drawLineChart(
        document.getElementById('chart-elo'),
        eloTrend.map((e, i) => ({ x: i, y: e.elo })),
        { color: '#66bb6a', label: 'ELO Rating', yMin: 800, yMax: 1600 }
      );
    }

    // Win rate trend
    this._fetchAndDrawWinRate();

    // Result distribution bar chart
    const dist = data.result_distribution || {};
    drawBarChart(
      document.getElementById('chart-results'),
      ['AI Wins', 'AI Losses', 'Draws'],
      [dist.win || 0, dist.loss || 0, dist.draw || 0],
      ['#66bb6a', '#ef5350', '#ffa726']
    );

    // Drift info
    this._renderDriftInfo(data);

    // Eval info
    this._renderEvalInfo(data);
  }

  async _fetchAndDrawWinRate() {
    try {
      const res = await fetchWinRate();
      const trend = res.win_rate_trend || [];
      if (trend.length > 0) {
        drawLineChart(
          document.getElementById('chart-winrate'),
          trend.map((e, i) => ({ x: i, y: e.win_rate })),
          { color: '#ab47bc', label: 'Rolling Win Rate (10-game)', yMin: 0, yMax: 1 }
        );
      }
    } catch (e) { /* ignore */ }
  }

  _renderAlerts(alerts) {
    const el = document.getElementById('monitor-alerts');
    if (!el) return;
    if (!alerts.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = alerts.map((a, i) => `
      <div class="monitor-alert monitor-alert-${a.type}">
        <span class="alert-icon">⚠</span>
        <span class="alert-msg">${a.message}</span>
        <button class="alert-dismiss" data-idx="${i}" title="Dismiss">✕</button>
      </div>
    `).join('');

    el.querySelectorAll('.alert-dismiss').forEach(btn => {
      btn.addEventListener('click', async () => {
        await acknowledgeAlert(parseInt(btn.dataset.idx));
        this.refresh();
      });
    });
  }

  _renderDriftInfo(data) {
    const el = document.getElementById('monitor-drift-info');
    if (!el) return;

    // Find the latest drift report from dashboard if we have one
    // (not directly in dashboard, but can be fetched)
    el.innerHTML = `
      <h4>Drift Detection</h4>
      <p class="muted">Click "Drift Check" to compare recent vs baseline performance.</p>
    `;
  }

  _renderEvalInfo(data) {
    const el = document.getElementById('monitor-eval-info');
    if (!el) return;

    const evals = data.eval_history || [];
    if (!evals.length) {
      el.innerHTML = `<h4>Benchmark Evaluation</h4><p class="muted">No evaluations yet.</p>`;
      return;
    }

    const latest = evals[evals.length - 1];
    el.innerHTML = `
      <h4>Benchmark Evaluation</h4>
      <table class="monitor-table">
        <tr><td>Accuracy</td><td><strong>${(latest.accuracy * 100).toFixed(1)}%</strong></td></tr>
        <tr><td>Correct / Tested</td><td>${latest.correct} / ${latest.positions_tested}</td></tr>
        <tr><td>Avg Value Error</td><td>${latest.avg_value_error.toFixed(4)}</td></tr>
        <tr><td>Generation</td><td>${latest.generation}</td></tr>
      </table>
      ${evals.length > 1 ? `<p class="muted">${evals.length} evaluations recorded</p>` : ''}
    `;
  }

  async _runEval() {
    const btn = document.getElementById('monitor-evaluate');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Running...'; }
    try {
      const result = await fetchEvaluate();
      await this.refresh();
      alert(`Evaluation complete: ${(result.accuracy * 100).toFixed(1)}% accuracy (${result.correct}/${result.positions_tested} positions)`);
    } catch (e) {
      alert('Evaluation failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🧪 Evaluate'; }
    }
  }

  async _runDrift() {
    const btn = document.getElementById('monitor-drift');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking...'; }
    try {
      const result = await fetchDrift();
      const el = document.getElementById('monitor-drift-info');
      if (el) {
        if (result.status === 'insufficient_data') {
          el.innerHTML = `
            <h4>Drift Detection</h4>
            <p>Not enough games yet. Need <strong>${result.games_needed}</strong> games,
            have <strong>${result.games_available}</strong>.</p>
          `;
        } else {
          const driftClass = result.drift_detected ? 'drift-warning' : 'drift-ok';
          el.innerHTML = `
            <h4>Drift Detection</h4>
            <div class="${driftClass}">
              ${result.drift_detected
                ? '⚠ DRIFT DETECTED — model may be degrading'
                : '✓ No significant drift detected'}
            </div>
            <table class="monitor-table">
              <tr><td>Recent Win Rate</td><td>${(result.recent_win_rate * 100).toFixed(1)}%</td></tr>
              <tr><td>Baseline Win Rate</td><td>${(result.baseline_win_rate * 100).toFixed(1)}%</td></tr>
              <tr><td>Magnitude</td><td>${(result.drift_magnitude * 100).toFixed(1)}%</td></tr>
              <tr><td>Recent Avg Loss</td><td>${result.recent_avg_loss.toFixed(4)}</td></tr>
              <tr><td>Baseline Avg Loss</td><td>${result.baseline_avg_loss.toFixed(4)}</td></tr>
              <tr><td>Loss Drift</td><td>${result.loss_drift.toFixed(4)}</td></tr>
            </table>
          `;
        }
      }
    } catch (e) {
      alert('Drift check failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📊 Drift Check'; }
    }
  }

  _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
}
