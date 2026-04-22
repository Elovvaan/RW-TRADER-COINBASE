// src/ui.js – Tactical command-center dashboard (single-file, zero deps)

export function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RW-TRADER · CB Advanced</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:       #080b0f;
    --surface:  #0d1117;
    --panel:    #111820;
    --border:   #1e2d3d;
    --accent:   #00e5ff;
    --accent2:  #39ff14;
    --warn:     #ff9100;
    --danger:   #ff1744;
    --text:     #c8d6e5;
    --muted:    #4a6078;
    --mono:     'Share Tech Mono', monospace;
    --display:  'Orbitron', sans-serif;
    --ui:       'Rajdhani', sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--ui);
    font-size: 14px;
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Scanline overlay */
  body::before {
    content: '';
    position: fixed; inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,229,255,0.012) 2px,
      rgba(0,229,255,0.012) 4px
    );
    pointer-events: none;
    z-index: 9999;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: sticky; top: 0; z-index: 100;
  }

  .logo {
    font-family: var(--display);
    font-size: 18px;
    font-weight: 900;
    color: var(--accent);
    letter-spacing: 0.2em;
    text-shadow: 0 0 20px rgba(0,229,255,0.5);
  }

  .logo span { color: var(--muted); font-weight: 400; font-size: 12px; margin-left: 12px; }

  .header-right { display: flex; gap: 16px; align-items: center; }

  .badge {
    font-family: var(--mono);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 2px;
    border: 1px solid currentColor;
    letter-spacing: 0.1em;
  }
  .badge.ok    { color: var(--accent2); border-color: var(--accent2); background: rgba(57,255,20,0.08); }
  .badge.warn  { color: var(--warn);   border-color: var(--warn);   background: rgba(255,145,0,0.08); }
  .badge.danger{ color: var(--danger); border-color: var(--danger); background: rgba(255,23,68,0.08); }

  main {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    padding: 20px 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  @media (max-width: 1100px) { main { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 720px)  { main { grid-template-columns: 1fr; } }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
    position: relative;
    overflow: hidden;
  }

  .panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent), transparent);
  }

  .panel.full { grid-column: 1 / -1; }

  .panel-title {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-title .refresh-btn {
    cursor: pointer;
    color: var(--accent);
    font-size: 18px;
    line-height: 1;
    opacity: 0.6;
    transition: opacity 0.2s;
    background: none; border: none;
  }
  .panel-title .refresh-btn:hover { opacity: 1; }

  /* Metrics */
  .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .metric-item { }
  .metric-label { font-size: 10px; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }
  .metric-value { font-family: var(--mono); font-size: 20px; color: var(--accent); }
  .metric-value.warn   { color: var(--warn); }
  .metric-value.danger { color: var(--danger); }
  .metric-value.ok     { color: var(--accent2); }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 12px; }
  th { color: var(--muted); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border); font-family: var(--ui); }
  td { padding: 8px 8px; border-bottom: 1px solid rgba(30,45,61,0.5); vertical-align: top; }
  tr:hover td { background: rgba(0,229,255,0.03); }

  .tag {
    display: inline-block;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 2px;
    font-family: var(--mono);
    letter-spacing: 0.05em;
  }
  .tag.buy    { background: rgba(57,255,20,0.15);  color: var(--accent2); }
  .tag.sell   { background: rgba(255,23,68,0.15);  color: var(--danger); }
  .tag.wait   { background: rgba(74,96,120,0.2);   color: var(--muted); }
  .tag.assist { background: rgba(255,145,0,0.15);  color: var(--warn); }
  .tag.auto   { background: rgba(0,229,255,0.15);  color: var(--accent); }
  .tag.off    { background: rgba(255,23,68,0.1);   color: var(--danger); }
  .tag.dry    { background: rgba(255,145,0,0.1);   color: var(--warn); border: 1px solid var(--warn); }

  /* Controls */
  .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  .btn {
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.15em;
    padding: 8px 16px;
    border-radius: 2px;
    cursor: pointer;
    border: 1px solid;
    background: transparent;
    text-transform: uppercase;
    transition: all 0.2s;
  }
  .btn-accent  { color: var(--accent);  border-color: var(--accent);  }
  .btn-danger  { color: var(--danger);  border-color: var(--danger);  }
  .btn-warn    { color: var(--warn);    border-color: var(--warn);    }
  .btn-ok      { color: var(--accent2); border-color: var(--accent2); }
  .btn:hover   { filter: brightness(1.3); box-shadow: 0 0 12px currentColor; }
  .btn:active  { transform: scale(0.97); }

  /* Log stream */
  #log-stream {
    font-family: var(--mono);
    font-size: 11px;
    height: 220px;
    overflow-y: auto;
    background: #050810;
    border: 1px solid var(--border);
    padding: 10px;
    border-radius: 2px;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .log-line { margin: 2px 0; line-height: 1.5; }
  .log-line.info  { color: var(--text); }
  .log-line.warn  { color: var(--warn); }
  .log-line.error { color: var(--danger); }
  .log-ts { color: var(--muted); margin-right: 8px; }
  .log-event { color: var(--accent); margin-right: 8px; }

  .status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .status-dot.ok     { background: var(--accent2); box-shadow: 0 0 6px var(--accent2); animation: pulse 2s infinite; }
  .status-dot.warn   { background: var(--warn); }
  .status-dot.danger { background: var(--danger); box-shadow: 0 0 6px var(--danger); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .empty { color: var(--muted); font-family: var(--mono); font-size: 12px; padding: 12px 0; }

  select {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 6px 10px;
    font-family: var(--mono);
    font-size: 12px;
    cursor: pointer;
  }
</style>
</head>
<body>

<header>
  <div class="logo">RW-TRADER <span>· COINBASE ADVANCED TRADE</span></div>
  <div class="header-right">
    <span id="dry-run-badge" class="badge warn">DRY RUN</span>
    <span id="authority-badge" class="badge warn">ASSIST</span>
    <span id="kill-badge" class="badge ok">LIVE</span>
    <span id="ws-badge" class="badge warn">WS ···</span>
  </div>
</header>

<main>

  <!-- Health / Status -->
  <div class="panel">
    <div class="panel-title">System Status <button class="refresh-btn" onclick="loadHealth()">⟳</button></div>
    <div class="metrics" id="health-metrics">
      <div class="metric-item"><div class="metric-label">Agent</div><div class="metric-value" id="m-agent">—</div></div>
      <div class="metric-item"><div class="metric-label">Authority</div><div class="metric-value" id="m-authority">—</div></div>
      <div class="metric-item"><div class="metric-label">Kill Switch</div><div class="metric-value" id="m-kill">—</div></div>
      <div class="metric-item"><div class="metric-label">Mode</div><div class="metric-value" id="m-mode">—</div></div>
    </div>
  </div>

  <!-- Balances -->
  <div class="panel">
    <div class="panel-title">Balances <button class="refresh-btn" onclick="loadBalances()">⟳</button></div>
    <table id="balances-table">
      <thead><tr><th>Asset</th><th>Available</th><th>Hold</th></tr></thead>
      <tbody id="balances-body"><tr><td colspan="3" class="empty">Loading…</td></tr></tbody>
    </table>
  </div>

  <!-- Daily P&L -->
  <div class="panel">
    <div class="panel-title">Portfolio State <button class="refresh-btn" onclick="loadPositions()">⟳</button></div>
    <div class="metrics">
      <div class="metric-item"><div class="metric-label">Daily Loss</div><div class="metric-value" id="m-daily-loss">—</div></div>
      <div class="metric-item"><div class="metric-label">Open Positions</div><div class="metric-value" id="m-positions">—</div></div>
    </div>
    <div style="margin-top:14px">
      <table>
        <thead><tr><th>Pair</th><th>Entry</th><th>Mark/Last</th><th>Unrealized PnL</th><th>TP</th><th>SL</th><th>Signal Age</th><th>Position Age</th><th>Mkt Update Age</th></tr></thead>
        <tbody id="positions-body"><tr><td colspan="9" class="empty">No open positions.</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Signals -->
  <div class="panel full">
    <div class="panel-title">Latest Signals <button class="refresh-btn" onclick="loadSignals()">⟳</button></div>
    <table>
      <thead><tr><th>Pair</th><th>Action</th><th>Confidence</th><th>Reason</th><th>Entry</th><th>TP</th><th>SL</th><th>1D Trend</th><th>RSI 4H</th><th>Age</th></tr></thead>
      <tbody id="signals-body"><tr><td colspan="10" class="empty">Waiting for first signal cycle…</td></tr></tbody>
    </table>
  </div>

  <!-- Orders -->
  <div class="panel full">
    <div class="panel-title">Open Orders <button class="refresh-btn" onclick="loadOrders()">⟳</button></div>
    <table>
      <thead><tr><th>Product</th><th>Side</th><th>Status</th><th>Type</th><th>Size</th><th>Price</th><th>Created</th></tr></thead>
      <tbody id="orders-body"><tr><td colspan="7" class="empty">Loading…</td></tr></tbody>
    </table>
  </div>

  <!-- Controls -->
  <div class="panel">
    <div class="panel-title">Kill Switch Control</div>
    <div class="controls">
      <button class="btn btn-danger" onclick="setKillSwitch(true)">⛔ ACTIVATE KILL SWITCH</button>
      <button class="btn btn-ok"    onclick="setKillSwitch(false)">✓ DEACTIVATE</button>
    </div>
  </div>

  <!-- Authority Control -->
  <div class="panel">
    <div class="panel-title">Authority Mode</div>
    <div class="controls">
      <select id="authority-select">
        <option value="OFF">OFF – No trading</option>
        <option value="ASSIST">ASSIST – Signals only</option>
        <option value="AUTO">AUTO – Autonomous</option>
      </select>
      <button class="btn btn-accent" onclick="setAuthority()">SET MODE</button>
    </div>
    <div id="mode-msg" style="margin-top:10px;font-family:var(--mono);font-size:11px;color:var(--muted)"></div>
  </div>

  <!-- Cancel Orders -->
  <div class="panel">
    <div class="panel-title">Order Management</div>
    <div class="controls">
      <button class="btn btn-warn" onclick="cancelAll()">✕ CANCEL ALL OPEN ORDERS</button>
    </div>
    <div id="cancel-msg" style="margin-top:10px;font-family:var(--mono);font-size:11px;color:var(--muted)"></div>
  </div>

  <!-- Log Stream -->
  <div class="panel full">
    <div class="panel-title">Audit Log Stream <button class="refresh-btn" onclick="loadLogs()">⟳</button></div>
    <div id="log-stream"><div class="log-line info"><span class="log-ts">—</span><span class="log-event">SYSTEM</span>Dashboard connected.</div></div>
  </div>

</main>

<script>
const BASE = '';
const logs = [];

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  return r.json();
}

