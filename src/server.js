// src/server.js – Minimal HTTP API server (zero dependencies, raw Node.js)
// Exposes operational endpoints for monitoring and control.

import { createServer } from 'http';
import { URL } from 'url';
import config from '../config/index.js';
import log from './logging/index.js';
import { getBalances } from './accounts/index.js';
import { listProducts, getPriceSnapshots } from './products/index.js';
import { listOpenOrders, listFills, cancelAllOpenOrders } from './orders/index.js';
import { setKillSwitch, getKillSwitch } from './risk/index.js';
import portfolio from './portfolio/index.js';
import stockAdapter from './brokers/stock-adapter.js';
import coinbaseAdapter from './brokers/coinbase-adapter.js';
import unifiedPositionRegistry from './unified/position-registry.js';

// Set by index.js after agent starts
let _agent = null;
let _lastUiRefreshTickLogAt = 0;
export function attachAgent(agent) { _agent = agent; }

function getCryptoPositions() {
  const now = Date.now();
  const latestSignals = _agent ? _agent.getSignals().filter((signal) => signal.market === 'crypto') : [];
  const signalTsByProduct = new Map(
    latestSignals
      .map((signal) => [signal.symbol, signal.ts])
      .filter(([pid]) => Boolean(pid))
  );

  return (portfolio.getAllPositions() || []).map((p) => {
    const snap = _agent?.feed?.getSnapshot?.(p.productId) ?? null;
    const fallbackPrice = Number.isFinite(snap?.price) ? snap.price : null;
    const markPrice = Number.isFinite(p.markPrice) ? p.markPrice : fallbackPrice;
    const marketTs = Number.isFinite(p.lastMarketUpdateTs) ? p.lastMarketUpdateTs : (Number.isFinite(snap?.ts) ? snap.ts : null);
    const unrealizedPnlUsd = Number.isFinite(p.unrealizedPnlUsd)
      ? p.unrealizedPnlUsd
      : ((Number.isFinite(markPrice) && Number.isFinite(p.entryPrice) && Number.isFinite(p.baseSize))
          ? ((p.side === 'SELL' ? (p.entryPrice - markPrice) : (markPrice - p.entryPrice)) * p.baseSize)
          : null);

    return {
      broker: 'coinbase',
      symbol: p.productId,
      market: 'crypto',
      executionType: 'REAL',
      size: p.baseSize,
      entry: p.entryPrice,
      currentPrice: markPrice,
      unrealizedPnL: unrealizedPnlUsd,
      tp: p.tpPrice,
      sl: p.slPrice,
      openedAt: p.openedAt,
      signalTs: signalTsByProduct.get(p.productId) ?? null,
      marketTs,
      positionAgeMs: Number.isFinite(p.openedAt) ? Math.max(0, now - p.openedAt) : null,
      lastMarketUpdateAgeMs: Number.isFinite(marketTs) ? Math.max(0, now - marketTs) : null,
      productId: p.productId,
      markPrice,
      lastPrice: Number.isFinite(p.lastPrice) ? p.lastPrice : markPrice,
      unrealizedPnlUsd,
    };
  });
}

function syncUnifiedPositionRegistry() {
  const cryptoPositions = getCryptoPositions();
  const stockPositions = stockAdapter.getOpenPositions();
  unifiedPositionRegistry.syncCryptoPositions(cryptoPositions, 'coinbase');
  unifiedPositionRegistry.syncStockPositions(stockPositions, stockAdapter.broker);
  return {
    cryptoPositions: unifiedPositionRegistry.listCrypto(),
    stockPositions: unifiedPositionRegistry.listStocks(),
    all: unifiedPositionRegistry.listAll(),
  };
}

function getControlState() {
  return {
    cryptoAutoEnabled: config.cryptoAutoEnabled,
    stockPaperEnabled: config.stockPaperEnabled,
    strategyMode: config.strategyMode,
    authority: config.authority,
    globalKillSwitch: getKillSwitch(),
  };
}

function setControlState(next) {
  if (typeof next.cryptoAutoEnabled === 'boolean') {
    config.cryptoAutoEnabled = next.cryptoAutoEnabled;
    config.enableCrypto = next.cryptoAutoEnabled;
  }
  if (typeof next.stockPaperEnabled === 'boolean') {
    config.stockPaperEnabled = next.stockPaperEnabled;
    config.enableEquities = next.stockPaperEnabled;
  }
  if (typeof next.authority === 'string') {
    const authority = String(next.authority).toUpperCase();
    if (!['OFF', 'ASSIST', 'AUTO'].includes(authority)) {
      throw new Error('authority must be OFF, ASSIST, or AUTO');
    }
    config.authority = authority;
  }
  if (typeof next.strategyMode === 'string') {
    const strategyMode = String(next.strategyMode).toUpperCase();
    if (!['SWING', 'DAY_TRADE'].includes(strategyMode)) {
      throw new Error('strategyMode must be SWING or DAY_TRADE');
    }
    config.strategyMode = strategyMode;
  }
  if (typeof next.globalKillSwitch === 'boolean') {
    config.globalKillSwitch = next.globalKillSwitch;
    config.killSwitch = next.globalKillSwitch;
    setKillSwitch(next.globalKillSwitch);
  }
  return getControlState();
}

