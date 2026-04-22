export function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RW-Trader · Trading Terminal</title>
<style>
  :root {
    --bg:#070c14;
    --panel:#0f1726;
    --line:#22324f;
    --text:#d8e6ff;
    --muted:#8298be;
    --ok:#2dd5a1;
    --bad:#ff6666;
    --warn:#ffcf66;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
  .terminal {
    min-height:100vh;
    display:grid;
    grid-template-rows:56px 1fr 240px;
    grid-template-columns:290px 1fr 340px;
    grid-template-areas:
      "top top top"
      "left center right"
      "bottom bottom bottom";
    gap:8px;
    padding:8px;
  }
  .card { background:linear-gradient(180deg, var(--panel), #0b1423); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .topbar { grid-area:top; display:flex; align-items:center; gap:8px; padding:8px; flex-wrap:wrap; }
  .left { grid-area:left; display:flex; flex-direction:column; }
  .center { grid-area:center; display:flex; flex-direction:column; }
  .right { grid-area:right; display:flex; flex-direction:column; }
  .bottom { grid-area:bottom; display:flex; flex-direction:column; }
  .pill {
    display:inline-flex; align-items:center; gap:6px;
    height:36px; padding:0 10px; border:1px solid var(--line); border-radius:8px;
    background:rgba(255,255,255,0.02); font-size:12px;
  }
  .pill b { font-size:13px; }
  .dot { width:8px; height:8px; border-radius:999px; display:inline-block; }
  .dot.ok { background:var(--ok); box-shadow:0 0 10px rgba(45,213,161,.8); }
  .dot.bad { background:var(--bad); box-shadow:0 0 10px rgba(255,102,102,.8); }
  .dot.warn { background:var(--warn); box-shadow:0 0 10px rgba(255,207,102,.8); }
  .grow { flex:1; }

  .section-title {
    padding:10px 12px;
    font-size:11px;
    letter-spacing:.09em;
    text-transform:uppercase;
    color:var(--muted);
    border-bottom:1px solid var(--line);
    background:rgba(255,255,255,.02);
  }

  .watchlist { width:100%; border-collapse:collapse; font-size:12px; }
  .watchlist th, .watchlist td { border-bottom:1px solid var(--line); padding:8px 6px; text-align:left; }
  .watchlist th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  .watchlist tr.active { background:rgba(102,179,255,.12); }
  .watchlist tr.has-pos { box-shadow:inset 3px 0 0 var(--ok); }
  .watchlist td.num { text-align:right; font-variant-numeric:tabular-nums; }

  .badge { font-size:10px; padding:3px 6px; border-radius:999px; border:1px solid; text-transform:uppercase; letter-spacing:.05em; }
  .badge-real { color:#8be9c2; border-color:#2f705c; background:rgba(45,213,161,.12); }
  .badge-paper { color:#c5d7ff; border-color:#4a628d; background:rgba(102,179,255,.08); }
  .badge-buy { color:#8be9c2; border-color:#2f705c; background:rgba(45,213,161,.12); }
  .badge-sell { color:#ffc1c1; border-color:#7f3a3a; background:rgba(255,102,102,.12); }
  .badge-wait { color:#f8dd95; border-color:#735f2c; background:rgba(255,207,102,.12); }

  .chart-toolbar {
    display:flex; flex-wrap:wrap; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line);
    align-items:center;
  }
  select, button {
    background:#111c2f; border:1px solid #334c74; color:var(--text); border-radius:6px; padding:6px 8px; font-size:12px;
  }
  button { cursor:pointer; }
  button:hover { filter:brightness(1.1); }
  button:disabled { opacity:.45; cursor:not-allowed; }

  .chart-wrap { position:relative; height:100%; min-height:420px; display:flex; flex-direction:column; }
  #main-chart { width:100%; height:100%; display:block; }
  .chart-meta {
    position:absolute; right:12px; top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;
  }
  .stat { font-size:11px; color:var(--muted); border:1px solid var(--line); border-radius:6px; padding:4px 6px; background:rgba(0,0,0,.15); }
  .confidence-bar { width:100px; height:6px; border-radius:999px; overflow:hidden; border:1px solid var(--line); background:#0b1422; }
  .confidence-fill { height:100%; background:linear-gradient(90deg, var(--bad), var(--warn), var(--ok)); transition:width .35s ease; }

  .panel-body { padding:10px 12px; display:grid; gap:8px; }
  .kv { display:flex; justify-content:space-between; gap:8px; font-size:12px; padding:6px 0; border-bottom:1px dashed rgba(130,152,190,.25); }
  .kv .k { color:var(--muted); }
  .kv .v { font-variant-numeric:tabular-nums; }

  .control-grid { display:grid; gap:8px; grid-template-columns:1fr 1fr; }
  .control-grid .full { grid-column:1 / -1; }
  .btn-danger { border-color:#7f3a3a; color:#ffc1c1; }
  .btn-safe { border-color:#2f705c; color:#8be9c2; }

  .tabs { display:flex; border-bottom:1px solid var(--line); background:rgba(255,255,255,.02); }
  .tab-btn {
    border:none; border-right:1px solid var(--line); border-radius:0; background:transparent; color:var(--muted);
    padding:10px 12px; font-size:12px;
  }
  .tab-btn.active { color:var(--text); background:rgba(102,179,255,.08); }
  .tab-panel { display:none; height:100%; overflow:auto; }
  .tab-panel.active { display:block; }

  table.grid { width:100%; border-collapse:collapse; font-size:12px; }
  .grid th, .grid td { padding:8px 6px; border-bottom:1px solid var(--line); text-align:left; }
  .grid th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  .grid td.num { text-align:right; font-variant-numeric:tabular-nums; }

  .up { color:var(--ok); }
  .down { color:var(--bad); }
  .neutral { color:var(--muted); }
  .flash-up { animation:flashUp .6s ease; }
  .flash-down { animation:flashDown .6s ease; }
  .fill-new { animation:fillIn .45s ease; }
  .pnl { transition:color .25s ease, text-shadow .25s ease; }
  .pnl.up { text-shadow:0 0 12px rgba(45,213,161,.35); }
  .pnl.down { text-shadow:0 0 12px rgba(255,102,102,.35); }
  .logs { padding:8px 12px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; color:#a8bce3; white-space:pre-wrap; }

  @keyframes flashUp { from { background:rgba(45,213,161,.25); } to { background:transparent; } }
  @keyframes flashDown { from { background:rgba(255,102,102,.22); } to { background:transparent; } }
  @keyframes fillIn { from { transform:translateY(-6px); opacity:0; } to { transform:translateY(0); opacity:1; } }

  @media (max-width: 1320px) {
    .terminal {
      grid-template-columns:260px 1fr;
      grid-template-areas:
        "top top"
        "left center"
        "right right"
        "bottom bottom";
      grid-template-rows:56px minmax(420px,1fr) auto 240px;
    }
  }
  @media (max-width: 960px) {
    .terminal {
      grid-template-columns:1fr;
      grid-template-areas:
        "top"
        "left"
        "center"
        "right"
        "bottom";
      grid-template-rows:auto auto minmax(380px,1fr) auto 240px;
    }
  }
</style>
</head>
<body>
<div class="terminal">
  <header class="topbar card">
    <div class="pill"><span>Portfolio</span><b id="top-portfolio">$0.00</b></div>
    <div class="pill"><span class="dot" id="dot-crypto"></span><span>Crypto</span><b id="top-crypto">REAL OFF</b></div>
    <div class="pill"><span class="dot" id="dot-stocks"></span><span>Stocks</span><b id="top-stocks">PAPER OFF</b></div>
    <div class="pill"><span>Authority</span><b id="top-authority">ASSIST</b></div>
    <div class="pill"><span class="dot" id="dot-kill"></span><span>Kill</span><b id="top-kill">CLEAR</b></div>
    <div class="pill"><span>Brokers</span><b id="top-brokers">Coinbase: — · Stocks: —</b></div>
    <div class="grow"></div>
    <div class="pill"><span>Clock</span><b id="top-clock">--:--:--</b></div>
    <div class="pill"><span>Last Update</span><b id="top-updated">—</b></div>
  </header>

  <aside class="left card">
    <div class="section-title">Market Watchlist</div>
    <div style="overflow:auto; height:100%;">
      <table class="watchlist">
        <thead><tr><th>Symbol</th><th class="num">Price</th><th class="num">Move</th><th>Signal</th><th>Pos</th></tr></thead>
        <tbody id="watchlist-body"></tbody>
      </table>
    </div>
  </aside>

  <section class="center card">
    <div class="chart-toolbar">
      <label>Symbol
        <select id="chart-symbol"></select>
      </label>
      <label>Timeframe
        <select id="chart-timeframe">
          <option value="1m">1m</option>
          <option value="5m">5m</option>
          <option value="15m">15m</option>
        </select>
      </label>
      <span class="badge badge-real" id="chart-market-badge">crypto · real</span>
      <span class="badge badge-wait" id="chart-signal-badge">WAIT</span>
      <span class="stat" id="chart-live-line">Live: —</span>
      <span class="stat" id="chart-regime">Regime: —</span>
    </div>
    <div class="chart-wrap">
      <svg id="main-chart" viewBox="0 0 1200 560" preserveAspectRatio="none" aria-label="Main chart"></svg>
      <div class="chart-meta">
        <div class="stat">Confidence</div>
        <div class="confidence-bar"><div class="confidence-fill" id="confidence-fill" style="width:0%"></div></div>
        <div class="stat" id="confidence-text">0%</div>
      </div>
    </div>
  </section>

  <aside class="right card">
    <div class="section-title">Trade & Control</div>
    <div class="panel-body">
      <div class="kv"><span class="k">Selected</span><span class="v" id="sel-symbol">—</span></div>
      <div class="kv"><span class="k">Current Signal</span><span class="v" id="sel-signal">—</span></div>
      <div class="kv"><span class="k">Confidence</span><span class="v" id="sel-confidence">—</span></div>
      <div class="kv"><span class="k">Side</span><span class="v" id="sel-side">—</span></div>
      <div class="kv"><span class="k">Order Type</span><span class="v" id="sel-order-type">MARKET</span></div>
      <div class="kv"><span class="k">Size</span><span class="v" id="sel-size">—</span></div>
      <div class="kv"><span class="k">Est Allocation</span><span class="v" id="sel-allocation">—</span></div>
      <div class="kv"><span class="k">TP / SL</span><span class="v" id="sel-tpsl">—</span></div>
      <div class="kv"><span class="k">Position</span><span class="v" id="sel-position">Flat</span></div>

      <div class="section-title" style="margin:2px -12px 0 -12px;">Runtime Controls</div>
      <div class="control-grid">
        <button class="btn-safe" onclick="setControl({ cryptoAutoEnabled: true })">Crypto ON</button>
        <button class="btn-danger" onclick="setControl({ cryptoAutoEnabled: false })">Crypto OFF</button>
        <button class="btn-safe" onclick="setControl({ stockPaperEnabled: true })">Stocks ON</button>
        <button class="btn-danger" onclick="setControl({ stockPaperEnabled: false })">Stocks OFF</button>
        <select id="authority-select" class="full" onchange="setControl({ authority: this.value })">
          <option value="OFF">Authority OFF</option>
          <option value="ASSIST">Authority ASSIST</option>
          <option value="AUTO">Authority AUTO</option>
        </select>
        <button class="btn-safe" onclick="setControl({ globalKillSwitch: false })">Kill CLEAR</button>
        <button class="btn-danger" onclick="setControl({ globalKillSwitch: true })">Kill ARM</button>
      </div>

      <div class="section-title" style="margin:2px -12px 0 -12px;">Manual Override</div>
      <div class="control-grid">
        <button id="manual-buy">Manual BUY (gate)</button>
        <button id="manual-sell">Manual SELL (gate)</button>
        <div class="full" id="manual-note" style="font-size:11px;color:var(--muted);">Authority OFF blocks manual override.</div>
      </div>
    </div>
  </aside>

  <section class="bottom card">
    <div class="tabs">
      <button class="tab-btn active" data-tab="positions">Open Positions</button>
      <button class="tab-btn" data-tab="orders">Open Orders</button>
      <button class="tab-btn" data-tab="fills">Recent Fills</button>
      <button class="tab-btn" data-tab="signals">Signal History</button>
      <button class="tab-btn" data-tab="log">Strategy Log</button>
    </div>

    <div class="tab-panel active" id="tab-positions">
      <table class="grid">
        <thead><tr><th>Type</th><th>Symbol</th><th>Side</th><th class="num">Size</th><th class="num">Entry</th><th class="num">Mark</th><th class="num">PnL</th><th>Age</th></tr></thead>
        <tbody id="positions-body"></tbody>
      </table>
    </div>

    <div class="tab-panel" id="tab-orders">
      <table class="grid">
        <thead><tr><th>Broker</th><th>Symbol</th><th>Side</th><th class="num">Base</th><th class="num">Limit</th><th>Status</th><th>Created</th></tr></thead>
        <tbody id="orders-body"></tbody>
      </table>
    </div>

    <div class="tab-panel" id="tab-fills">
      <table class="grid">
        <thead><tr><th>Broker</th><th>Symbol</th><th>Side</th><th class="num">Size</th><th class="num">Price</th><th>Time</th></tr></thead>
        <tbody id="fills-body"></tbody>
      </table>
    </div>

    <div class="tab-panel" id="tab-signals">
      <table class="grid">
        <thead><tr><th>Market</th><th>Symbol</th><th>Side</th><th class="num">Conf</th><th>Reason</th><th>Age</th></tr></thead>
        <tbody id="signals-body"></tbody>
      </table>
    </div>

    <div class="tab-panel" id="tab-log">
      <div class="logs" id="strategy-log">Booting terminal…</div>
    </div>
  </section>
</div>

<script>
  const WATCH_SYMBOLS = ['BTC-USD','ETH-USD','SOL-USD','AAPL','TSLA','NVDA','SPY'];
  const CRYPTO_SET = new Set(['BTC-USD','ETH-USD','SOL-USD']);
  const MARKET_LABEL = { crypto: 'crypto · real', equities: 'stocks · paper' };
  const state = {
    selectedSymbol: 'BTC-USD',
    timeframe: '1m',
    watch: new Map(),
    prevPrices: new Map(),
    candles: new Map(),
    signals: [],
    signalHistory: [],
    fillsSeen: new Set(),
    strategyLog: [],
    orders: [],
    dashboard: null,
    positions: [],
    fills: [],
    pendingControls: false,
  };
  function fmt(v, dec = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function signedPct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + fmt(n, 2) + '%';
  }
  function usd(v, dec = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return '$' + fmt(n, dec);
  }
  function clsSigned(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'neutral';
    return n >= 0 ? 'up' : 'down';
  }
  function age(ts) {
    if (!ts) return '—';
    const ms = Date.now() - new Date(ts).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 60000) return Math.floor(ms / 1000) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
    return Math.floor(ms / 3600000) + 'h';
  }
  function logLine(msg) {
    const line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    state.strategyLog.unshift(line);
    state.strategyLog = state.strategyLog.slice(0, 70);
    const el = document.getElementById('strategy-log');
    if (el) el.textContent = state.strategyLog.join('\\n');
  }
  function inferRegime(signal) {
    if (!signal) return 'NO_SIGNAL';
    if (signal.side === 'BUY' && Number(signal.confidence) >= 0.7) return 'STRONG_BULL';
    if (signal.side === 'BUY') return 'BULL_BIAS';
    if (signal.side === 'SELL' && Number(signal.confidence) >= 0.7) return 'STRONG_BEAR';
    if (signal.side === 'SELL') return 'BEAR_BIAS';
    return 'RANGE/WAIT';
  }
  function sideBadge(side) {
    const s = String(side || 'WAIT').toUpperCase();
    const c = s === 'BUY' ? 'badge-buy' : (s === 'SELL' ? 'badge-sell' : 'badge-wait');
    return '<span class="badge ' + c + '">' + s + '</span>';
  }
  function executionBadge(symbol) {
    return CRYPTO_SET.has(symbol)
      ? '<span class="badge badge-real">REAL</span>'
      : '<span class="badge badge-paper">PAPER</span>';
  }
  function symbolSignal(symbol) {
    return state.signals.find(function(s) { return s.symbol === symbol; }) || null;
  }
  function symbolPosition(symbol) {
    return state.positions.find(function(p) { return p.symbol === symbol; }) || null;
  }
  function getSymbolPrice(symbol) {
    const fromPos = symbolPosition(symbol);
    if (fromPos && Number.isFinite(Number(fromPos.currentPrice))) return Number(fromPos.currentPrice);
    const sig = symbolSignal(symbol);
    if (sig && Number.isFinite(Number(sig.entry))) return Number(sig.entry);
    const watch = state.watch.get(symbol);
    if (watch && Number.isFinite(Number(watch.price))) return Number(watch.price);
    return null;
  }
  function updateWatchModel() {
    WATCH_SYMBOLS.forEach(function(symbol) {
      const price = getSymbolPrice(symbol);
      const prev = state.prevPrices.get(symbol);
      const movePct = (Number.isFinite(price) && Number.isFinite(prev) && prev !== 0)
        ? ((price - prev) / prev) * 100
        : 0;
      const sig = symbolSignal(symbol);
      const pos = symbolPosition(symbol);
      state.watch.set(symbol, {
        symbol: symbol,
        price: price,
        movePct: movePct,
        signal: sig ? sig.side : 'WAIT',
        confidence: sig ? Number(sig.confidence || 0) : 0,
        regime: inferRegime(sig),
        position: !!pos,
        market: CRYPTO_SET.has(symbol) ? 'crypto' : 'equities',
      });
      if (Number.isFinite(price)) state.prevPrices.set(symbol, price);
      pushTickCandle(symbol, price, Date.now());
    });
  }
  function pushTickCandle(symbol, price, ts) {
    if (!Number.isFinite(price)) return;
    if (!state.candles.has(symbol)) state.candles.set(symbol, []);
    const arr = state.candles.get(symbol);
    const bucket = Math.floor(ts / 5000) * 5000;
    const last = arr[arr.length - 1];
    if (!last || last.t !== bucket) arr.push({ t: bucket, o: price, h: price, l: price, c: price });
    else {
      last.h = Math.max(last.h, price);
      last.l = Math.min(last.l, price);
      last.c = price;
    }
    if (arr.length > 1200) arr.splice(0, arr.length - 1200);
  }
  function aggregateCandles(symbol, timeframe) {
    const src = state.candles.get(symbol) || [];
    const step = timeframe === '15m' ? 180 : timeframe === '5m' ? 60 : 12;
    const out = [];
    for (let i = 0; i < src.length; i += step) {
      const slice = src.slice(i, i + step);
      if (!slice.length) continue;
      const first = slice[0];
      const last = slice[slice.length - 1];
      let h = -Infinity;
      let l = Infinity;
      slice.forEach(function(c) { h = Math.max(h, c.h); l = Math.min(l, c.l); });
      out.push({ t: first.t, o: first.o, h: h, l: l, c: last.c });
    }
    return out.slice(-120);
  }
  function renderTopBar() {
    const control = (state.dashboard && state.dashboard.controlPanel) || {};
    const crypto = (state.dashboard && state.dashboard.realCrypto) || {};
    const stocks = (state.dashboard && state.dashboard.simulatedStocks) || {};
    const portfolioValue =
      Number((crypto.balances && crypto.balances.USD && crypto.balances.USD.available) || 0) +
      Number(stocks.paperCashUsd || 0) +
      Number(stocks.paperEquityValueUsd || 0);
    document.getElementById('top-portfolio').textContent = usd(portfolioValue);
    document.getElementById('top-crypto').textContent = control.cryptoAutoEnabled ? 'REAL ON' : 'REAL OFF';
    document.getElementById('top-stocks').textContent = control.stockPaperEnabled ? 'PAPER ON' : 'PAPER OFF';
    document.getElementById('top-authority').textContent = control.authority || 'ASSIST';
    document.getElementById('top-kill').textContent = control.globalKillSwitch ? 'ARMED' : 'CLEAR';
    document.getElementById('top-brokers').textContent = 'Coinbase: ' + (control.wsConnected ? 'CONNECTED' : 'DEGRADED') + ' · Stocks: SIM';
    document.getElementById('top-updated').textContent = new Date().toLocaleTimeString();
    document.getElementById('dot-crypto').className = 'dot ' + (control.cryptoAutoEnabled ? 'ok' : 'bad');
    document.getElementById('dot-stocks').className = 'dot ' + (control.stockPaperEnabled ? 'ok' : 'warn');
    document.getElementById('dot-kill').className = 'dot ' + (control.globalKillSwitch ? 'bad' : 'ok');
    const authority = control.authority || 'ASSIST';
    const manualEnabled = authority !== 'OFF';
    document.getElementById('authority-select').value = authority;
    document.getElementById('manual-buy').disabled = !manualEnabled;
    document.getElementById('manual-sell').disabled = !manualEnabled;
    document.getElementById('manual-note').textContent = manualEnabled
      ? 'Manual override available in ' + authority + ' mode (routing remains backend-authorized).'
      : 'Authority OFF blocks manual override.';
  }
  function renderWatchlist() {
    const body = document.getElementById('watchlist-body');
    const rows = [];
    WATCH_SYMBOLS.forEach(function(symbol) {
      const w = state.watch.get(symbol) || { price: null, movePct: 0, signal: 'WAIT', position: false };
      const isSel = state.selectedSymbol === symbol;
      const moveClass = clsSigned(w.movePct);
      const priceClass = moveClass === 'up' ? 'flash-up' : (moveClass === 'down' ? 'flash-down' : '');
      rows.push(
        '<tr class="' + (isSel ? 'active ' : '') + (w.position ? 'has-pos' : '') + '" data-symbol="' + symbol + '">' +
          '<td><div style="display:flex;gap:6px;align-items:center;">' +
            executionBadge(symbol) + '<b>' + symbol + '</b></div></td>' +
          '<td class="num ' + priceClass + '">' + (Number.isFinite(w.price) ? usd(w.price) : '—') + '</td>' +
          '<td class="num ' + moveClass + '">' + signedPct(w.movePct) + '</td>' +
          '<td>' + sideBadge(w.signal) + '</td>' +
          '<td>' + (w.position ? '<span class="badge badge-real">ACTIVE</span>' : '<span class="neutral">—</span>') + '</td>' +
        '</tr>'
      );
    });
    body.innerHTML = rows.join('') || '<tr><td colspan="5" class="neutral">No symbols</td></tr>';
    Array.from(body.querySelectorAll('tr[data-symbol]')).forEach(function(row) {
      row.addEventListener('click', function() {
        state.selectedSymbol = row.getAttribute('data-symbol');
        document.getElementById('chart-symbol').value = state.selectedSymbol;
        renderWatchlist();
        renderRightPanel();
        renderChart();
      });
    });
  }
  function renderChart() {
    const symbol = state.selectedSymbol;
    const sig = symbolSignal(symbol);
    const pos = symbolPosition(symbol);
    const candles = aggregateCandles(symbol, state.timeframe);
    const svg = document.getElementById('main-chart');
    const marketLabel = MARKET_LABEL[(state.watch.get(symbol) || {}).market || (CRYPTO_SET.has(symbol) ? 'crypto' : 'equities')];
    document.getElementById('chart-market-badge').className = 'badge ' + (CRYPTO_SET.has(symbol) ? 'badge-real' : 'badge-paper');
    document.getElementById('chart-market-badge').textContent = marketLabel;
    const side = sig ? sig.side : 'WAIT';
    document.getElementById('chart-signal-badge').className = 'badge ' + (side === 'BUY' ? 'badge-buy' : side === 'SELL' ? 'badge-sell' : 'badge-wait');
    document.getElementById('chart-signal-badge').textContent = side;
    document.getElementById('chart-live-line').textContent = 'Live: ' + (Number.isFinite(getSymbolPrice(symbol)) ? usd(getSymbolPrice(symbol)) : '—');
    document.getElementById('chart-regime').textContent = 'Regime: ' + inferRegime(sig);
    const conf = Math.max(0, Math.min(1, Number(sig && sig.confidence || 0)));
    document.getElementById('confidence-fill').style.width = Math.round(conf * 100) + '%';
    document.getElementById('confidence-text').textContent = Math.round(conf * 100) + '%';
    if (!candles.length) {
      svg.innerHTML = '<rect x="0" y="0" width="1200" height="560" fill="#0b1423"></rect><text x="24" y="40" fill="#8298be" font-size="18">Waiting for live ticks…</text>';
      return;
    }
    let minP = Infinity;
    let maxP = -Infinity;
    candles.forEach(function(c) { minP = Math.min(minP, c.l); maxP = Math.max(maxP, c.h); });
    [sig && sig.entry, sig && sig.tp, sig && sig.sl, pos && pos.entry, pos && pos.currentPrice].forEach(function(v) {
      if (Number.isFinite(Number(v))) { minP = Math.min(minP, Number(v)); maxP = Math.max(maxP, Number(v)); }
    });
    const pad = (maxP - minP || 1) * 0.14;
    minP -= pad;
    maxP += pad;
    const W = 1200;
    const H = 560;
    const px = 52;
    const py = 20;
    const cw = (W - px * 2) / candles.length;
    function x(i) { return px + i * cw + cw / 2; }
    function y(price) { return py + ((maxP - price) / (maxP - minP || 1)) * (H - py * 2); }
    const lines = [];
    for (let i = 0; i <= 5; i += 1) {
      const yy = py + ((H - py * 2) / 5) * i;
      const p = maxP - ((maxP - minP) / 5) * i;
      lines.push('<line x1="' + px + '" y1="' + yy + '" x2="' + (W - px) + '" y2="' + yy + '" stroke="#203150" stroke-width="1" />');
      lines.push('<text x="8" y="' + (yy + 4) + '" fill="#7f96be" font-size="12">' + fmt(p, 2) + '</text>');
    }
    const bars = candles.map(function(c, i) {
      const up = c.c >= c.o;
      const wick = '<line x1="' + x(i) + '" y1="' + y(c.h) + '" x2="' + x(i) + '" y2="' + y(c.l) + '" stroke="' + (up ? '#33d69f' : '#ff6666') + '" stroke-width="1.3" />';
      const bodyY = Math.min(y(c.o), y(c.c));
      const bodyH = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
      const body = '<rect x="' + (x(i) - Math.max(1.2, cw * 0.35)) + '" y="' + bodyY + '" width="' + Math.max(2.4, cw * 0.7) + '" height="' + bodyH + '" fill="' + (up ? '#33d69f' : '#ff6666') + '" opacity=".85" />';
      return wick + body;
    }).join('');
    const last = candles[candles.length - 1];
    const liveY = y(last.c);
    const overlays = [];
    overlays.push('<line x1="' + px + '" y1="' + liveY + '" x2="' + (W - px) + '" y2="' + liveY + '" stroke="#66b3ff" stroke-width="1.2" stroke-dasharray="4 4" />');
    overlays.push('<text x="' + (W - 126) + '" y="' + (liveY - 6) + '" fill="#66b3ff" font-size="12">LIVE ' + fmt(last.c, 2) + '</text>');
    function hline(v, color, label) {
      if (!Number.isFinite(Number(v))) return;
      const yy = y(Number(v));
      overlays.push('<line x1="' + px + '" y1="' + yy + '" x2="' + (W - px) + '" y2="' + yy + '" stroke="' + color + '" stroke-width="1" stroke-dasharray="2 4" />');
      overlays.push('<text x="' + (px + 8) + '" y="' + (yy - 4) + '" fill="' + color + '" font-size="12">' + label + ' ' + fmt(Number(v), 2) + '</text>');
    }
    hline(sig && sig.entry, '#ffd166', 'Signal Entry');
    hline(sig && sig.tp, '#2dd5a1', 'TP');
    hline(sig && sig.sl, '#ff6666', 'SL');
    hline(pos && pos.entry, '#66b3ff', 'Position Entry');
    if (sig) {
      const lastX = x(candles.length - 1);
      const signalY = y(Number(sig.entry || last.c));
      overlays.push('<circle cx="' + lastX + '" cy="' + signalY + '" r="5" fill="' + (sig.side === 'BUY' ? '#2dd5a1' : sig.side === 'SELL' ? '#ff6666' : '#ffd166') + '" />');
      overlays.push('<text x="' + (lastX + 8) + '" y="' + (signalY + 4) + '" fill="#d8e6ff" font-size="12">' + sig.side + '</text>');
    }
    const symbolFills = state.fills.filter(function(f) { return f.symbol === symbol; }).slice(0, 8);
    symbolFills.forEach(function(f, idx) {
      const rel = 1 - (idx / Math.max(1, symbolFills.length));
      const fx = px + rel * (W - px * 2);
      const fy = y(Number(f.price || last.c));
      overlays.push('<path d="M ' + (fx - 5) + ' ' + (fy + 5) + ' L ' + fx + ' ' + (fy - 5) + ' L ' + (fx + 5) + ' ' + (fy + 5) + ' Z" fill="' + (String(f.side).toUpperCase() === 'BUY' ? '#2dd5a1' : '#ff6666') + '" opacity=".85" />');
    });
    svg.innerHTML = '<rect x="0" y="0" width="1200" height="560" fill="#0b1423"></rect>' + lines.join('') + bars + overlays.join('');
  }
  function renderRightPanel() {
    const symbol = state.selectedSymbol;
    const sig = symbolSignal(symbol);
    const pos = symbolPosition(symbol);
    const watch = state.watch.get(symbol) || {};
    document.getElementById('sel-symbol').textContent = symbol + ' · ' + (CRYPTO_SET.has(symbol) ? 'REAL' : 'PAPER');
    document.getElementById('sel-signal').innerHTML = sideBadge(sig ? sig.side : 'WAIT');
    document.getElementById('sel-confidence').textContent = sig ? Math.round(Number(sig.confidence || 0) * 100) + '%' : '—';
    document.getElementById('sel-side').textContent = sig ? sig.side : 'WAIT';
    document.getElementById('sel-size').textContent = pos ? fmt(pos.size, 6) : (sig && Number.isFinite(sig.entry) ? fmt((100 / Number(sig.entry)), 6) : '—');
    document.getElementById('sel-allocation').textContent = Number.isFinite(watch.price) ? usd(Math.max(50, watch.price * 0.5)) : '—';
    document.getElementById('sel-tpsl').textContent = (sig && Number.isFinite(sig.tp) ? usd(sig.tp) : '—') + ' / ' + (sig && Number.isFinite(sig.sl) ? usd(sig.sl) : '—');
    document.getElementById('sel-position').textContent = pos
      ? ('OPEN ' + fmt(pos.size, 4) + ' @ ' + usd(pos.entry) + ' · PnL ' + usd(pos.unrealizedPnL || 0))
      : 'Flat';
  }
  function renderBottom() {
    const posBody = document.getElementById('positions-body');
    if (!state.positions.length) posBody.innerHTML = '<tr><td colspan="8" class="neutral">No open positions</td></tr>';
    else {
      posBody.innerHTML = state.positions.map(function(p) {
        const side = Number(p.size || 0) >= 0 ? 'LONG' : 'SHORT';
        return '<tr class="' + (p.symbol === state.selectedSymbol ? 'has-pos' : '') + '">' +
          '<td>' + executionBadge(p.symbol) + '</td>' +
          '<td>' + p.symbol + '</td>' +
          '<td>' + side + '</td>' +
          '<td class="num">' + fmt(p.size, 6) + '</td>' +
          '<td class="num">' + usd(p.entry) + '</td>' +
          '<td class="num">' + usd(p.currentPrice) + '</td>' +
          '<td class="num pnl ' + clsSigned(p.unrealizedPnL) + '">' + usd(p.unrealizedPnL || 0) + '</td>' +
          '<td>' + age(p.openedAt) + '</td>' +
        '</tr>';
      }).join('');
    }
    const ordersBody = document.getElementById('orders-body');
    if (!state.orders.length) ordersBody.innerHTML = '<tr><td colspan="7" class="neutral">No open orders</td></tr>';
    else {
      ordersBody.innerHTML = state.orders.map(function(o) {
        const cfg = o.order_configuration || {};
        const marketIoc = cfg.market_market_ioc || {};
        const limitGtc = cfg.limit_limit_gtc || {};
        const side = o.side || o.order_side || '—';
        const base = marketIoc.base_size || limitGtc.base_size || o.base_size || '—';
        const limit = limitGtc.limit_price || o.limit_price || '—';
        return '<tr>' +
          '<td>' + executionBadge(o.product_id || o.symbol || 'BTC-USD') + '</td>' +
          '<td>' + (o.product_id || o.symbol || '—') + '</td>' +
          '<td>' + side + '</td>' +
          '<td class="num">' + (base === '—' ? '—' : fmt(base, 6)) + '</td>' +
          '<td class="num">' + (limit === '—' ? '—' : usd(limit)) + '</td>' +
          '<td>' + (o.status || 'OPEN') + '</td>' +
          '<td>' + age(o.created_time || o.createdAt || o.ts) + '</td>' +
        '</tr>';
      }).join('');
    }
    const fillsBody = document.getElementById('fills-body');
    if (!state.fills.length) fillsBody.innerHTML = '<tr><td colspan="6" class="neutral">No recent fills</td></tr>';
    else {
      fillsBody.innerHTML = state.fills.slice(0, 50).map(function(f) {
        const id = String(f.tradeId || f.orderId || f.filledAt || Math.random());
        const isNew = !state.fillsSeen.has(id);
        state.fillsSeen.add(id);
        return '<tr class="' + (isNew ? 'fill-new' : '') + '">' +
          '<td>' + executionBadge(f.symbol || 'BTC-USD') + '</td>' +
          '<td>' + (f.symbol || '—') + '</td>' +
          '<td>' + (f.side || '—') + '</td>' +
          '<td class="num">' + fmt(f.size, 6) + '</td>' +
          '<td class="num">' + usd(f.price) + '</td>' +
          '<td>' + age(f.filledAt) + '</td>' +
        '</tr>';
      }).join('');
    }
    const signalsBody = document.getElementById('signals-body');
    if (!state.signalHistory.length) signalsBody.innerHTML = '<tr><td colspan="6" class="neutral">No signals yet</td></tr>';
    else {
      signalsBody.innerHTML = state.signalHistory.slice(0, 80).map(function(s) {
        return '<tr>' +
          '<td>' + (s.market || '—') + '</td>' +
          '<td>' + (s.symbol || '—') + '</td>' +
          '<td>' + sideBadge(s.side || 'WAIT') + '</td>' +
          '<td class="num">' + Math.round(Number(s.confidence || 0) * 100) + '%</td>' +
          '<td>' + (s.reason || '—') + '</td>' +
          '<td>' + age(s.ts) + '</td>' +
        '</tr>';
      }).join('');
    }
  }
  async function setControl(patch) {
    state.pendingControls = true;
    try {
      await fetch('/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      logLine('Control updated: ' + JSON.stringify(patch));
      await load();
    } catch (_err) {
      logLine('Control update failed');
    } finally {
      state.pendingControls = false;
    }
  }
  function bindTabs() {
    const btns = Array.from(document.querySelectorAll('.tab-btn'));
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        btns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        Array.from(document.querySelectorAll('.tab-panel')).forEach(function(p) { p.classList.remove('active'); });
        const panel = document.getElementById('tab-' + tab);
        if (panel) panel.classList.add('active');
      });
    });
  }
  function bindSelectors() {
    const sym = document.getElementById('chart-symbol');
    const tf = document.getElementById('chart-timeframe');
    sym.innerHTML = WATCH_SYMBOLS.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
    sym.value = state.selectedSymbol;
    sym.addEventListener('change', function() {
      state.selectedSymbol = sym.value;
      renderWatchlist();
      renderRightPanel();
      renderChart();
    });
    tf.value = state.timeframe;
    tf.addEventListener('change', function() {
      state.timeframe = tf.value;
      renderChart();
    });
    document.getElementById('manual-buy').addEventListener('click', function() {
      logLine('Manual BUY requested for ' + state.selectedSymbol + ' (authority-gated).');
    });
    document.getElementById('manual-sell').addEventListener('click', function() {
      logLine('Manual SELL requested for ' + state.selectedSymbol + ' (authority-gated).');
    });
  }
  function reconcileSignals(signals) {
    const now = Date.now();
    const existing = new Map(state.signalHistory.map(function(s) {
      const key = [s.market, s.symbol, s.side, s.ts].join('|');
      return [key, s];
    }));
    (signals || []).forEach(function(s) {
      const clean = {
        market: s.market,
        broker: s.broker,
        symbol: s.symbol,
        side: s.side,
        confidence: Number(s.confidence || 0),
        entry: Number(s.entry),
        tp: Number(s.tp),
        sl: Number(s.sl),
        reason: s.reason,
        ts: s.ts || now,
      };
      const key = [clean.market, clean.symbol, clean.side, clean.ts].join('|');
      if (!existing.has(key)) state.signalHistory.unshift(clean);
    });
    state.signalHistory = state.signalHistory.slice(0, 200);
  }
  async function load() {
    const clock = document.getElementById('top-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString();
    try {
      const responses = await Promise.all([
        fetch('/unified/dashboard').then(function(r) { return r.json(); }),
        fetch('/orders').then(function(r) { return r.json(); }).catch(function() { return { open: [] }; }),
      ]);
      const dashboard = responses[0] || {};
      const ordersResp = responses[1] || { open: [] };
      state.dashboard = dashboard;
      state.signals = dashboard.signals || [];
      reconcileSignals(state.signals);
      const cryptoPos = (((dashboard.realCrypto || {}).openPositions) || []);
      const stockPos = (((dashboard.simulatedStocks || {}).openPositions) || []);
      state.positions = cryptoPos.concat(stockPos);
      const cryptoFills = (((dashboard.realCrypto || {}).recentFills) || []);
      const stockFills = (((dashboard.simulatedStocks || {}).paperFills) || []);
      state.fills = cryptoFills.concat(stockFills).sort(function(a, b) {
        return new Date(b.filledAt || 0).getTime() - new Date(a.filledAt || 0).getTime();
      });
      state.orders = (ordersResp.open || []).slice(0, 80);
      updateWatchModel();
      renderTopBar();
      renderWatchlist();
      renderRightPanel();
      renderChart();
      renderBottom();
      if (!state.pendingControls) {
        logLine('Market refresh: ' + state.signals.length + ' signals · ' + state.positions.length + ' positions · ' + state.fills.length + ' fills');
      }
    } catch (_err) {
      logLine('Refresh failed: API unavailable');
    }
  }
  bindTabs();
  bindSelectors();
  load();
  setInterval(function() {
    const clock = document.getElementById('top-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString();
  }, 1000);
  setInterval(load, 5000);
</script>
</body>
</html>`;
}