function fmt(n, dec=2) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function ago(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return Math.floor(s/3600) + 'h ago';
}

function ageSpan(ts) {
  const safeTs = (typeof ts === 'number' && Number.isFinite(ts)) ? ts : null;
  if (!safeTs) return '<span style="color:var(--muted)">—</span>';
  const attrTs = Math.trunc(safeTs);
  return \`<span data-age-ts="\${attrTs}" style="color:var(--muted)">\${ago(attrTs)}</span>\`;
}

// ── Health ──
async function loadHealth() {
  const d = await api('GET', '/health');
  document.getElementById('m-agent').textContent    = d.wsConnected ? '● ONLINE' : '○ WS OFF';
  document.getElementById('m-agent').className      = 'metric-value ' + (d.wsConnected ? 'ok' : 'warn');
  document.getElementById('m-authority').textContent = d.authority;
  document.getElementById('m-kill').textContent      = d.killSwitch ? 'ACTIVE' : 'CLEAR';
  document.getElementById('m-kill').className        = 'metric-value ' + (d.killSwitch ? 'danger' : 'ok');
  document.getElementById('m-mode').textContent      = d.dryRun ? 'DRY RUN' : 'LIVE';
  document.getElementById('m-mode').className        = 'metric-value ' + (d.dryRun ? 'warn' : 'danger');

  // Badges
  document.getElementById('dry-run-badge').textContent  = d.dryRun ? 'DRY RUN' : 'LIVE';
  document.getElementById('dry-run-badge').className    = 'badge ' + (d.dryRun ? 'warn' : 'danger');
  document.getElementById('authority-badge').textContent = d.authority;
  document.getElementById('authority-badge').className  = 'badge ' + (d.authority === 'OFF' ? 'danger' : d.authority === 'ASSIST' ? 'warn' : 'ok');
  document.getElementById('kill-badge').textContent     = d.killSwitch ? 'KILLED' : 'LIVE';
  document.getElementById('kill-badge').className       = 'badge ' + (d.killSwitch ? 'danger' : 'ok');
  document.getElementById('ws-badge').textContent       = d.wsConnected ? 'WS ●' : 'WS REST';
  document.getElementById('ws-badge').className         = 'badge ' + (d.wsConnected ? 'ok' : 'warn');

  addLog('info', 'HEALTH', 'Status refreshed.');
}

// ── Balances ──
async function loadBalances() {
  const d = await api('GET', '/balances');
  const tbody = document.getElementById('balances-body');
  const entries = Object.entries(d.balances || {});
  if (!entries.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty">No balances.</td></tr>'; return; }
  tbody.innerHTML = entries.map(([cur, b]) =>
    \`<tr><td>\${cur}</td><td>\${fmt(b.available, 8)}</td><td>\${fmt(b.hold, 8)}</td></tr>\`
  ).join('');
}

// ── Positions ──
async function loadPositions() {
  const d = await api('GET', '/positions');
  document.getElementById('m-daily-loss').textContent = '$' + fmt(d.dailyLossUsd);
  document.getElementById('m-daily-loss').className   = parseFloat(d.dailyLossUsd) > 0 ? 'metric-value danger' : 'metric-value ok';
  document.getElementById('m-positions').textContent  = d.positions?.length ?? 0;

  const tbody = document.getElementById('positions-body');
  if (!d.positions?.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty">No open positions.</td></tr>'; return; }
  tbody.innerHTML = d.positions.map(p => {
    const pnl = Number(p.unrealizedPnlUsd);
    const pnlValid = Number.isFinite(pnl);
    const pnlClass = pnlValid ? (pnl >= 0 ? 'var(--accent2)' : 'var(--danger)') : 'var(--muted)';
    return \`<tr>
      <td>\${p.productId}</td>
      <td>$\${fmt(p.entryPrice, 2)}</td>
      <td>$\${fmt(p.markPrice, 2)}</td>
      <td><span style="color:\${pnlClass}">\${pnlValid ? (pnl >= 0 ? '+' : '') + '$' + fmt(pnl, 2) : '—'}</span></td>
      <td><span style="color:var(--accent2)">$\${fmt(p.tpPrice, 2)}</span></td>
      <td><span style="color:var(--danger)">$\${fmt(p.slPrice, 2)}</span></td>
      <td>\${ageSpan(p.signalTs)}</td>
      <td>\${ageSpan(p.openedAt)}</td>
      <td>\${ageSpan(p.marketTs ?? p.lastMarketUpdateTs)}</td>
    </tr>\`;
  }).join('');

  addLog('info', 'UI_REFRESH_TICK', 'Positions refreshed (' + (d.positions?.length ?? 0) + ', ws=' + (d.wsConnected ? 'on' : 'off') + ').');
}

// ── Signals ──
async function loadSignals() {
  const d = await api('GET', '/signals');
  const tbody = document.getElementById('signals-body');
  if (!d.signals?.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty">No signals yet.</td></tr>'; return; }
  tbody.innerHTML = d.signals.map(s => {
    const cls = s.action === 'BUY' ? 'buy' : s.action === 'SELL' ? 'sell' : 'wait';
    const conf = s.confidence ? (s.confidence * 100).toFixed(0) + '%' : '—';
    return \`<tr>
      <td>\${s.productId}</td>
      <td><span class="tag \${cls}">\${s.action}</span></td>
      <td>\${conf}</td>
      <td style="color:var(--muted);font-size:11px">\${s.reason}</td>
      <td>$\${fmt(s.entryPrice)}</td>
      <td>\${s.tpPrice ? '$'+fmt(s.tpPrice) : '—'}</td>
      <td>\${s.slPrice ? '$'+fmt(s.slPrice) : '—'}</td>
      <td>\${s.indicators?.trend1d ?? '—'}</td>
      <td>\${s.indicators?.rsi4h ? fmt(s.indicators.rsi4h, 1) : '—'}</td>
      <td>\${ageSpan(s.ts)}</td>
    </tr>\`;
  }).join('');
}

// ── Orders ──
async function loadOrders() {
  const d = await api('GET', '/orders');
  const tbody = document.getElementById('orders-body');
  const orders = d.open || [];
  if (!orders.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No open orders.</td></tr>'; return; }
  tbody.innerHTML = orders.map(o => {
    const side = o.side?.toLowerCase();
    const cfg  = o.order_configuration || {};
    const type = Object.keys(cfg)[0] || 'market';
    return \`<tr>
      <td>\${o.product_id}</td>
      <td><span class="tag \${side}">\${o.side}</span></td>
      <td>\${o.status}</td>
      <td style="font-size:11px;color:var(--muted)">\${type}</td>
      <td>\${o.filled_size || '—'}</td>
      <td>\${o.average_filled_price ? '$'+fmt(o.average_filled_price) : '—'}</td>
      <td style="color:var(--muted);font-size:11px">\${o.created_time ? new Date(o.created_time).toLocaleTimeString() : '—'}</td>
    </tr>\`;
  }).join('');
}

// ── Kill switch ──
async function setKillSwitch(active) {
  const d = await api('POST', '/kill-switch', { active });
  addLog(active ? 'error' : 'info', 'KILL_SWITCH', active ? 'ACTIVATED' : 'DEACTIVATED');
  loadHealth();
}

// ── Authority ──
async function setAuthority() {
  const val = document.getElementById('authority-select').value;
  const d = await api('POST', '/mode', { authority: val });
  const msg = document.getElementById('mode-msg');
  if (d.error) { msg.style.color = 'var(--danger)'; msg.textContent = '✗ ' + d.error; }
  else { msg.style.color = 'var(--accent2)'; msg.textContent = '✓ Authority set to ' + d.authority; }
  addLog('info', 'AUTHORITY', 'Changed to ' + val);
  loadHealth();
}

// ── Cancel orders ──
async function cancelAll() {
  const msg = document.getElementById('cancel-msg');
  const d = await api('DELETE', '/orders');
  if (d.error) { msg.style.color='var(--danger)'; msg.textContent='✗ '+d.error; }
  else { msg.style.color='var(--warn)'; msg.textContent='✓ Cancelled '+d.cancelled+' orders'; }
  addLog('warn', 'CANCEL', 'Cancelled ' + (d.cancelled || 0) + ' orders.');
  loadOrders();
}

// ── Logs ──
function addLog(level, event, detail) {
  const ts = new Date().toTimeString().split(' ')[0];
  const div = document.createElement('div');
  div.className = 'log-line ' + level;
  div.innerHTML = \`<span class="log-ts">\${ts}</span><span class="log-event">\${event}</span>\${detail}\`;
  const stream = document.getElementById('log-stream');
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;
  if (stream.children.length > 200) stream.removeChild(stream.firstChild);
}

async function loadLogs() {
  addLog('info', 'REFRESH', 'Manual refresh triggered.');
  await Promise.all([loadHealth(), loadBalances(), loadSignals(), loadOrders(), loadPositions()]);
}

function refreshAgeCells() {
  document.querySelectorAll('[data-age-ts]').forEach((el) => {
    const ts = Number(el.dataset.ageTs);
    el.textContent = ago(ts);
  });
}

// ── Auto-refresh ──
function startAutoRefresh() {
  setInterval(loadHealth,    10000);
  setInterval(loadBalances,  30000);
  setInterval(loadSignals,   15000);
  setInterval(loadOrders,    15000);
  setInterval(loadPositions, 5000);
  setInterval(refreshAgeCells, 1000);
}

// ── Init ──
(async () => {
  await Promise.all([loadHealth(), loadBalances(), loadSignals(), loadOrders(), loadPositions()]);
  startAutoRefresh();
  addLog('info', 'DASHBOARD', 'Auto-refresh active.');
})();
</script>
</body>
</html>`;
}