function getPositionsPayload() {
  const now = Date.now();
  const state = portfolio.snapshot();
  const { cryptoPositions } = syncUnifiedPositionRegistry();
  const positions = cryptoPositions;

  if (now - _lastUiRefreshTickLogAt >= 15000) {
    _lastUiRefreshTickLogAt = now;
    log.info('UI_REFRESH_TICK', {
      endpoint: '/positions',
      openPositions: positions.length,
      wsConnected: _agent?.feed?.connected ?? false,
      refreshedAt: new Date(now).toISOString(),
    });
  }

  return {
    ...state,
    positions,
    wsConnected: _agent?.feed?.connected ?? false,
    ts: new Date(now).toISOString(),
  };
}

async function serveDashboardPage(res) {
  const { getDashboardHTML } = await import('./ui.js');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(getDashboardHTML());
}

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: 'Not found' });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const routes = {
  'GET /health': async (_req, res) => {
    const hasCredentials = config.hasCoinbaseCredentials;
    const agentRunning = Boolean(_agent);
    const cryptoReady = !config.cryptoAutoEnabled || hasCredentials;
    const equitiesReady = !config.stockPaperEnabled || agentRunning;
    json(res, 200, {
      status: agentRunning && cryptoReady && equitiesReady ? 'ok' : 'degraded',
      ts: new Date().toISOString(),
      controls: getControlState(),
      pairs: config.tradingPairs,
      wsConnected: _agent?.feed?.connected ?? false,
      features: {
        enableCrypto: config.cryptoAutoEnabled,
        enableEquities: config.stockPaperEnabled,
      },
      equities: {
        broker: stockAdapter.broker,
        symbols: config.stockSymbols,
      },
      credentials: {
        configured: hasCredentials,
        message: !hasCredentials
          ? 'Coinbase credentials missing. Trading agent is disabled until credentials are provided.'
          : (agentRunning
              ? 'Coinbase credentials loaded and trading agent running.'
              : 'Coinbase credentials loaded, but startup validation failed. Running in degraded mode.'),
      },
    });
  },

  'GET /balances': async (_req, res) => {
    try {
      const balances = await getBalances();
      json(res, 200, { balances });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET /products': async (_req, res) => {
    try {
      const products = await listProducts();
      const universe = products.filter(p => config.tradingPairs.includes(p.product_id));
      json(res, 200, { universe, total: products.length });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET /signals': async (_req, res) => {
    const signals = _agent ? _agent.getSignals() : [];
    json(res, 200, { signals, ts: new Date().toISOString() });
  },

  'GET /orders': async (req, res) => {
    try {
      const url    = new URL(req.url, 'http://x');
      const pair   = url.searchParams.get('pair') ?? null;
      const [open, fills] = await Promise.all([
        listOpenOrders(pair),
        listFills(pair, 50),
      ]);
      json(res, 200, { open, fills });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET /positions/data': async (_req, res) => {
    json(res, 200, getPositionsPayload());
  },
  'GET /api/positions': async (_req, res) => {
    json(res, 200, getPositionsPayload());
  },

  'GET /unified/dashboard': async (_req, res) => {
    try {
      const [cryptoBalances, stockBalances, coinbaseFills, stockFills, portfolioState] = await Promise.all([
        config.cryptoAutoEnabled ? getBalances() : {},
        config.stockPaperEnabled ? stockAdapter.getBalances() : {},
        config.cryptoAutoEnabled ? coinbaseAdapter.getRecentFills(20) : [],
        config.stockPaperEnabled ? stockAdapter.getRecentFills(20) : [],
        Promise.resolve(portfolio.snapshot()),
      ]);

      const { cryptoPositions, stockPositions, all } = syncUnifiedPositionRegistry();
      const latestSignals = _agent ? _agent.getSignals() : [];
      const cryptoDecisions = _agent ? _agent.getCryptoDecisions() : [];
      const unrealizedCryptoPnl = cryptoPositions.reduce((sum, position) => sum + Number(position.unrealizedPnL || 0), 0);
      const unrealizedStockPnl = stockPositions.reduce((sum, position) => sum + Number(position.unrealizedPnL || 0), 0);

      json(res, 200, {
        controlPanel: {
          ts: new Date().toISOString(),
          ...getControlState(),
          killSwitchState: getKillSwitch() ? 'ARMED' : 'CLEAR',
          wsConnected: _agent?.feed?.connected ?? false,
        },
        realCrypto: {
          balances: {
            USD: cryptoBalances.USD || { available: 0, hold: 0, total: 0 },
            BTC: cryptoBalances.BTC || { available: 0, hold: 0, total: 0 },
            ETH: cryptoBalances.ETH || { available: 0, hold: 0, total: 0 },
          },
          openPositions: cryptoPositions,
          unrealizedPnlUsd: unrealizedCryptoPnl,
          realizedPnlUsd: Number(portfolioState.realizedPnlUsd || 0),
          recentFills: coinbaseFills,
        },
        simulatedStocks: {
          balances: stockBalances,
          paperCashUsd: Number(stockBalances.USD?.available || 0),
          paperEquityValueUsd: Number(stockBalances.EQUITY_VALUE?.total || 0),
          openPositions: stockPositions,
          unrealizedPnlUsd: unrealizedStockPnl,
          paperFills: stockFills,
        },
        signals: latestSignals,
        cryptoDecisions,
        positions: {
          realCrypto: cryptoPositions,
          paperStocks: stockPositions,
          all,
        },
      });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET /control/state': async (_req, res) => {
    json(res, 200, getControlState());
  },
  'GET /api/control': async (_req, res) => {
    json(res, 200, getControlState());
  },

  'POST /control': async (req, res) => {
    try {
      const body = await readBody(req);
      const nextState = setControlState({
        cryptoAutoEnabled: typeof body.cryptoAutoEnabled === 'boolean' ? body.cryptoAutoEnabled : undefined,
        stockPaperEnabled: typeof body.stockPaperEnabled === 'boolean' ? body.stockPaperEnabled : undefined,
        strategyMode: body.strategyMode,
        authority: body.authority,
        globalKillSwitch: typeof body.globalKillSwitch === 'boolean' ? body.globalKillSwitch : undefined,
      });
      log.info('CONTROL_PANEL_UPDATED', nextState);
      json(res, 200, nextState);
    } catch (err) {
      json(res, 400, { error: err.message });
    }
  },

  'GET /kill-switch': async (_req, res) => {
    json(res, 200, { globalKillSwitch: getKillSwitch() });
  },

  'POST /kill-switch': async (req, res) => {
    const body   = await readBody(req);
    const active = body.active === true || body.active === 'true';
    const nextState = setControlState({ globalKillSwitch: active });
    json(res, 200, { ...nextState, ts: new Date().toISOString() });
  },

  'GET /mode': async (_req, res) => {
    json(res, 200, {
      authority: config.authority,
    });
  },

  'POST /mode': async (req, res) => {
    // Runtime authority switch (does NOT override dryRun — requires restart for that)
    const body = await readBody(req);
    const allowed = ['OFF', 'ASSIST', 'AUTO'];
    if (!allowed.includes(body.authority)) {
      return json(res, 400, { error: `authority must be one of: ${allowed.join(', ')}` });
    }
    const nextState = setControlState({ authority: body.authority });
    log.info('AUTHORITY_CHANGED', { authority: config.authority });
    json(res, 200, { authority: nextState.authority });
  },

  'DELETE /orders': async (_req, res) => {
    try {
      const results = await cancelAllOpenOrders();
      json(res, 200, { cancelled: results.length, results });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  // Serve dashboard UI
  'GET /': async (_req, res) => {
    res.writeHead(302, { Location: '/home' });
    res.end();
  },
  'GET /home': async (_req, res) => {
    await serveDashboardPage(res);
  },
  'GET /markets': async (_req, res) => {
    await serveDashboardPage(res);
  },
  'GET /chart': async (_req, res) => {
    await serveDashboardPage(res);
  },
  'GET /positions': async (_req, res) => {
    await serveDashboardPage(res);
  },
  'GET /control': async (_req, res) => {
    await serveDashboardPage(res);
  },
};

export function createApiServer() {
  const server = createServer(async (req, res) => {
    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url    = new URL(req.url, 'http://x');
    const key    = `${req.method} ${url.pathname}`;
    const handler = routes[key];

    log.debug('HTTP_REQUEST', { method: req.method, path: url.pathname });

    if (handler) {
      try {
        await handler(req, res);
      } catch (err) {
        log.error('HTTP_ERROR', { path: url.pathname, error: err.message });
        json(res, 500, { error: 'Internal server error' });
      }
    } else {
      notFound(res);
    }
  });

  return server;
}
