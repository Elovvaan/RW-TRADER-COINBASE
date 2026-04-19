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
    json(res, 200, {
      status: hasCredentials ? 'ok' : 'degraded',
      ts: new Date().toISOString(),
      dryRun: config.dryRun,
      authority: config.authority,
      killSwitch: getKillSwitch(),
      pairs: config.tradingPairs,
      wsConnected: _agent?.feed?.connected ?? false,
      credentials: {
        configured: hasCredentials,
        message: hasCredentials
          ? 'Coinbase credentials loaded.'
          : 'Coinbase credentials missing. Trading agent is disabled until credentials are provided.',
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
    json(res, 200, state);
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
