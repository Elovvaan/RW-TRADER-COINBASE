export function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RW-Trader · Operator Control Panel</title>
<style>
  body { margin:0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background:#0b1220; color:#dbe6ff; }
  header { padding:14px 18px; border-bottom:1px solid #223251; background:#111a2d; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  main { padding:16px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .panel { border:1px solid #223251; border-radius:6px; background:#111a2d; padding:12px; overflow:auto; }
  .full { grid-column:1 / -1; }
  h2 { margin:0 0 10px 0; font-size:12px; letter-spacing:.08em; color:#8ca8d8; text-transform:uppercase; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { padding:6px 8px; border-bottom:1px solid #223251; text-align:left; vertical-align:top; }
  .muted { color:#7b8fb6; }
  .ok { color:#33d69f; } .bad { color:#ff6b6b; } .warn { color:#ffd166; }
  .row { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
  .metric { background:#0e1729; border:1px solid #223251; border-radius:4px; padding:8px; }
  .metric .k { font-size:10px; color:#7b8fb6; text-transform:uppercase; } .metric .v { font-size:16px; margin-top:4px; }
  .controls { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
  .control { background:#0e1729; border:1px solid #223251; border-radius:4px; padding:8px; display:flex; flex-direction:column; gap:8px; }
  .control label { font-size:11px; color:#7b8fb6; text-transform:uppercase; }
  .control select, .control button { background:#111a2d; color:#dbe6ff; border:1px solid #31466f; border-radius:4px; padding:6px; font-family:inherit; cursor:pointer; }
  .btn-row { display:flex; gap:8px; }
  .btn-live { border-color:#1e6f52; }
  .btn-off { border-color:#7a2f2f; }
  @media (max-width: 1100px) { .controls, .row { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width: 700px) { main, .controls, .row { grid-template-columns:1fr; } .full { grid-column:auto; } }
</style>
</head>
<body>
<header>
  <strong>RW-Trader Operator Control Panel</strong>
  <span id="last-updated" class="muted">updating…</span>
</header>
<main>
  <section class="panel full">
    <h2>Control Panel</h2>
    <div class="controls">
      <div class="control">
        <label>Crypto Live</label>
        <div id="state-crypto" class="v muted">—</div>
        <div class="btn-row">
          <button class="btn-live" onclick="setControl({ cryptoAutoEnabled: true })">ON</button>
          <button class="btn-off" onclick="setControl({ cryptoAutoEnabled: false })">OFF</button>
        </div>
      </div>
      <div class="control">
        <label>Stocks Paper</label>
        <div id="state-stocks" class="v muted">—</div>
        <div class="btn-row">
          <button class="btn-live" onclick="setControl({ stockPaperEnabled: true })">ON</button>
          <button class="btn-off" onclick="setControl({ stockPaperEnabled: false })">OFF</button>
        </div>
      </div>
      <div class="control">
        <label>Authority</label>
        <select id="authority-select" onchange="setControl({ authority: this.value })">
          <option value="OFF">OFF</option>
          <option value="ASSIST">ASSIST</option>
          <option value="AUTO">AUTO</option>
        </select>
      </div>
      <div class="control">
        <label>Kill Switch</label>
        <div id="state-kill" class="v muted">—</div>
        <div class="btn-row">
          <button class="btn-live" onclick="setControl({ globalKillSwitch: false })">CLEAR</button>
          <button class="btn-off" onclick="setControl({ globalKillSwitch: true })">ARM</button>
        </div>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2>Real Crypto Panel</h2>
    <div class="row">
      <div class="metric"><div class="k">USD Balance</div><div class="v" id="crypto-usd">—</div></div>
      <div class="metric"><div class="k">BTC Balance</div><div class="v" id="crypto-btc">—</div></div>
      <div class="metric"><div class="k">ETH Balance</div><div class="v" id="crypto-eth">—</div></div>
      <div class="metric"><div class="k">Unrealized PnL</div><div class="v" id="crypto-unrealized">—</div></div>
      <div class="metric"><div class="k">Realized PnL</div><div class="v" id="crypto-realized">—</div></div>
      <div class="metric"><div class="k">Open Positions</div><div class="v" id="crypto-open-count">—</div></div>
    </div>
    <h2 style="margin-top:14px;">Crypto Open Positions (REAL)</h2>
    <table><thead><tr><th>Type</th><th>Symbol</th><th>Size</th><th>Entry</th><th>Mark</th><th>Unrealized PnL</th><th>Age</th><th>Mark Age</th></tr></thead><tbody id="crypto-positions"></tbody></table>
    <h2 style="margin-top:14px;">Recent Crypto Fills</h2>
    <table><thead><tr><th>Symbol</th><th>Side</th><th>Size</th><th>Price</th><th>Time</th></tr></thead><tbody id="crypto-fills"></tbody></table>
  </section>

  <section class="panel">
    <h2>Simulated Stocks Panel</h2>
    <div class="row">
      <div class="metric"><div class="k">Paper Cash</div><div class="v" id="stock-cash">—</div></div>
      <div class="metric"><div class="k">Paper Equity Value</div><div class="v" id="stock-equity">—</div></div>
      <div class="metric"><div class="k">Unrealized PnL</div><div class="v" id="stock-unrealized">—</div></div>
      <div class="metric"><div class="k">Open Positions</div><div class="v" id="stock-open-count">—</div></div>
    </div>
    <h2 style="margin-top:14px;">Stock Open Positions (PAPER)</h2>
    <table><thead><tr><th>Type</th><th>Symbol</th><th>Size</th><th>Entry</th><th>Mark</th><th>Unrealized PnL</th><th>Age</th></tr></thead><tbody id="stock-positions"></tbody></table>
    <h2 style="margin-top:14px;">Paper Fills</h2>
    <table><thead><tr><th>Symbol</th><th>Side</th><th>Size</th><th>Price</th><th>Time</th></tr></thead><tbody id="stock-fills"></tbody></table>
  </section>

  <section class="panel full">
    <h2>Signals Panel</h2>
    <table><thead><tr><th>Market</th><th>Broker</th><th>Symbol</th><th>Side</th><th>Confidence</th><th>Reason</th><th>Age</th></tr></thead><tbody id="signals"></tbody></table>
  </section>
</main>
<script>
  function fmt(v, dec = 2) {
    const n = Number(v);
    if (v === null || v === undefined || Number.isNaN(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function ageFromMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 60000) return Math.floor(n / 1000) + 's';
    if (n < 3600000) return Math.floor(n / 60000) + 'm';
    return Math.floor(n / 3600000) + 'h';
  }
  function age(ts) {
    if (!ts) return '—';
    const ms = Date.now() - new Date(ts).getTime();
    return ageFromMs(ms);
  }
  function signedUsd(v) {
    const n = Number(v || 0);
    return (n >= 0 ? '+' : '') + '$' + fmt(n);
  }
  function cssSigned(v) {
    return Number(v || 0) >= 0 ? 'ok' : 'bad';
  }
  function rowFallback(cols, text) {
    return '<tr><td colspan="' + cols + '" class="muted">' + text + '</td></tr>';
  }
  function renderPositionRow(p, includeMarkAge, nowMs) {
    const executionType = p.executionType || 'UNKNOWN';
    const cells = [
      '<td>' + executionType + '</td>',
      '<td>' + p.symbol + '</td>',
      '<td>' + fmt(p.size, 6) + '</td>',
      '<td>$' + fmt(p.entry) + '</td>',
      '<td>$' + fmt(p.currentPrice) + '</td>',
      '<td class="' + cssSigned(p.unrealizedPnL) + '">' + signedUsd(p.unrealizedPnL) + '</td>',
      '<td>' + ageFromMs(p.positionAgeMs) + '</td>',
    ];
    if (includeMarkAge) {
      const markAgeMs = p.lastMarketUpdateTs ? (nowMs - p.lastMarketUpdateTs) : null;
      cells.push('<td>' + ageFromMs(markAgeMs) + '</td>');
    }
    return '<tr>' + cells.join('') + '</tr>';
  }
  async function setControl(patch) {
    await fetch('/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await load();
  }
  async function load() {
    const data = await fetch('/unified/dashboard').then((r) => r.json());
    const control = data.controlPanel || {};
    const crypto = data.realCrypto || {};
    const stocks = data.simulatedStocks || {};
    const nowMs = Date.now();

    document.getElementById('state-crypto').textContent = control.cryptoAutoEnabled ? 'ON' : 'OFF';
    document.getElementById('state-crypto').className = 'v ' + (control.cryptoAutoEnabled ? 'ok' : 'bad');
    document.getElementById('state-stocks').textContent = control.stockPaperEnabled ? 'ON' : 'OFF';
    document.getElementById('state-stocks').className = 'v ' + (control.stockPaperEnabled ? 'ok' : 'bad');
    document.getElementById('state-kill').textContent = control.killSwitchState || (control.globalKillSwitch ? 'ARMED' : 'CLEAR');
    document.getElementById('state-kill').className = 'v ' + (control.globalKillSwitch ? 'bad' : 'ok');
    document.getElementById('authority-select').value = control.authority || 'ASSIST';

    document.getElementById('crypto-usd').textContent = '$' + fmt(crypto.balances?.USD?.available || 0);
    document.getElementById('crypto-btc').textContent = fmt(crypto.balances?.BTC?.available || 0, 6);
    document.getElementById('crypto-eth').textContent = fmt(crypto.balances?.ETH?.available || 0, 6);
    document.getElementById('crypto-unrealized').textContent = signedUsd(crypto.unrealizedPnlUsd || 0);
    document.getElementById('crypto-realized').textContent = signedUsd(crypto.realizedPnlUsd || 0);
    document.getElementById('crypto-unrealized').className = 'v ' + cssSigned(crypto.unrealizedPnlUsd || 0);
    document.getElementById('crypto-realized').className = 'v ' + cssSigned(crypto.realizedPnlUsd || 0);
    document.getElementById('crypto-open-count').textContent = String((crypto.openPositions || []).length);

    document.getElementById('stock-cash').textContent = '$' + fmt(stocks.paperCashUsd || 0);
    document.getElementById('stock-equity').textContent = '$' + fmt(stocks.paperEquityValueUsd || 0);
    document.getElementById('stock-unrealized').textContent = signedUsd(stocks.unrealizedPnlUsd || 0);
    document.getElementById('stock-unrealized').className = 'v ' + cssSigned(stocks.unrealizedPnlUsd || 0);
    document.getElementById('stock-open-count').textContent = String((stocks.openPositions || []).length);

    const cryptoPos = document.getElementById('crypto-positions');
    cryptoPos.innerHTML = (crypto.openPositions || []).length
      ? crypto.openPositions.map((p) => renderPositionRow(p, true, nowMs)).join('')
      : rowFallback(8, 'No crypto positions');

    const stockPos = document.getElementById('stock-positions');
    stockPos.innerHTML = (stocks.openPositions || []).length
      ? stocks.openPositions.map((p) => renderPositionRow(p, false, nowMs)).join('')
      : rowFallback(7, 'No stock positions');

    const cryptoFills = document.getElementById('crypto-fills');
    cryptoFills.innerHTML = (crypto.recentFills || []).length
      ? crypto.recentFills.map((f) => '<tr><td>' + f.symbol + '</td><td>' + f.side + '</td><td>' + fmt(f.size, 6) + '</td><td>$' + fmt(f.price) + '</td><td>' + age(f.filledAt) + '</td></tr>').join('')
      : rowFallback(5, 'No crypto fills');

    const stockFills = document.getElementById('stock-fills');
    stockFills.innerHTML = (stocks.paperFills || []).length
      ? stocks.paperFills.map((f) => '<tr><td>' + f.symbol + '</td><td>' + f.side + '</td><td>' + fmt(f.size, 6) + '</td><td>$' + fmt(f.price) + '</td><td>' + age(f.filledAt) + '</td></tr>').join('')
      : rowFallback(5, 'No paper fills');

    const signals = document.getElementById('signals');
    signals.innerHTML = (data.signals || []).length
      ? data.signals.map((s) => '<tr><td>' + s.market + '</td><td>' + s.broker + '</td><td>' + s.symbol + '</td><td>' + s.side + '</td><td>' + fmt((s.confidence || 0) * 100, 0) + '%</td><td>' + (s.reason || '—') + '</td><td>' + age(s.ts) + '</td></tr>').join('')
      : rowFallback(7, 'No signals');

    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
  }
  load().catch(() => {});
  setInterval(() => load().catch(() => {}), 5000);
</script>
</body>
</html>`;
}
