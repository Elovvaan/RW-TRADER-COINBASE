export function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RW-Trader · Autonomous Trading Console</title>
<style>
  :root {
    --bg:#070c14;
    --bg-alt:#0b1220;
    --panel:#101a2b;
    --panel-2:#0d1626;
    --line:#273b5d;
    --line-soft:#1a2a46;
    --text:#d9e7ff;
    --muted:#86a0c8;
    --accent:#66b3ff;
    --ok:#2dd5a1;
    --bad:#ff6666;
    --warn:#ffcf66;
    --paper:#8ea7d2;
  }
  * { box-sizing:border-box; }
  body {
    margin:0;
    background:radial-gradient(circle at top right, #0f213f 0%, var(--bg) 44%);
    color:var(--text);
    font-family:Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  }
  .app {
    min-height:100vh;
    display:grid;
    grid-template-rows:auto auto 1fr;
    gap:10px;
    padding:10px;
  }
  .card {
    background:linear-gradient(180deg, var(--panel), var(--panel-2));
    border:1px solid var(--line);
    border-radius:10px;
    overflow:hidden;
  }
  .header {
    padding:12px;
    display:grid;
    gap:10px;
  }
  .header-top {
    display:flex;
    align-items:center;
    gap:10px;
    flex-wrap:wrap;
  }
  .brand {
    font-weight:700;
    letter-spacing:.03em;
    font-size:14px;
  }
  .subtle { color:var(--muted); }
  .grow { flex:1; }
  .pill {
    border:1px solid var(--line);
    background:rgba(255,255,255,.03);
    border-radius:8px;
    padding:7px 9px;
    font-size:12px;
    display:flex;
    align-items:center;
    gap:6px;
  }
  .dot {
    width:8px;
    height:8px;
    border-radius:999px;
    display:inline-block;
  }
  .dot.ok { background:var(--ok); box-shadow:0 0 10px rgba(45,213,161,.6); }
  .dot.bad { background:var(--bad); box-shadow:0 0 10px rgba(255,102,102,.55); }
  .dot.warn { background:var(--warn); box-shadow:0 0 10px rgba(255,207,102,.5); }

  .tabs {
    display:flex;
    gap:8px;
    padding:8px;
    border-top:1px solid var(--line-soft);
    border-bottom:1px solid var(--line-soft);
    background:rgba(255,255,255,.02);
    flex-wrap:wrap;
  }
  .tab-btn {
    border:1px solid var(--line);
    background:transparent;
    color:var(--muted);
    border-radius:8px;
    padding:8px 12px;
    cursor:pointer;
    font-size:12px;
    letter-spacing:.02em;
    text-decoration:none;
    display:inline-flex;
    align-items:center;
  }
  .tab-btn.active {
    border-color:var(--accent);
    color:var(--text);
    background:rgba(102,179,255,.12);
    box-shadow:inset 0 0 0 1px rgba(102,179,255,.2);
  }

  .tab-panel {
    display:none;
    height:100%;
    min-height:0;
  }
  .tab-panel.active { display:block; }

  .panel-scroll {
    padding:10px;
    height:100%;
    overflow:auto;
  }

  .section-title {
    font-size:11px;
    color:var(--muted);
    letter-spacing:.09em;
    text-transform:uppercase;
    margin:0 0 8px;
  }

  .grid {
    display:grid;
    gap:10px;
  }
  .grid.home-main { grid-template-columns:1.3fr .9fr; }
  .grid.home-cards { grid-template-columns:repeat(4, minmax(0,1fr)); }
  .grid.two-col { grid-template-columns:1fr 1fr; }
  .grid.three-col { grid-template-columns:1fr 1fr 1fr; }

  .panel {
    border:1px solid var(--line-soft);
    border-radius:9px;
    background:rgba(0,0,0,.16);
    padding:10px;
    min-height:0;
  }

  .kpi {
    border:1px solid var(--line-soft);
    border-radius:8px;
    background:rgba(255,255,255,.03);
    padding:10px;
    display:grid;
    gap:4px;
  }
  .kpi .label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  .kpi .value { font-size:18px; font-weight:700; }

  .kv {
    display:flex;
    justify-content:space-between;
    gap:8px;
    font-size:12px;
    padding:7px 0;
    border-bottom:1px dashed rgba(134,160,200,.22);
  }
  .kv:last-child { border-bottom:none; }
  .kv .k { color:var(--muted); }
  .mono { font-variant-numeric:tabular-nums; }

  .badge {
    font-size:10px;
    border:1px solid;
    border-radius:999px;
    letter-spacing:.05em;
    text-transform:uppercase;
    padding:2px 6px;
  }
  .badge-real { color:#98edca; border-color:#2f705c; background:rgba(45,213,161,.14); }
  .badge-paper { color:#ccd9ff; border-color:#4d638d; background:rgba(141,167,210,.12); }
  .badge-buy { color:#98edca; border-color:#2f705c; background:rgba(45,213,161,.14); }
  .badge-sell { color:#ffc6c6; border-color:#8a4444; background:rgba(255,102,102,.13); }
  .badge-wait { color:#f7df9d; border-color:#7a662d; background:rgba(255,207,102,.12); }

  .up { color:var(--ok); }
  .down { color:var(--bad); }
  .neutral { color:var(--muted); }

  table.grid-table { width:100%; border-collapse:collapse; font-size:12px; }
  .grid-table th, .grid-table td { padding:8px 6px; border-bottom:1px solid var(--line-soft); text-align:left; vertical-align:top; }
  .grid-table th { font-size:10px; color:var(--muted); letter-spacing:.08em; text-transform:uppercase; }
  .grid-table td.num, .grid-table th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .grid-table tr.active-row { background:rgba(102,179,255,.12); }
  .grid-table tr.clickable { cursor:pointer; }
  .grid-table tr.clickable:hover { background:rgba(102,179,255,.08); }

  .symbol-chip-wrap { display:flex; flex-wrap:wrap; gap:8px; }
  .symbol-chip {
    border:1px solid var(--line);
    border-radius:8px;
    padding:8px;
    min-width:122px;
    background:rgba(255,255,255,.02);
    cursor:pointer;
    display:grid;
    gap:4px;
  }
  .symbol-chip.active {
    border-color:var(--accent);
    box-shadow:inset 0 0 0 1px rgba(102,179,255,.2);
    background:rgba(102,179,255,.1);
  }
  .symbol-chip .top { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:12px; }
  .symbol-chip .price { font-size:14px; font-weight:700; font-variant-numeric:tabular-nums; }

  .chart-layout { display:grid; gap:10px; grid-template-columns:1.6fr .9fr; height:100%; }
  .chart-toolbar {
    display:flex;
    gap:8px;
    align-items:center;
    flex-wrap:wrap;
    margin-bottom:8px;
  }
  select, button {
    background:#12203a;
    border:1px solid #36517d;
    color:var(--text);
    border-radius:7px;
    padding:6px 8px;
    font-size:12px;
  }
  button { cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .btn-primary { border-color:#2e6aa8; background:rgba(102,179,255,.18); }
  .btn-safe { border-color:#2f705c; color:#98edca; }
  .btn-danger { border-color:#8a4444; color:#ffc6c6; }

  .chart-wrap {
    position:relative;
    border:1px solid var(--line-soft);
    border-radius:8px;
    overflow:hidden;
    min-height:450px;
  }
  #main-chart { width:100%; height:100%; display:block; background:#0b1423; }

  .chart-meta {
    position:absolute;
    top:8px;
    right:8px;
    display:flex;
    gap:8px;
    align-items:center;
    flex-wrap:wrap;
  }
  .stat {
    border:1px solid var(--line);
    border-radius:6px;
    background:rgba(0,0,0,.25);
    font-size:11px;
    color:var(--muted);
    padding:4px 7px;
  }
  .confidence-bar {
    width:100px;
    height:6px;
    border:1px solid var(--line);
    border-radius:999px;
    overflow:hidden;
  }
  .confidence-fill {
    height:100%;
    background:linear-gradient(90deg, var(--bad), var(--warn), var(--ok));
    width:0;
  }

  .control-grid {
    display:grid;
    gap:8px;
    grid-template-columns:1fr 1fr;
  }
  .control-grid .full { grid-column:1 / -1; }

  .note {
    color:var(--muted);
    font-size:11px;
    line-height:1.35;
  }

  @media (max-width: 1200px) {
    .grid.home-main,
    .chart-layout,
    .grid.two-col,
    .grid.three-col,
    .grid.home-cards { grid-template-columns:1fr; }
  }
</style>
</head>
<body>
<div class="app">
  <section class="card header">
    <div class="header-top">
      <div class="brand">RW-Trader Autonomous Console</div>
      <span class="subtle">Real crypto + paper stocks</span>
      <div class="grow"></div>
      <div class="pill"><span>Clock</span><b id="top-clock" class="mono">--:--:--</b></div>
      <div class="pill"><span>Updated</span><b id="top-updated" class="mono">—</b></div>
    </div>
    <div class="header-top">
      <div class="pill"><span>Portfolio</span><b id="top-portfolio" class="mono">$0.00</b></div>
      <div class="pill"><span class="dot" id="dot-crypto"></span><span>Crypto</span><b id="top-crypto">REAL OFF</b></div>
      <div class="pill"><span class="dot" id="dot-stocks"></span><span>Stocks</span><b id="top-stocks">PAPER OFF</b></div>
      <div class="pill"><span>Authority</span><b id="top-authority">ASSIST</b></div>
      <div class="pill"><span class="dot" id="dot-kill"></span><span>Kill</span><b id="top-kill">CLEAR</b></div>
      <div class="pill"><span>Mode</span><b id="top-mode">SWING</b></div>
      <div class="pill"><span>Selected</span><b id="top-symbol">BTC-USD</b></div>
    </div>
  </section>

  <section class="card tabs" id="main-tabs">
    <a class="tab-btn active route-link" data-route="home" href="/home">Home</a>
    <a class="tab-btn route-link" data-route="markets" href="/markets">Markets</a>
    <a class="tab-btn route-link" data-route="chart" href="/chart">Chart</a>
    <a class="tab-btn route-link" data-route="positions" href="/positions">Positions</a>
    <a class="tab-btn route-link" data-route="control" href="/control">Control</a>
  </section>

  <section class="card" style="min-height:0;">
    <div class="tab-panel active" id="tab-home">
      <div class="panel-scroll">
        <div class="grid home-cards">
          <div class="kpi"><div class="label">Portfolio Summary</div><div class="value mono" id="home-kpi-portfolio">$0.00</div><div class="subtle" id="home-kpi-exposure">Exposure: —</div></div>
          <div class="kpi"><div class="label">Crypto Live Status</div><div class="value" id="home-kpi-crypto">OFF</div><div class="subtle" id="home-kpi-crypto-sub">Coinbase: —</div></div>
          <div class="kpi"><div class="label">Stocks Paper Status</div><div class="value" id="home-kpi-stocks">OFF</div><div class="subtle">Execution: paper simulator</div></div>
          <div class="kpi"><div class="label">Authority / Kill</div><div class="value" id="home-kpi-authority">ASSIST</div><div class="subtle" id="home-kpi-kill">Kill: CLEAR</div></div>
        </div>

        <div class="grid home-main" style="margin-top:10px;">
          <div class="panel">
            <p class="section-title">Balances</p>
            <div class="grid two-col">
              <div>
                <div class="kv"><span class="k">USD (crypto)</span><span class="mono" id="bal-usd-real">$0.00</span></div>
                <div class="kv"><span class="k">BTC (total)</span><span class="mono" id="bal-btc">0.000000</span></div>
                <div class="kv"><span class="k">ETH (total)</span><span class="mono" id="bal-eth">0.000000</span></div>
              </div>
              <div>
                <div class="kv"><span class="k">Paper cash</span><span class="mono" id="bal-usd-paper">$0.00</span></div>
                <div class="kv"><span class="k">Paper equity value</span><span class="mono" id="bal-equity-paper">$0.00</span></div>
                <div class="kv"><span class="k">Total PnL (U/R)</span><span class="mono" id="bal-total-pnl">$0.00</span></div>
              </div>
            </div>

            <p class="section-title" style="margin-top:12px;">Open Positions</p>
            <table class="grid-table">
              <thead><tr><th>Type</th><th>Symbol</th><th>Side</th><th class="num">Entry</th><th class="num">Mark</th><th class="num">PnL</th><th>Age</th></tr></thead>
              <tbody id="home-positions-body"></tbody>
            </table>
          </div>

          <div class="panel">
            <p class="section-title">Latest Signals</p>
            <table class="grid-table">
              <thead><tr><th>Market</th><th>Symbol</th><th>Side</th><th class="num">Conf</th><th>Age</th></tr></thead>
              <tbody id="home-signals-body"></tbody>
            </table>

            <p class="section-title" style="margin-top:12px;">Recent Fills</p>
            <table class="grid-table">
              <thead><tr><th>Type</th><th>Symbol</th><th>Side</th><th class="num">Price</th><th class="num">Size</th><th>Age</th></tr></thead>
              <tbody id="home-fills-body"></tbody>
            </table>

            <p class="section-title" style="margin-top:12px;">PnL Summary</p>
            <div class="kv"><span class="k">Crypto unrealized</span><span class="mono" id="pnl-crypto">$0.00</span></div>
            <div class="kv"><span class="k">Stocks unrealized</span><span class="mono" id="pnl-stocks">$0.00</span></div>
            <div class="kv"><span class="k">Crypto realized</span><span class="mono" id="pnl-realized">$0.00</span></div>
          </div>
        </div>
        <div class="panel" style="margin-top:10px;">
          <p class="section-title">Top Crypto Decision Transparency</p>
          <div class="grid three-col">
            <div class="kv"><span class="k">BTC-USD</span><span id="skip-btc">NO_DATA</span></div>
            <div class="kv"><span class="k">ETH-USD</span><span id="skip-eth">NO_DATA</span></div>
            <div class="kv"><span class="k">SOL-USD</span><span id="skip-sol">NO_DATA</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-markets">
      <div class="panel-scroll">
        <div class="grid two-col">
          <div class="panel">
            <p class="section-title">Watchlist / Favorites</p>
            <div class="symbol-chip-wrap" id="favorite-chip-list"></div>
          </div>
          <div class="panel">
            <p class="section-title">Active Symbol</p>
            <div class="kv"><span class="k">Symbol</span><span id="market-active-symbol">BTC-USD</span></div>
            <div class="kv"><span class="k">Last price</span><span class="mono" id="market-active-price">—</span></div>
            <div class="kv"><span class="k">Signal</span><span id="market-active-signal">—</span></div>
            <div class="kv"><span class="k">Position state</span><span id="market-active-pos">Flat</span></div>
            <div class="note" style="margin-top:8px;">Tap any symbol below to open its chart in the Chart tab.</div>
          </div>
        </div>

        <div class="grid two-col" style="margin-top:10px;">
          <div class="panel">
            <p class="section-title">Top Crypto Pairs</p>
            <table class="grid-table">
              <thead><tr><th>Symbol</th><th class="num">Price</th><th class="num">Move</th><th>Signal</th></tr></thead>
              <tbody id="markets-crypto-body"></tbody>
            </table>
          </div>

          <div class="panel">
            <p class="section-title">Top Stock Symbols</p>
            <table class="grid-table">
              <thead><tr><th>Symbol</th><th class="num">Price</th><th class="num">Move</th><th>Signal</th></tr></thead>
              <tbody id="markets-stock-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-chart">
      <div class="panel-scroll">
        <div class="chart-layout">
          <div class="panel">
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
              <button id="toggle-indicators" class="btn-primary">Indicators ON</button>
              <span class="badge" id="chart-market-badge">crypto · real</span>
              <span class="badge badge-wait" id="chart-signal-badge">WAIT</span>
              <span class="stat" id="chart-live-line">Live: —</span>
            </div>

            <div class="chart-wrap">
              <svg id="main-chart" viewBox="0 0 1200 560" preserveAspectRatio="none" aria-label="Main chart"><title>Candlestick chart</title></svg>
              <div class="chart-meta">
                <div class="stat">Confidence</div>
                <div class="confidence-bar"><div class="confidence-fill" id="confidence-fill" style="width:0%"></div></div>
                <div class="stat" id="confidence-text">0%</div>
              </div>
            </div>
          </div>

          <div class="panel">
            <p class="section-title">Order Detail / Manual Override</p>
            <div class="kv"><span class="k">Selected symbol</span><span id="chart-detail-symbol">—</span></div>
            <div class="kv"><span class="k">Signal</span><span id="chart-detail-signal">—</span></div>
            <div class="kv"><span class="k">Confidence</span><span id="chart-detail-confidence">—</span></div>
            <div class="kv"><span class="k">Entry / TP / SL</span><span id="chart-detail-risk">—</span></div>
            <div class="kv"><span class="k">Position</span><span id="chart-detail-position">Flat</span></div>
            <div class="kv"><span class="k">Mode</span><span id="chart-detail-mode">Autonomous-first</span></div>
            <div class="kv"><span class="k">Regime</span><span id="chart-detail-regime">—</span></div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
              <label class="subtle" for="manual-size-usd">Manual size (USD)</label>
              <input id="manual-size-usd" type="number" min="1" step="1" value="50" style="width:140px;background:#0d1a2e;border:1px solid #2b4368;color:#dce8ff;border-radius:8px;padding:6px 8px;" />
            </div>

            <div class="control-grid" style="margin-top:10px;">
              <button id="manual-buy" class="btn-safe">Buy (manual override)</button>
              <button id="manual-sell" class="btn-danger">Sell (manual override)</button>
              <button id="manual-close" class="full">Close Position</button>
            </div>
            <div id="manual-note" class="note" style="margin-top:8px;">Manual actions are secondary; autonomous strategy remains primary.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-positions">
      <div class="panel-scroll">
        <div class="grid two-col">
          <div class="panel">
            <p class="section-title">Open Crypto Positions (REAL)</p>
            <table class="grid-table">
              <thead><tr><th>Symbol</th><th>Side</th><th class="num">Entry</th><th class="num">Mark</th><th class="num">PnL</th><th class="num">TP</th><th class="num">SL</th><th>Age</th></tr></thead>
              <tbody id="positions-crypto-body"></tbody>
            </table>
          </div>
          <div class="panel">
            <p class="section-title">Open Stock Positions (PAPER)</p>
            <table class="grid-table">
              <thead><tr><th>Symbol</th><th>Side</th><th class="num">Entry</th><th class="num">Mark</th><th class="num">PnL</th><th class="num">TP</th><th class="num">SL</th><th>Age</th></tr></thead>
              <tbody id="positions-stock-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-control">
      <div class="panel-scroll">
        <div class="grid two-col">
          <div class="panel">
            <p class="section-title">Runtime Controls</p>
            <div class="control-grid">
              <button class="btn-safe" id="control-crypto-on">Crypto Live ON</button>
              <button class="btn-danger" id="control-crypto-off">Crypto Live OFF</button>
              <button class="btn-safe" id="control-stocks-on">Stocks Paper ON</button>
              <button class="btn-danger" id="control-stocks-off">Stocks Paper OFF</button>
              <select id="strategy-mode-select" class="full">
                <option value="SWING">Mode SWING</option>
                <option value="DAY_TRADE">Mode DAY_TRADE</option>
              </select>
              <select id="authority-select" class="full">
                <option value="OFF">Authority OFF</option>
                <option value="ASSIST">Authority ASSIST</option>
                <option value="AUTO">Authority AUTO</option>
              </select>
              <button class="btn-safe" id="control-kill-clear">Kill CLEAR</button>
              <button class="btn-danger" id="control-kill-arm">Kill ARM</button>
            </div>
          </div>

          <div class="panel">
            <p class="section-title">Automation Settings</p>
            <div class="kv"><span class="k">Auto refresh</span><span id="auto-refresh-label">5s</span></div>
            <div style="display:flex;gap:8px;align-items:center;margin:6px 0 10px;">
              <label class="subtle" for="refresh-interval">Interval</label>
              <select id="refresh-interval">
                <option value="3000">3s</option>
                <option value="5000" selected>5s</option>
                <option value="10000">10s</option>
                <option value="15000">15s</option>
              </select>
            </div>
            <div class="kv"><span class="k">Default chart timeframe</span><span id="control-timeframe">1m</span></div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
              <label class="subtle" for="control-timeframe-select">Timeframe</label>
              <select id="control-timeframe-select">
                <option value="1m">1m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
              </select>
            </div>
            <div class="kv" style="margin-top:10px;"><span class="k">Indicator visibility</span><span id="indicator-status">ON</span></div>
            <div class="kv"><span class="k">Crypto max open positions</span><span id="control-max-open-crypto">—</span></div>
            <div class="note" style="margin-top:8px;">Manual actions are available for override only; autonomous signal-routing remains the default operating mode.</div>
          </div>
        </div>

        <div class="panel" style="margin-top:10px;">
          <p class="section-title">System Log</p>
          <div id="strategy-log" class="note">Booting terminal…</div>
        </div>
      </div>
    </div>
  </section>
</div>

<script>
  const TOP_CRYPTO = ['BTC-USD','ETH-USD','SOL-USD'];
  const TOP_STOCKS = ['AAPL','TSLA','NVDA','SPY'];
  const FAVORITES = ['BTC-USD','ETH-USD','SOL-USD','AAPL','TSLA'];
  const ALL_SYMBOLS = TOP_CRYPTO.concat(TOP_STOCKS.filter(function(s) { return !TOP_CRYPTO.includes(s); }));
  const CRYPTO_SET = new Set(TOP_CRYPTO);
  const ROUTE_BY_TAB = {
    home: '/home',
    markets: '/markets',
    chart: '/chart',
    positions: '/positions',
    control: '/control',
  };
  const TAB_BY_ROUTE = {
    '/': 'home',
    '/home': 'home',
    '/markets': 'markets',
    '/chart': 'chart',
    '/positions': 'positions',
    '/control': 'control',
  };
  const EMPTY_VALUE = '—';
  const DEFAULT_REFRESH_INTERVAL_MS = 5000;
  const MAX_LOG_ENTRIES = 70;
  const NEWLINE_CHAR = String.fromCharCode(10);
  const MAX_CANDLE_HISTORY = 1200;
  const MAX_DISPLAY_CANDLES = 120;
  const CANDLE_BUCKET_MS = 5000;
  const CANDLE_STEPS = { '1m': 12, '5m': 60, '15m': 180 };
  const CHART_WIDTH = 1200;
  const CHART_HEIGHT = 560;
  const CHART_COLORS = {
    grid:'#203150',
    label:'#7f96be',
    up:'#33d69f',
    down:'#ff6666',
    live:'#66b3ff',
    signalEntry:'#ffd166',
    tp:'#2dd5a1',
    sl:'#ff6666',
    positionEntry:'#7cb7ff',
    text:'#d8e6ff',
  };

  const state = {
    activeTab: 'home',
    strategyMode: 'SWING',
    selectedSymbol: 'BTC-USD',
    timeframe: '1m',
    indicatorsOn: true,
    refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,
    refreshTimerId: null,
    dashboard: null,
    orders: [],
    positions: [],
    signals: [],
    cryptoDecisions: [],
    cryptoDecisionBySymbol: new Map(),
    fills: [],
    watch: new Map(),
    prevPrices: new Map(),
    candles: new Map(),
    signalHistory: [],
    strategyLog: [],
    pendingControls: false,
    manualStatusMessage: '',
  };

  function fmt(v, dec) {
    const n = Number(v);
    if (!Number.isFinite(n)) return EMPTY_VALUE;
    const d = Number.isFinite(dec) ? dec : 2;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function usd(v, dec) {
    const n = Number(v);
    if (!Number.isFinite(n)) return EMPTY_VALUE;
    return '$' + fmt(n, dec);
  }
  function formatPercent(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return EMPTY_VALUE;
    return (n >= 0 ? '+' : '') + fmt(n, 2) + '%';
  }
  function clsSigned(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'neutral';
    return n >= 0 ? 'up' : 'down';
  }
  function sideBadge(side) {
    const s = String(side || 'WAIT').toUpperCase();
    const c = s === 'BUY' ? 'badge-buy' : (s === 'SELL' ? 'badge-sell' : 'badge-wait');
    return '<span class="badge ' + c + '">' + s + '</span>';
  }
  function isValidSignal(signal) {
    return signal && typeof signal === 'object' && !Array.isArray(signal);
  }
  function isValidDecision(decision) {
    return decision
      && typeof decision === 'object'
      && !Array.isArray(decision)
      && Boolean(decision.symbol || decision.productId)
      && Boolean(decision.status);
  }
  function formatSignalLevel(signal, field) {
    return signal && Number.isFinite(Number(signal[field])) ? usd(signal[field]) : EMPTY_VALUE;
  }
  function typeBadge(symbol) {
    return CRYPTO_SET.has(symbol)
      ? '<span class="badge badge-real">REAL</span>'
      : '<span class="badge badge-paper">PAPER</span>';
  }
  function age(ts) {
    if (!ts) return EMPTY_VALUE;
    const ms = Date.now() - new Date(ts).getTime();
    if (!Number.isFinite(ms) || ms < 0) return EMPTY_VALUE;
    if (ms < 60000) return Math.floor(ms / 1000) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
    return Math.floor(ms / 3600000) + 'h';
  }
  function logLine(msg) {
    const line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    state.strategyLog.unshift(line);
    state.strategyLog = state.strategyLog.slice(0, MAX_LOG_ENTRIES);
    const logEl = document.getElementById('strategy-log');
    if (logEl) logEl.textContent = state.strategyLog.join(NEWLINE_CHAR);
  }

  function symbolSignal(symbol) {
    return state.signals.find(function(s) { return s.symbol === symbol; }) || null;
  }
  function symbolPosition(symbol) {
    return state.positions.find(function(p) { return p.symbol === symbol; }) || null;
  }
  function symbolDecision(symbol) {
    return state.cryptoDecisionBySymbol.get(symbol) || null;
  }
  function decisionLabel(decision) {
    const raw = decision && (decision.skipReason || decision.status);
    return raw ? String(raw).replaceAll('_', ' ') : 'NO_DATA';
  }
  function signalOrSkipBadge(symbol, side) {
    const normalizedSide = String(side || 'WAIT').toUpperCase();
    if (normalizedSide !== 'WAIT') return sideBadge(normalizedSide);
    const decision = symbolDecision(symbol);
    return '<span class=\"badge badge-wait\">' + decisionLabel(decision) + '</span>';
  }
  function getSymbolPrice(symbol) {
    const pos = symbolPosition(symbol);
    if (pos && Number.isFinite(Number(pos.currentPrice))) return Number(pos.currentPrice);
    const sig = symbolSignal(symbol);
    if (sig && Number.isFinite(Number(sig.entry))) return Number(sig.entry);
    const watch = state.watch.get(symbol);
    if (watch && Number.isFinite(Number(watch.price))) return Number(watch.price);
    return null;
  }

  function normalizePosition(raw) {
    raw = raw || {};
    const symbol = raw.symbol || raw.productId || raw.asset || EMPTY_VALUE;
    const sizeNum = Number(raw.size || raw.qty || raw.quantity || 0);
    const entry = Number(raw.entry || raw.entryPrice || raw.avgEntryPrice);
    const mark = Number(raw.currentPrice || raw.markPrice || raw.lastPrice);
    const pnl = Number(raw.unrealizedPnL || raw.unrealizedPnlUsd || raw.pnl || 0);
    const rawSide = String(raw.side || '').toUpperCase();
    const side = rawSide === 'BUY' ? 'LONG' : (rawSide === 'SELL' ? 'SHORT' : (rawSide || (sizeNum >= 0 ? 'LONG' : 'SHORT')));
    return {
      symbol: symbol,
      market: CRYPTO_SET.has(symbol) ? 'crypto' : (raw.market || 'equities'),
      entry: Number.isFinite(entry) ? entry : null,
      currentPrice: Number.isFinite(mark) ? mark : null,
      unrealizedPnL: Number.isFinite(pnl) ? pnl : 0,
      side: side,
      size: sizeNum,
      tp: Number.isFinite(Number(raw.tp || raw.tpPrice)) ? Number(raw.tp || raw.tpPrice) : null,
      sl: Number.isFinite(Number(raw.sl || raw.slPrice)) ? Number(raw.sl || raw.slPrice) : null,
      openedAt: raw.openedAt || raw.createdAt || raw.ts || null,
    };
  }

  function pushTickCandle(symbol, price, ts) {
    if (!Number.isFinite(price)) return;
    if (!state.candles.has(symbol)) state.candles.set(symbol, []);
    const arr = state.candles.get(symbol);
    const bucket = Math.floor(ts / CANDLE_BUCKET_MS) * CANDLE_BUCKET_MS;
    const last = arr[arr.length - 1];
    if (!last || last.t !== bucket) arr.push({ t: bucket, o: price, h: price, l: price, c: price });
    else {
      last.h = Math.max(last.h, price);
      last.l = Math.min(last.l, price);
      last.c = price;
    }
    if (arr.length > MAX_CANDLE_HISTORY) arr.splice(0, arr.length - MAX_CANDLE_HISTORY);
  }

  function aggregateCandles(symbol, timeframe) {
    const src = state.candles.get(symbol) || [];
    const step = CANDLE_STEPS[timeframe] || CANDLE_STEPS['1m'];
    const out = [];
    for (let i = 0; i < src.length; i += step) {
      const slice = src.slice(i, i + step);
      if (!slice.length) continue;
      const validSlice = slice.filter(function(c) {
        return Number.isFinite(c.o) && Number.isFinite(c.h) && Number.isFinite(c.l) && Number.isFinite(c.c);
      });
      if (!validSlice.length) continue;
      let high = -Infinity;
      let low = Infinity;
      validSlice.forEach(function(c) {
        high = Math.max(high, c.h);
        low = Math.min(low, c.l);
      });
      out.push({ t: validSlice[0].t, o: validSlice[0].o, h: high, l: low, c: validSlice[validSlice.length - 1].c });
    }
    return out.slice(-MAX_DISPLAY_CANDLES);
  }

  function setActiveTab(tab, pushHistory) {
    const target = ROUTE_BY_TAB[tab] ? tab : 'home';
    state.activeTab = target;
    Array.from(document.querySelectorAll('.route-link')).forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-route') === target);
    });
    Array.from(document.querySelectorAll('.tab-panel')).forEach(function(panel) {
      panel.classList.toggle('active', panel.id === 'tab-' + target);
    });
    if (pushHistory) {
      const nextPath = ROUTE_BY_TAB[target] || '/home';
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ tab: target }, '', nextPath);
      }
    }
  }

  function selectSymbol(symbol, forceChartTab) {
    state.selectedSymbol = symbol;
    const symbolSelect = document.getElementById('chart-symbol');
    if (symbolSelect) symbolSelect.value = symbol;
    document.getElementById('top-symbol').textContent = symbol;
    renderMarketsTab();
    renderChartTab();
    if (forceChartTab) setActiveTab('chart');
  }

  function updateWatchModel() {
    ALL_SYMBOLS.forEach(function(symbol) {
      const price = getSymbolPrice(symbol);
      const prev = state.prevPrices.get(symbol);
      const movePct = (Number.isFinite(price) && Number.isFinite(prev) && prev !== 0) ? ((price - prev) / prev) * 100 : 0;
      const sig = symbolSignal(symbol);
      const pos = symbolPosition(symbol);
      state.watch.set(symbol, {
        symbol: symbol,
        price: price,
        movePct: movePct,
        signal: sig ? sig.side : 'WAIT',
        confidence: sig ? Number(sig.confidence || 0) : 0,
        position: Boolean(pos),
      });
      if (Number.isFinite(price)) {
        state.prevPrices.set(symbol, price);
        pushTickCandle(symbol, price, Date.now());
      }
    });
  }

  function reconcileSignals(signals) {
    function signalKey(s) {
      return [s.market, s.symbol, s.side, s.ts].join('|');
    }
    const existing = new Map(state.signalHistory.map(function(s) {
      return [signalKey(s), s];
    }));
    (signals || []).filter(isValidSignal).forEach(function(s) {
      const clean = {
        market: s.market || (CRYPTO_SET.has(s.symbol) ? 'crypto' : 'equities'),
        symbol: s.symbol,
        side: s.side || 'WAIT',
        confidence: Number(s.confidence || 0),
        entry: Number(s.entry),
        tp: Number(s.tp),
        sl: Number(s.sl),
        reason: s.reason || EMPTY_VALUE,
        ts: s.ts || Date.now(),
      };
      const key = signalKey(clean);
      if (!existing.has(key)) state.signalHistory.unshift(clean);
    });
    state.signalHistory = state.signalHistory.slice(0, 240);
  }

  function renderTopBar() {
    const control = (state.dashboard && state.dashboard.controlPanel) || {};
    const crypto = (state.dashboard && state.dashboard.realCrypto) || {};
    const stocks = (state.dashboard && state.dashboard.simulatedStocks) || {};

    const portfolioValue =
      Number(crypto.balances?.USD?.available || 0) +
      Number(stocks.paperCashUsd || 0) +
      Number(stocks.paperEquityValueUsd || 0);

    document.getElementById('top-portfolio').textContent = usd(portfolioValue);
    document.getElementById('top-crypto').textContent = control.cryptoAutoEnabled ? 'REAL ON' : 'REAL OFF';
    document.getElementById('top-stocks').textContent = control.stockPaperEnabled ? 'PAPER ON' : 'PAPER OFF';
    document.getElementById('top-authority').textContent = control.authority || 'ASSIST';
    document.getElementById('top-kill').textContent = control.globalKillSwitch ? 'ARMED' : 'CLEAR';
    document.getElementById('top-mode').textContent = control.strategyMode || state.strategyMode || 'SWING';
    document.getElementById('top-updated').textContent = new Date().toLocaleTimeString();
    document.getElementById('control-max-open-crypto').textContent = String(control.maxOpenCryptoPositions || 3);

    document.getElementById('dot-crypto').className = 'dot ' + (control.cryptoAutoEnabled ? 'ok' : 'bad');
    document.getElementById('dot-stocks').className = 'dot ' + (control.stockPaperEnabled ? 'ok' : 'warn');
    document.getElementById('dot-kill').className = 'dot ' + (control.globalKillSwitch ? 'bad' : 'ok');

    const authority = control.authority || 'ASSIST';
    state.strategyMode = String(control.strategyMode || state.strategyMode || 'SWING').toUpperCase();
    const manualAllowed = authority !== 'OFF';
    document.getElementById('authority-select').value = authority;
    document.getElementById('strategy-mode-select').value = state.strategyMode;
    document.getElementById('manual-buy').disabled = !manualAllowed;
    document.getElementById('manual-sell').disabled = !manualAllowed;
    document.getElementById('manual-close').disabled = !manualAllowed;
    const defaultManualNote = manualAllowed
      ? 'Manual override is available in ' + authority + ' mode; autonomous routing remains primary.'
      : 'Authority OFF blocks manual override.';
    document.getElementById('manual-note').textContent = state.manualStatusMessage || defaultManualNote;

    document.getElementById('home-kpi-portfolio').textContent = usd(portfolioValue);
    document.getElementById('home-kpi-exposure').textContent = 'Exposure: ' + state.positions.length + ' open positions';
    document.getElementById('home-kpi-crypto').textContent = control.cryptoAutoEnabled ? 'LIVE ON' : 'LIVE OFF';
    document.getElementById('home-kpi-crypto-sub').textContent = 'Coinbase WS: ' + (control.wsConnected ? 'CONNECTED' : 'DEGRADED');
    document.getElementById('home-kpi-stocks').textContent = control.stockPaperEnabled ? 'PAPER ON' : 'PAPER OFF';
    document.getElementById('home-kpi-authority').textContent = authority;
    document.getElementById('home-kpi-kill').textContent = 'Kill: ' + (control.globalKillSwitch ? 'ARMED' : 'CLEAR');
  }

  function renderHomeTab() {
    const crypto = (state.dashboard && state.dashboard.realCrypto) || {};
    const stocks = (state.dashboard && state.dashboard.simulatedStocks) || {};
    const cryptoBalances = crypto.balances || {};

    document.getElementById('bal-usd-real').textContent = usd(cryptoBalances.USD?.available || 0);
    document.getElementById('bal-btc').textContent = fmt(cryptoBalances.BTC?.total || 0, 6);
    document.getElementById('bal-eth').textContent = fmt(cryptoBalances.ETH?.total || 0, 6);
    document.getElementById('bal-usd-paper').textContent = usd(stocks.paperCashUsd || 0);
    document.getElementById('bal-equity-paper').textContent = usd(stocks.paperEquityValueUsd || 0);

    const totalPnl = Number(crypto.unrealizedPnlUsd || 0) + Number(stocks.unrealizedPnlUsd || 0) + Number(crypto.realizedPnlUsd || 0);
    document.getElementById('bal-total-pnl').textContent = usd(totalPnl);
    document.getElementById('bal-total-pnl').className = 'mono ' + clsSigned(totalPnl);

    document.getElementById('pnl-crypto').textContent = usd(crypto.unrealizedPnlUsd || 0);
    document.getElementById('pnl-crypto').className = 'mono ' + clsSigned(crypto.unrealizedPnlUsd || 0);
    document.getElementById('pnl-stocks').textContent = usd(stocks.unrealizedPnlUsd || 0);
    document.getElementById('pnl-stocks').className = 'mono ' + clsSigned(stocks.unrealizedPnlUsd || 0);
    document.getElementById('pnl-realized').textContent = usd(crypto.realizedPnlUsd || 0);
    document.getElementById('pnl-realized').className = 'mono ' + clsSigned(crypto.realizedPnlUsd || 0);

    const posRows = state.positions.slice(0, 8).map(function(p) {
      return '<tr class="' + (p.symbol === state.selectedSymbol ? 'active-row' : '') + '">' +
        '<td>' + typeBadge(p.symbol) + '</td>' +
        '<td>' + p.symbol + '</td>' +
        '<td>' + p.side + '</td>' +
        '<td class="num">' + usd(p.entry) + '</td>' +
        '<td class="num">' + usd(p.currentPrice) + '</td>' +
        '<td class="num ' + clsSigned(p.unrealizedPnL) + '">' + usd(p.unrealizedPnL || 0) + '</td>' +
        '<td>' + age(p.openedAt) + '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('home-positions-body').innerHTML = posRows || '<tr><td colspan="7" class="neutral">No open positions</td></tr>';

    const signalRows = state.signalHistory.slice(0, 8).map(function(s) {
      return '<tr>' +
        '<td>' + (s.market || EMPTY_VALUE) + '</td>' +
        '<td>' + (s.symbol || EMPTY_VALUE) + '</td>' +
        '<td>' + sideBadge(s.side || 'WAIT') + '</td>' +
        '<td class="num">' + Math.round(Number(s.confidence || 0) * 100) + '%</td>' +
        '<td>' + age(s.ts) + '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('home-signals-body').innerHTML = signalRows || '<tr><td colspan="5" class="neutral">No signals yet</td></tr>';

    const fillRows = state.fills.slice(0, 8).map(function(f) {
      return '<tr>' +
        '<td>' + typeBadge(f.symbol || 'BTC-USD') + '</td>' +
        '<td>' + (f.symbol || EMPTY_VALUE) + '</td>' +
        '<td>' + (f.side || EMPTY_VALUE) + '</td>' +
        '<td class="num">' + usd(f.price) + '</td>' +
        '<td class="num">' + fmt(f.size, 6) + '</td>' +
        '<td>' + age(f.filledAt || f.ts) + '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('home-fills-body').innerHTML = fillRows || '<tr><td colspan="6" class="neutral">No recent fills</td></tr>';

    const btcDecision = symbolDecision('BTC-USD');
    const ethDecision = symbolDecision('ETH-USD');
    const solDecision = symbolDecision('SOL-USD');
    document.getElementById('skip-btc').innerHTML = signalOrSkipBadge('BTC-USD', btcDecision?.signalSide || 'WAIT');
    document.getElementById('skip-eth').innerHTML = signalOrSkipBadge('ETH-USD', ethDecision?.signalSide || 'WAIT');
    document.getElementById('skip-sol').innerHTML = signalOrSkipBadge('SOL-USD', solDecision?.signalSide || 'WAIT');
  }

  function renderMarketsTableRows(symbols) {
    return symbols.map(function(symbol) {
      const w = state.watch.get(symbol) || { price: null, movePct: 0, signal: 'WAIT' };
      return '<tr class="clickable ' + (state.selectedSymbol === symbol ? 'active-row' : '') + '" data-symbol="' + symbol + '">' +
        '<td><div style="display:flex;gap:6px;align-items:center;">' + typeBadge(symbol) + '<b>' + symbol + '</b></div></td>' +
        '<td class="num">' + (Number.isFinite(w.price) ? usd(w.price) : EMPTY_VALUE) + '</td>' +
        '<td class="num ' + clsSigned(w.movePct) + '">' + formatPercent(w.movePct) + '</td>' +
        '<td>' + signalOrSkipBadge(symbol, w.signal) + '</td>' +
      '</tr>';
    }).join('');
  }

  function bindMarketRowClicks(containerId) {
    const body = document.getElementById(containerId);
    Array.from(body.querySelectorAll('tr[data-symbol]')).forEach(function(row) {
      row.addEventListener('click', function() {
        selectSymbol(row.getAttribute('data-symbol'), true);
      });
    });
  }

  function renderMarketsTab() {
    const favContainer = document.getElementById('favorite-chip-list');
    favContainer.innerHTML = FAVORITES.map(function(symbol) {
      const w = state.watch.get(symbol) || { price: null, movePct: 0, signal: 'WAIT' };
      const decision = symbolDecision(symbol);
      const waitLabel = decisionLabel(decision);
      const normalizedSignal = String(w.signal || 'WAIT').toUpperCase();
      return '<button class="symbol-chip ' + (state.selectedSymbol === symbol ? 'active' : '') + '" data-symbol="' + symbol + '">' +
        '<div class="top"><b>' + symbol + '</b>' + typeBadge(symbol) + '</div>' +
        '<div class="price">' + (Number.isFinite(w.price) ? usd(w.price) : EMPTY_VALUE) + '</div>' +
        '<div class="' + clsSigned(w.movePct) + '">' + formatPercent(w.movePct) + ' · ' + (normalizedSignal === 'WAIT' ? waitLabel : normalizedSignal) + '</div>' +
      '</button>';
    }).join('');

    Array.from(favContainer.querySelectorAll('.symbol-chip')).forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectSymbol(btn.getAttribute('data-symbol'), true);
      });
    });

    document.getElementById('markets-crypto-body').innerHTML = renderMarketsTableRows(TOP_CRYPTO) || '<tr><td colspan="4" class="neutral">No data</td></tr>';
    document.getElementById('markets-stock-body').innerHTML = renderMarketsTableRows(TOP_STOCKS) || '<tr><td colspan="4" class="neutral">No data</td></tr>';
    bindMarketRowClicks('markets-crypto-body');
    bindMarketRowClicks('markets-stock-body');

    const sig = symbolSignal(state.selectedSymbol);
    const pos = symbolPosition(state.selectedSymbol);
    const price = getSymbolPrice(state.selectedSymbol);
    document.getElementById('market-active-symbol').textContent = state.selectedSymbol;
    document.getElementById('market-active-price').textContent = Number.isFinite(price) ? usd(price) : EMPTY_VALUE;
    document.getElementById('market-active-signal').innerHTML = signalOrSkipBadge(state.selectedSymbol, sig ? sig.side : 'WAIT');
    document.getElementById('market-active-pos').textContent = pos ? ('OPEN · ' + pos.side + ' · ' + usd(pos.unrealizedPnL || 0)) : 'Flat';
  }

  function renderChartTab() {
    const symbol = state.selectedSymbol;
    const sig = symbolSignal(symbol);
    const pos = symbolPosition(symbol);
    const decision = symbolDecision(symbol);
    const svg = document.getElementById('main-chart');
    const candles = aggregateCandles(symbol, state.timeframe);

    const marketBadge = document.getElementById('chart-market-badge');
    marketBadge.className = 'badge ' + (CRYPTO_SET.has(symbol) ? 'badge-real' : 'badge-paper');
    marketBadge.textContent = CRYPTO_SET.has(symbol) ? 'crypto · real' : 'stocks · paper';

    const side = sig ? sig.side : 'WAIT';
    const signalBadge = document.getElementById('chart-signal-badge');
    signalBadge.className = 'badge ' + (side === 'BUY' ? 'badge-buy' : side === 'SELL' ? 'badge-sell' : 'badge-wait');
    signalBadge.textContent = side === 'WAIT'
      ? decisionLabel(decision)
      : side;

    const livePrice = getSymbolPrice(symbol);
    document.getElementById('chart-live-line').textContent = 'Live: ' + (Number.isFinite(livePrice) ? usd(livePrice) : EMPTY_VALUE);

    const conf = Math.max(0, Math.min(1, Number(sig && sig.confidence || 0)));
    document.getElementById('confidence-fill').style.width = Math.round(conf * 100) + '%';
    document.getElementById('confidence-text').textContent = Math.round(conf * 100) + '%';

    document.getElementById('chart-detail-symbol').textContent = symbol + ' · ' + (CRYPTO_SET.has(symbol) ? 'REAL' : 'PAPER');
    document.getElementById('chart-detail-signal').innerHTML = sideBadge(side);
    document.getElementById('chart-detail-confidence').textContent = Math.round(conf * 100) + '%';
    document.getElementById('chart-detail-risk').textContent =
      formatSignalLevel(sig, 'entry') + ' / ' +
      formatSignalLevel(sig, 'tp') + ' / ' +
      formatSignalLevel(sig, 'sl');
    document.getElementById('chart-detail-position').textContent = pos
      ? ('OPEN ' + pos.side + ' · ' + usd(pos.unrealizedPnL || 0))
      : 'Flat';
    document.getElementById('chart-detail-mode').textContent = state.strategyMode;
    document.getElementById('chart-detail-regime').textContent = sig?.indicators?.regime || decision?.regime || EMPTY_VALUE;

    if (!candles.length) {
      svg.innerHTML =
        '<title>Candlestick chart for ' + symbol + ' on ' + state.timeframe + ' timeframe</title>' +
        '<rect x="0" y="0" width="' + CHART_WIDTH + '" height="' + CHART_HEIGHT + '" fill="#0b1423"></rect>' +
        '<text x="24" y="40" fill="#8298be" font-size="18">Waiting for live ticks…</text>';
      return;
    }

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    candles.forEach(function(c) {
      minPrice = Math.min(minPrice, c.l);
      maxPrice = Math.max(maxPrice, c.h);
    });

    [sig && sig.entry, sig && sig.tp, sig && sig.sl, pos && pos.entry, pos && pos.currentPrice].forEach(function(v) {
      if (Number.isFinite(Number(v))) {
        minPrice = Math.min(minPrice, Number(v));
        maxPrice = Math.max(maxPrice, Number(v));
      }
    });

    const pad = (maxPrice - minPrice || 1) * 0.14;
    minPrice -= pad;
    maxPrice += pad;

    const W = CHART_WIDTH;
    const H = CHART_HEIGHT;
    const px = 52;
    const py = 20;
    const candleWidth = (W - px * 2) / candles.length;

    function x(i) { return px + i * candleWidth + candleWidth / 2; }
    function y(p) { return py + ((maxPrice - p) / (maxPrice - minPrice || 1)) * (H - py * 2); }

    const lines = [];
    for (let i = 0; i <= 5; i += 1) {
      const yy = py + ((H - py * 2) / 5) * i;
      const p = maxPrice - ((maxPrice - minPrice) / 5) * i;
      lines.push('<line x1="' + px + '" y1="' + yy + '" x2="' + (W - px) + '" y2="' + yy + '" stroke="' + CHART_COLORS.grid + '" stroke-width="1"/>');
      lines.push('<text x="8" y="' + (yy + 4) + '" fill="' + CHART_COLORS.label + '" font-size="12">' + fmt(p, 2) + '</text>');
    }

    const bars = candles.map(function(c, i) {
      const up = c.c >= c.o;
      const color = up ? CHART_COLORS.up : CHART_COLORS.down;
      const wick = '<line x1="' + x(i) + '" y1="' + y(c.h) + '" x2="' + x(i) + '" y2="' + y(c.l) + '" stroke="' + color + '" stroke-width="1.3"/>';
      const bodyY = Math.min(y(c.o), y(c.c));
      const bodyH = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
      const body = '<rect x="' + (x(i) - Math.max(1.2, candleWidth * 0.35)) + '" y="' + bodyY + '" width="' + Math.max(2.4, candleWidth * 0.7) + '" height="' + bodyH + '" fill="' + color + '" opacity=".86"/>';
      return wick + body;
    }).join('');

    const overlays = [];
    const last = candles[candles.length - 1];
    const liveY = y(last.c);
    overlays.push('<line x1="' + px + '" y1="' + liveY + '" x2="' + (W - px) + '" y2="' + liveY + '" stroke="' + CHART_COLORS.live + '" stroke-width="1.2" stroke-dasharray="4 4"/>');
    overlays.push('<text x="' + (W - 126) + '" y="' + (liveY - 6) + '" fill="' + CHART_COLORS.live + '" font-size="12">LIVE ' + fmt(last.c, 2) + '</text>');

    if (state.indicatorsOn) {
      function hline(v, color, label) {
        if (!Number.isFinite(Number(v))) return;
        const yy = y(Number(v));
        overlays.push('<line x1="' + px + '" y1="' + yy + '" x2="' + (W - px) + '" y2="' + yy + '" stroke="' + color + '" stroke-width="1" stroke-dasharray="2 4"/>');
        overlays.push('<text x="' + (px + 8) + '" y="' + (yy - 4) + '" fill="' + color + '" font-size="12">' + label + ' ' + fmt(Number(v), 2) + '</text>');
      }
      hline(sig && sig.entry, CHART_COLORS.signalEntry, 'Signal');
      hline(sig && sig.tp, CHART_COLORS.tp, 'TP');
      hline(sig && sig.sl, CHART_COLORS.sl, 'SL');
      hline(pos && pos.entry, CHART_COLORS.positionEntry, 'Position');
    }

    if (sig) {
      const lastX = x(candles.length - 1);
      const markerY = y(Number(sig.entry || last.c));
      const markerColor = sig.side === 'BUY' ? CHART_COLORS.tp : (sig.side === 'SELL' ? CHART_COLORS.sl : CHART_COLORS.signalEntry);
      overlays.push('<circle cx="' + lastX + '" cy="' + markerY + '" r="5" fill="' + markerColor + '"/>');
      overlays.push('<text x="' + (lastX + 8) + '" y="' + (markerY + 4) + '" fill="' + CHART_COLORS.text + '" font-size="12">' + sig.side + '</text>');
    }

    const symbolFills = state.fills.filter(function(f) { return f.symbol === symbol; }).slice(0, 8);
    symbolFills.forEach(function(f, idx) {
      const rel = 1 - (idx / Math.max(1, symbolFills.length));
      const fx = px + rel * (W - px * 2);
      const fy = y(Number(f.price || last.c));
      const fillColor = String(f.side).toUpperCase() === 'BUY' ? CHART_COLORS.tp : CHART_COLORS.sl;
      overlays.push('<path d="M ' + (fx - 5) + ' ' + (fy + 5) + ' L ' + fx + ' ' + (fy - 5) + ' L ' + (fx + 5) + ' ' + (fy + 5) + ' Z" fill="' + fillColor + '" opacity=".86"/>');
    });

    svg.innerHTML =
      '<title>Candlestick chart for ' + symbol + ' on ' + state.timeframe + ' timeframe</title>' +
      '<rect x="0" y="0" width="' + CHART_WIDTH + '" height="' + CHART_HEIGHT + '" fill="#0b1423"></rect>' +
      lines.join('') +
      bars +
      overlays.join('');
  }

  function renderPositionsTab() {
    const cryptoRows = state.positions.filter(function(p) { return CRYPTO_SET.has(p.symbol) || p.market === 'crypto'; }).map(function(p) {
      return '<tr class="' + (p.symbol === state.selectedSymbol ? 'active-row' : '') + '">' +
        '<td>' + p.symbol + '</td>' +
        '<td>' + p.side + '</td>' +
        '<td class="num">' + usd(p.entry) + '</td>' +
        '<td class="num">' + usd(p.currentPrice) + '</td>' +
        '<td class="num ' + clsSigned(p.unrealizedPnL) + '">' + usd(p.unrealizedPnL || 0) + '</td>' +
        '<td class="num">' + usd(p.tp) + '</td>' +
        '<td class="num">' + usd(p.sl) + '</td>' +
        '<td>' + age(p.openedAt) + '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('positions-crypto-body').innerHTML = cryptoRows || '<tr><td colspan="8" class="neutral">No open crypto positions</td></tr>';

    const stockRows = state.positions.filter(function(p) { return !CRYPTO_SET.has(p.symbol) && p.market !== 'crypto'; }).map(function(p) {
      return '<tr class="' + (p.symbol === state.selectedSymbol ? 'active-row' : '') + '">' +
        '<td>' + p.symbol + '</td>' +
        '<td>' + p.side + '</td>' +
        '<td class="num">' + usd(p.entry) + '</td>' +
        '<td class="num">' + usd(p.currentPrice) + '</td>' +
        '<td class="num ' + clsSigned(p.unrealizedPnL) + '">' + usd(p.unrealizedPnL || 0) + '</td>' +
        '<td class="num">' + usd(p.tp) + '</td>' +
        '<td class="num">' + usd(p.sl) + '</td>' +
        '<td>' + age(p.openedAt) + '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('positions-stock-body').innerHTML = stockRows || '<tr><td colspan="8" class="neutral">No open stock paper positions</td></tr>';
  }

  function renderControlTab() {
    document.getElementById('auto-refresh-label').textContent = Math.round(state.refreshIntervalMs / 1000) + 's';
    document.getElementById('refresh-interval').value = String(state.refreshIntervalMs);
    document.getElementById('strategy-mode-select').value = state.strategyMode;
    document.getElementById('control-timeframe').textContent = state.timeframe;
    document.getElementById('control-timeframe-select').value = state.timeframe;
    document.getElementById('indicator-status').textContent = state.indicatorsOn ? 'ON' : 'OFF';
    const maxOpen = state.dashboard?.controlPanel?.maxOpenCryptoPositions;
    document.getElementById('control-max-open-crypto').textContent = String(maxOpen || 3);
  }

  async function setControl(patch) {
    state.pendingControls = true;
    try {
      await fetch('/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      logLine('Control updated: ' + Object.keys(patch).join(','));
      await load();
    } catch (err) {
      logLine('Control update failed: ' + (err && err.message ? err.message : String(err || 'unknown')));
    } finally {
      state.pendingControls = false;
    }
  }
  function scheduleRefresh() {
    if (state.refreshTimerId) clearInterval(state.refreshTimerId);
    state.refreshTimerId = setInterval(load, state.refreshIntervalMs);
  }

  async function submitManualOverride(side) {
    const symbol = state.selectedSymbol;
    const sizeInput = document.getElementById('manual-size-usd');
    const sizeUsd = Number(sizeInput && sizeInput.value);
    const normalizedSide = String(side || '').toUpperCase();
    const manualNote = document.getElementById('manual-note');

    logLine('MANUAL_OVERRIDE_CLICKED · ' + normalizedSide + ' · ' + symbol);
    state.manualStatusMessage = 'MANUAL_OVERRIDE_CLICKED: ' + normalizedSide + ' ' + symbol;
    if (manualNote) manualNote.textContent = state.manualStatusMessage;

    try {
      const resp = await fetch('/manual-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol,
          side: normalizedSide,
          sizeUsd: sizeUsd,
        }),
      });
      const payload = await resp.json().catch(function() { return {}; });
      if (!resp.ok || !payload.ok) {
        const reason = payload.reason || ('HTTP_' + resp.status);
        const message = payload.message || reason;
        logLine('MANUAL_OVERRIDE_REJECTED · ' + symbol + ' · ' + reason + ' · ' + message);
        state.manualStatusMessage = 'MANUAL_OVERRIDE_REJECTED: ' + message;
        if (manualNote) manualNote.textContent = state.manualStatusMessage;
        return;
      }

      logLine('MANUAL_OVERRIDE_SUBMITTED · ' + payload.side + ' · ' + payload.symbol + ' · ' + (payload.sizeUsd || 0) + ' USD');
      state.manualStatusMessage = 'MANUAL_OVERRIDE_SUBMITTED: ' + payload.side + ' ' + payload.symbol + ' ' + (payload.sizeUsd || 0) + ' USD';
      if (manualNote) manualNote.textContent = state.manualStatusMessage;
      if (payload.filled) {
        logLine('MANUAL_OVERRIDE_FILLED · ' + payload.side + ' · ' + payload.symbol);
        state.manualStatusMessage = 'MANUAL_OVERRIDE_FILLED: ' + payload.side + ' ' + payload.symbol;
        if (manualNote) manualNote.textContent = state.manualStatusMessage;
      }
      await load();
    } catch (err) {
      const msg = err && err.message ? err.message : String(err || 'unknown');
      logLine('MANUAL_OVERRIDE_REJECTED · ' + symbol + ' · REQUEST_FAILED · ' + msg);
      state.manualStatusMessage = 'MANUAL_OVERRIDE_REJECTED: ' + msg;
      if (manualNote) manualNote.textContent = state.manualStatusMessage;
    }
  }

  function bindTabs() {
    Array.from(document.querySelectorAll('.route-link')).forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        setActiveTab(btn.getAttribute('data-route'), true);
      });
    });
    window.addEventListener('popstate', function() {
      const tab = TAB_BY_ROUTE[window.location.pathname] || 'home';
      setActiveTab(tab, false);
    });
  }

  function bindControls() {
    const symbolSelect = document.getElementById('chart-symbol');
    symbolSelect.innerHTML = ALL_SYMBOLS.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
    symbolSelect.value = state.selectedSymbol;
    symbolSelect.addEventListener('change', function() {
      selectSymbol(symbolSelect.value, false);
    });

    const tf = document.getElementById('chart-timeframe');
    tf.value = state.timeframe;
    tf.addEventListener('change', function() {
      state.timeframe = tf.value;
      document.getElementById('control-timeframe').textContent = state.timeframe;
      document.getElementById('control-timeframe-select').value = state.timeframe;
      renderChartTab();
    });

    document.getElementById('toggle-indicators').addEventListener('click', function() {
      state.indicatorsOn = !state.indicatorsOn;
      document.getElementById('toggle-indicators').textContent = state.indicatorsOn ? 'Indicators ON' : 'Indicators OFF';
      renderControlTab();
      renderChartTab();
    });

    document.getElementById('manual-buy').addEventListener('click', function() {
      void submitManualOverride('BUY');
    });
    document.getElementById('manual-sell').addEventListener('click', function() {
      void submitManualOverride('SELL');
    });
    document.getElementById('manual-close').addEventListener('click', function() {
      void submitManualOverride('CLOSE');
    });

    document.getElementById('refresh-interval').addEventListener('change', function(e) {
      state.refreshIntervalMs = Number(e.target.value) || DEFAULT_REFRESH_INTERVAL_MS;
      scheduleRefresh();
      renderControlTab();
      logLine('Refresh interval set to ' + Math.round(state.refreshIntervalMs / 1000) + 's');
    });

    document.getElementById('control-crypto-on').addEventListener('click', function() {
      setControl({ cryptoAutoEnabled: true });
    });
    document.getElementById('control-crypto-off').addEventListener('click', function() {
      setControl({ cryptoAutoEnabled: false });
    });
    document.getElementById('control-stocks-on').addEventListener('click', function() {
      setControl({ stockPaperEnabled: true });
    });
    document.getElementById('control-stocks-off').addEventListener('click', function() {
      setControl({ stockPaperEnabled: false });
    });
    document.getElementById('authority-select').addEventListener('change', function(e) {
      setControl({ authority: e.target.value });
    });
    document.getElementById('strategy-mode-select').addEventListener('change', function(e) {
      state.strategyMode = String(e.target.value || 'SWING').toUpperCase();
      setControl({ strategyMode: state.strategyMode });
      renderChartTab();
    });
    document.getElementById('control-kill-clear').addEventListener('click', function() {
      setControl({ globalKillSwitch: false });
    });
    document.getElementById('control-kill-arm').addEventListener('click', function() {
      setControl({ globalKillSwitch: true });
    });

    document.getElementById('control-timeframe-select').addEventListener('change', function(e) {
      state.timeframe = e.target.value;
      document.getElementById('chart-timeframe').value = state.timeframe;
      renderControlTab();
      renderChartTab();
    });
  }

  function renderAll() {
    renderTopBar();
    renderHomeTab();
    renderMarketsTab();
    renderChartTab();
    renderPositionsTab();
    renderControlTab();
  }

  async function load() {
    const clock = document.getElementById('top-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString();

    try {
      const responses = await Promise.all([
        fetch('/unified/dashboard').then(function(r) { return r.json(); }),
        fetch('/orders').then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).catch(function(err) {
          logLine('Orders endpoint failed (' + String(err || 'unknown') + '); showing empty open-orders list.');
          return { open: [] };
        }),
      ]);

      const dashboard = responses[0] || {};
      const ordersResp = responses[1] || { open: [] };

      state.dashboard = dashboard;
      state.signals = dashboard.signals || [];
      state.cryptoDecisions = (dashboard.cryptoDecisions || []).filter(isValidDecision);
      state.cryptoDecisionBySymbol = new Map(state.cryptoDecisions.map(function(decision) {
        const key = decision.symbol || decision.productId;
        return [key, decision];
      }));
      reconcileSignals(state.signals);

      const cryptoPositions = (((dashboard.realCrypto || {}).openPositions) || []).map(normalizePosition);
      const stockPositions = (((dashboard.simulatedStocks || {}).openPositions) || []).map(normalizePosition);
      state.positions = cryptoPositions.concat(stockPositions);

      const cryptoFills = (((dashboard.realCrypto || {}).recentFills) || []);
      const stockFills = (((dashboard.simulatedStocks || {}).paperFills) || []);
      state.fills = cryptoFills.concat(stockFills).sort(function(a, b) {
        return new Date(b.filledAt || b.ts || 0).getTime() - new Date(a.filledAt || a.ts || 0).getTime();
      });

      state.orders = (ordersResp.open || []).slice(0, 80);

      updateWatchModel();
      renderAll();

      if (!state.pendingControls) {
        logLine('Refresh: ' + state.signals.length + ' signals · ' + state.positions.length + ' positions · ' + state.fills.length + ' fills');
      }
    } catch (err) {
      logLine('Refresh failed: ' + (err && err.message ? err.message : String(err || 'API unavailable')));
    }
  }

  bindTabs();
  bindControls();
  setActiveTab(TAB_BY_ROUTE[window.location.pathname] || 'home', false);
  load();
  setInterval(function() {
    const clock = document.getElementById('top-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString();
  }, 1000);
  scheduleRefresh();
</script>
</body>
</html>`;
}
