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

// Set by index.js after agent starts
let _agent = null;
let _lastUiRefreshTickLogAt = 0;
export function attachAgent(agent) { _agent = agent; }

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
    json(res, 200, {
      status: hasCredentials && agentRunning ? 'ok' : 'degraded',
      ts: new Date().toISOString(),
      dryRun: config.dryRun,
      authority: config.authority,
      killSwitch: getKillSwitch(),
      pairs: config.tradingPairs,
      wsConnected: _agent?.feed?.connected ?? false,
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

  'GET /positions': async (_req, res) => {
    const state = portfolio.snapshot();
    const now = Date.now();
    const latestSignals = _agent ? _agent.getSignals() : [];
    const signalTsByProduct = new Map(
      latestSignals.map(s => [s.productId, s.ts]).filter(([pid]) => Boolean(pid))
    );

    const positions = (state.positions || []).map((p) => {
      const snap = _agent?.feed?.getSnapshot?.(p.productId) ?? null;
      const markPrice = Number.isFinite(p.markPrice) ? p.markPrice : (Number.isFinite(snap?.price) ? snap.price : null);
      const lastPrice = Number.isFinite(p.lastPrice) ? p.lastPrice : (Number.isFinite(snap?.price) ? snap.price : null);
      const marketTs = Number.isFinite(p.lastMarketUpdateTs) ? p.lastMarketUpdateTs : (Number.isFinite(snap?.ts) ? snap.ts : null);
      const unrealizedPnlUsd = Number.isFinite(p.unrealizedPnlUsd)
        ? p.unrealizedPnlUsd
        : ((Number.isFinite(markPrice) && Number.isFinite(p.entryPrice) && Number.isFinite(p.baseSize))
            ? ((p.side === 'SELL'
                ? (p.entryPrice - markPrice)
                : (markPrice - p.entryPrice)) * p.baseSize)
            : null);

      return {
        ...p,
        markPrice,
        lastPrice,
        unrealizedPnlUsd,
        signalTs: signalTsByProduct.get(p.productId) ?? null,
        marketTs,
        positionAgeMs: Number.isFinite(p.openedAt) ? Math.max(0, now - p.openedAt) : null,
        lastMarketUpdateAgeMs: Number.isFinite(marketTs) ? Math.max(0, now - marketTs) : null,
      };
    });

    if (now - _lastUiRefreshTickLogAt >= 15000) {
      _lastUiRefreshTickLogAt = now;
      log.info('UI_REFRESH_TICK', {
        endpoint: '/positions',
        openPositions: positions.length,
        wsConnected: _agent?.feed?.connected ?? false,
        refreshedAt: new Date(now).toISOString(),
      });
    }

    json(res, 200, {
      ...state,
      positions,
      wsConnected: _agent?.feed?.connected ?? false,
      ts: new Date(now).toISOString(),
    });
  },

  'GET /kill-switch': async (_req, res) => {
    json(res, 200, { killSwitch: getKillSwitch() });
  },

  'POST /kill-switch': async (req, res) => {
    const body   = await readBody(req);
    const active = body.active === true || body.active === 'true';
    setKillSwitch(active);
    json(res, 200, { killSwitch: getKillSwitch(), ts: new Date().toISOString() });
  },

  'GET /mode': async (_req, res) => {
    json(res, 200, {
      authority: config.authority,
      dryRun:   config.dryRun,
    });
  },

  'POST /mode': async (req, res) => {
    // Runtime authority switch (does NOT override dryRun — requires restart for that)
    const body = await readBody(req);
    const allowed = ['OFF', 'ASSIST', 'AUTO'];
    if (!allowed.includes(body.authority)) {
      return json(res, 400, { error: `authority must be one of: ${allowed.join(', ')}` });
    }
    if (body.authority === 'AUTO' && config.dryRun) {
      return json(res, 400, { error: 'Cannot set AUTO while DRY_RUN=true. Restart with DRY_RUN=false.' });
    }
    config.authority = body.authority;
    log.info('AUTHORITY_CHANGED', { authority: config.authority });
    json(res, 200, { authority: config.authority });
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
    const { getDashboardHTML } = await import('./ui.js');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getDashboardHTML());
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
