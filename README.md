# rw-trader-cb

Production-grade RW-Trader with one trading brain and two broker adapters:
- **Coinbase Advanced Trade API v3** for crypto
- **Stock broker execution layer** for equities (starter symbols: `AAPL,NVDA,TSLA,SPY`)

- Unified execution router (`crypto -> Coinbase`, `equities -> stock broker`)
- Spot crypto + equities routing (custody remains broker-separated)
- WebSocket market feed with automatic REST fallback
- Multi-gate risk engine runs before every order
- Dry-run by default; live execution requires explicit opt-in
- Tactical dark web dashboard at `http://localhost:3000/`

---

## File Tree

```
rw-trader-cb/
├── .env.example              # All required env vars (no secrets)
├── package.json
├── README.md
├── config/
│   └── index.js              # Central config loader + validation
├── scripts/
│   ├── setup.sh              # Install deps, copy .env
│   └── test-api.sh           # Smoke-test all REST endpoints
    └── src/
        ├── brokers/
        │   ├── coinbase-adapter.js
        │   └── stock-adapter.js
        ├── unified/
        │   ├── allocator.js
        │   ├── execution-router.js
        │   ├── position-registry.js
        │   └── signals.js
        ├── index.js              # Entry point + graceful shutdown
    ├── startup.js            # Startup validation (credentials, perms, prices)
    ├── agent.js              # Main trading loop (signal → risk → execute)
    ├── rest.js               # Authenticated REST client
    ├── server.js             # HTTP API server (8 endpoints)
    ├── ui.js                 # Tactical dashboard HTML
    ├── auth/index.js         # JWT builder (ES256, CB Advanced Trade v3)
    ├── logging/index.js      # Structured NDJSON audit logger
    ├── accounts/index.js     # Account listing + balance aggregation
    ├── products/index.js     # Product list, price snapshots, candles
    ├── market/index.js       # WebSocket feed + REST fallback
    ├── orders/index.js       # Preview, create, list, cancel orders
    ├── portfolio/index.js    # Position tracker + daily P&L + cooldowns
    ├── strategy/index.js     # Swing strategy: EMA + RSI pullback
    ├── risk/index.js         # Risk engine (8 pre-trade checks)
    └── execution/index.js    # Signal → size → preview → submit
```

---

## Setup

### 1. Prerequisites

- Node.js ≥ 18
- A Coinbase Advanced Trade (CDP) API key with **view** and **trade** permissions
  - Generate in Coinbase Developer Platform (CDP) Access for Advanced Trade:
    https://portal.cdp.coinbase.com/access/api
  - `CB_API_KEY_NAME` must be the full resource name:
    `organizations/{org_id}/apiKeys/{key_id}`

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env — fill in CB_API_KEY_NAME and CB_API_PRIVATE_KEY
```

### 4. Validate credentials

```bash
npm run validate
```

This confirms (when credentials are provided):
- JWT signs correctly
- `/accounts` returns data (view scope confirmed)
- Price snapshots load for each trading pair

---

## Running

### Dry-run (safe default — no orders submitted)

```bash
DRY_RUN=true AUTHORITY=ASSIST npm start
```

Default feature flags:
- `ENABLE_CRYPTO=true`
- `ENABLE_EQUITIES=true`

If Coinbase credentials are not set, the API server still starts and `/health` reports `status: "degraded"` with a credentials message.

The server binds to `HOST` (default `0.0.0.0`) and `PORT` (default `3000`) for container deployment platforms like Railway.

### Assist mode (signals generated, logged, not auto-executed)

```bash
DRY_RUN=true AUTHORITY=ASSIST npm start
```

### Live autonomous execution ⚠️

Only enable after thorough dry-run testing:

```bash
DRY_RUN=false AUTHORITY=AUTO npm start
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Agent status, WS connection, kill switch |
| GET | `/balances` | All non-zero account balances |
| GET | `/products` | Trading universe product details |
| GET | `/signals` | Latest signal per pair |
| GET | `/orders` | Open orders + recent fills |
| GET | `/positions` | Open positions + daily P&L |
| GET | `/unified/dashboard` | Unified status, split balances/positions, latest signals, fills, total portfolio PnL |
| GET/POST | `/kill-switch` | Read or toggle kill switch |
| GET/POST | `/mode` | Read or set authority mode |
| DELETE | `/orders` | Cancel all open orders |

---

## Risk Rules (run before every order)

1. **Kill switch** — instant halt
2. **Authority=OFF** — no trading
3. **Cooldown** — 1h pause after any stop-out
4. **Stale price** — reject if price data > 30s old
5. **Spread check** — reject if bid/ask spread > 0.5%
6. **Max portfolio %** — cap at 5% of portfolio per trade
7. **Max dollar loss** — cap at $50 potential loss per trade
8. **Daily loss cutoff** — halt at $150 daily loss
9. **Position exists** — no double-entry on same pair
10. **Exchange minimum** — reject below CB's min order size

All thresholds configurable in `.env`.

---

## Strategy: Spot Swing — Pullback in Uptrend

**Timeframes:** 1D trend bias + 4H entry timing

**Entry conditions (all must be true):**
- 1D EMA21 > EMA55 (uptrend confirmed)
- 4H EMA9 > EMA21 (momentum up)
- 4H RSI between 30–58 (pullback zone, not overbought)
- Price within 1.2% of 4H EMA21 (at the pullback level)

**Exit conditions (checked every 60s):**
- Take profit at +4% from entry
- Stop loss at -2% from entry
- Trailing stop activates at +1.5%, trails by 1.5%

All parameters configurable in `.env`.

---

## Test Commands

```bash
# Validate startup
npm run validate

# Verify only Coinbase auth on one request
npm run verify:auth

# Health check
curl http://localhost:3000/health | jq .

# Balances
curl http://localhost:3000/balances | jq .

# Signals
curl http://localhost:3000/signals | jq .

# Kill switch on
curl -X POST http://localhost:3000/kill-switch \
  -H 'Content-Type: application/json' \
  -d '{"active":true}'

# Kill switch off
curl -X POST http://localhost:3000/kill-switch \
  -H 'Content-Type: application/json' \
  -d '{"active":false}'

# Cancel all open orders
curl -X DELETE http://localhost:3000/orders | jq .

# Run full smoke test
bash scripts/test-api.sh
```

---

## Production Deployment (VPS / systemd)

```ini
# /etc/systemd/system/rw-trader.service
[Unit]
Description=RW Trader CB
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/rw-trader-cb
EnvironmentFile=/opt/rw-trader-cb/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable rw-trader
sudo systemctl start rw-trader
sudo journalctl -u rw-trader -f
```

---

## Security Notes

- Never commit `.env` — it contains your private key
- API key should have minimum required scopes (view + trade)
- DRY_RUN=true is the safe default; AUTO requires explicit opt-in
- Kill switch can be toggled via API without restarting the process
- All logs are NDJSON to stdout — pipe to a log aggregator in production
