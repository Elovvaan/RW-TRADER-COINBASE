export function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RW-Trader · Unified</title>
<style>
  body { margin:0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background:#0b1220; color:#dbe6ff; }
  header { padding:14px 18px; border-bottom:1px solid #223251; background:#111a2d; display:flex; justify-content:space-between; }
  main { padding:16px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .panel { border:1px solid #223251; border-radius:6px; background:#111a2d; padding:12px; overflow:auto; }
  .full { grid-column:1 / -1; }
  h2 { margin:0 0 10px 0; font-size:12px; letter-spacing:.08em; color:#8ca8d8; text-transform:uppercase; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { padding:6px 8px; border-bottom:1px solid #223251; text-align:left; }
  .muted { color:#7b8fb6; }
  .ok { color:#33d69f; } .bad { color:#ff6b6b; } .warn { color:#ffd166; }
  .row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
  .metric { background:#0e1729; border:1px solid #223251; border-radius:4px; padding:8px; }
  .metric .k { font-size:10px; color:#7b8fb6; text-transform:uppercase; } .metric .v { font-size:16px; margin-top:4px; }
  @media (max-width: 900px) { main { grid-template-columns:1fr; } .full { grid-column:auto; } .row { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
  <strong>RW-Trader Unified Dashboard</strong>
  <span id="last-updated" class="muted">updating…</span>
</header>
<main>
  <section class="panel">
    <h2>System Status</h2>
    <div class="row">
      <div class="metric"><div class="k">Authority</div><div class="v" id="m-authority">—</div></div>
      <div class="metric"><div class="k">Mode</div><div class="v" id="m-mode">—</div></div>
      <div class="metric"><div class="k">Kill Switch</div><div class="v" id="m-kill">—</div></div>
      <div class="metric"><div class="k">Crypto</div><div class="v" id="m-crypto">—</div></div>
      <div class="metric"><div class="k">Equities</div><div class="v" id="m-equities">—</div></div>
      <div class="metric"><div class="k">WS</div><div class="v" id="m-ws">—</div></div>
    </div>
  </section>

  <section class="panel">
    <h2>Crypto Balances</h2>
    <table><thead><tr><th>Asset</th><th>Available</th><th>Hold</th></tr></thead><tbody id="crypto-balances"></tbody></table>
  </section>

  <section class="panel">
    <h2>Stock Balances</h2>
    <table><thead><tr><th>Asset</th><th>Available</th><th>Hold</th></tr></thead><tbody id="stock-balances"></tbody></table>
  </section>

  <section class="panel full">
    <h2>Open Crypto Positions</h2>
    <table><thead><tr><th>Symbol</th><th>Size</th><th>Entry</th><th>Current</th><th>UnrealizedPnL</th><th>TP</th><th>SL</th><th>Opened</th></tr></thead><tbody id="crypto-positions"></tbody></table>
  </section>

  <section class="panel full">
    <h2>Open Stock Positions</h2>
    <table><thead><tr><th>Symbol</th><th>Size</th><th>Entry</th><th>Current</th><th>UnrealizedPnL</th><th>TP</th><th>SL</th><th>Opened</th></tr></thead><tbody id="stock-positions"></tbody></table>
  </section>

  <section class="panel full">
    <h2>Latest Signals</h2>
    <table><thead><tr><th>Market</th><th>Broker</th><th>Symbol</th><th>Side</th><th>Confidence</th><th>Entry</th><th>TP</th><th>SL</th><th>Risk%</th><th>Age</th></tr></thead><tbody id="signals"></tbody></table>
  </section>

  <section class="panel full">
    <h2>Recent Fills</h2>
    <table><thead><tr><th>Market</th><th>Broker</th><th>Symbol</th><th>Side</th><th>Size</th><th>Price</th><th>Time</th></tr></thead><tbody id="fills"></tbody></table>
  </section>

  <section class="panel">
    <h2>Total Portfolio PnL</h2>
    <div class="metric"><div class="k">Unrealized</div><div class="v" id="m-pnl">—</div></div>
  </section>
</main>
<script>
  function fmt(v, dec = 2) {
    const n = Number(v);
    if (v === null || v === undefined || Number.isNaN(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function age(ts) {
    if (!ts) return '—';
    const ms = Date.now() - new Date(ts).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 60000) return Math.floor(ms / 1000) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
    return Math.floor(ms / 3600000) + 'h';
  }
  function renderBalances(id, balances) {
    const tbody = document.getElementById(id);
    const entries = Object.entries(balances || {});
    tbody.innerHTML = entries.length
      ? entries.map(([asset, data]) => '<tr><td>' + asset + '</td><td>' + fmt(data.available, 4) + '</td><td>' + fmt(data.hold, 4) + '</td></tr>').join('')
      : '<tr><td colspan="3" class="muted">No balances</td></tr>';
  }
  function renderPositions(id, positions) {
    const tbody = document.getElementById(id);
    tbody.innerHTML = (positions || []).length
      ? positions.map((p) => '<tr><td>' + p.symbol + '</td><td>' + fmt(p.size, 6) + '</td><td>$' + fmt(p.entry) + '</td><td>$' + fmt(p.currentPrice) + '</td><td class="' + (Number(p.unrealizedPnL) >= 0 ? 'ok' : 'bad') + '">' + (Number(p.unrealizedPnL) >= 0 ? '+' : '') + '$' + fmt(p.unrealizedPnL) + '</td><td>$' + fmt(p.tp) + '</td><td>$' + fmt(p.sl) + '</td><td>' + age(p.openedAt) + '</td></tr>').join('')
      : '<tr><td colspan="8" class="muted">No open positions</td></tr>';
  }
  async function load() {
    const data = await fetch('/unified/dashboard').then((r) => r.json());
    document.getElementById('m-authority').textContent = data.system.authority;
    document.getElementById('m-mode').textContent = data.system.dryRun ? 'DRY_RUN' : 'LIVE';
    document.getElementById('m-kill').textContent = data.system.killSwitch ? 'ACTIVE' : 'CLEAR';
    document.getElementById('m-kill').className = 'v ' + (data.system.killSwitch ? 'bad' : 'ok');
    document.getElementById('m-crypto').textContent = data.system.enableCrypto ? 'ENABLED' : 'DISABLED';
    document.getElementById('m-equities').textContent = data.system.enableEquities ? 'ENABLED' : 'DISABLED';
    document.getElementById('m-ws').textContent = data.system.wsConnected ? 'CONNECTED' : 'REST';
    document.getElementById('m-pnl').textContent = '$' + fmt(data.totalPortfolioPnl);
    document.getElementById('m-pnl').className = 'v ' + (Number(data.totalPortfolioPnl) >= 0 ? 'ok' : 'bad');
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();

    renderBalances('crypto-balances', data.balances.crypto);
    renderBalances('stock-balances', data.balances.stocks);
    renderPositions('crypto-positions', data.positions.crypto);
    renderPositions('stock-positions', data.positions.stocks);

    const signals = document.getElementById('signals');
    signals.innerHTML = (data.latestSignals || []).length
      ? data.latestSignals.map((s) => '<tr><td>' + s.market + '</td><td>' + s.broker + '</td><td>' + s.symbol + '</td><td>' + s.side + '</td><td>' + fmt((s.confidence || 0) * 100, 0) + '%</td><td>' + (s.entry ? '$' + fmt(s.entry) : '—') + '</td><td>' + (s.tp ? '$' + fmt(s.tp) : '—') + '</td><td>' + (s.sl ? '$' + fmt(s.sl) : '—') + '</td><td>' + fmt((s.riskPct || 0) * 100, 2) + '%</td><td>' + age(s.ts) + '</td></tr>').join('')
      : '<tr><td colspan="10" class="muted">No signals</td></tr>';

    const fills = document.getElementById('fills');
    fills.innerHTML = (data.recentFills || []).length
      ? data.recentFills.map((f) => '<tr><td>' + f.market + '</td><td>' + f.broker + '</td><td>' + f.symbol + '</td><td>' + f.side + '</td><td>' + fmt(f.size, 6) + '</td><td>$' + fmt(f.price) + '</td><td>' + age(f.filledAt) + '</td></tr>').join('')
      : '<tr><td colspan="7" class="muted">No fills</td></tr>';
  }
  load().catch(() => {});
  setInterval(() => load().catch(() => {}), 5000);
</script>
</body>
</html>`;
}
