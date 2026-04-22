// src/server.js – Minimal HTTP API server (zero dependencies, raw Node.js)
// Exposes operational endpoints for monitoring and control.

import { createServer } from 'http';
import { URL } from 'url';
import config from '../config/index.js';
import log from './logging/index.js';
import { getBalances } from './accounts/index.js';
import { listProducts, getProduct } from './products/index.js';
import { listOpenOrders, listFills, cancelAllOpenOrders, createOrder } from './orders/index.js';
import { setKillSwitch, getKillSwitch, validateMinimumOrder } from './risk/index.js';
import portfolio from './portfolio/index.js';
import stockAdapter from './brokers/stock-adapter.js';
import coinbaseAdapter from './brokers/coinbase-adapter.js';
import unifiedPositionRegistry from './unified/position-registry.js';
import unifiedExecutionRouter from './unified/execution-router.js';

// Set by index.js after agent starts
let _agent = null;
let _lastUiRefreshTickLogAt = 0;
const CLOSE_POSITION_COMPLETION_THRESHOLD = 0.995;
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
    maxOpenCryptoPositions: config.dayTrade.maxOpenPositions,
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

function buildPriceMap() {
  const map = {};
  for (const productId of config.tradingPairs) {
    const snap = _agent?.feed?.getSnapshot?.(productId);
    if (snap?.price) map[productId] = Number(snap.price);
  }
  return map;
}

function normalizeManualOverrideInput(body = {}) {
  const symbol = String(body.symbol || '').toUpperCase().trim();
  const sideRaw = String(body.side || '').toUpperCase().trim();
  const side = sideRaw === 'CLOSE' ? 'SELL' : sideRaw;
  const requestedClose = sideRaw === 'CLOSE';
  const sizeUsd = Number(body.sizeUsd);
  return { symbol, side, requestedClose, sizeUsd };
}

async function executeManualOverrideOrder(input) {
  const { symbol, side, requestedClose, sizeUsd } = normalizeManualOverrideInput(input);
  log.info('MANUAL_OVERRIDE_CLICKED', { symbol, side: requestedClose ? 'CLOSE' : side, sizeUsd });

  if (!symbol || !config.tradingPairs.includes(symbol)) {
    return { ok: false, code: 400, reason: 'INVALID_SYMBOL', message: `symbol must be one of: ${config.tradingPairs.join(', ')}` };
  }
  if (!['BUY', 'SELL'].includes(side)) {
    return { ok: false, code: 400, reason: 'INVALID_SIDE', message: 'side must be BUY, SELL, or CLOSE' };
  }
  if (config.authority === 'OFF') {
    return { ok: false, code: 403, reason: 'AUTHORITY_OFF', message: 'Authority OFF blocks manual override' };
  }
  if (!config.cryptoAutoEnabled) {
    return { ok: false, code: 409, reason: 'CRYPTO_AUTO_DISABLED', message: 'Crypto live engine is disabled' };
  }
  if (getKillSwitch()) {
    return { ok: false, code: 409, reason: 'GLOBAL_KILL_SWITCH_ACTIVE', message: 'Global kill switch is active' };
  }

  const snapshot = _agent?.feed?.getSnapshot?.(symbol) || null;
  if (!snapshot || !Number.isFinite(Number(snapshot.price))) {
    return { ok: false, code: 409, reason: 'NO_MARKET_SNAPSHOT', message: `No live snapshot available for ${symbol}` };
  }

  if (side === 'BUY') {
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      return { ok: false, code: 400, reason: 'INVALID_SIZE_USD', message: 'sizeUsd must be a positive number for BUY' };
    }
    const signal = {
      market: 'crypto',
      broker: 'coinbase',
      symbol,
      side: 'BUY',
      confidence: 1,
      entry: Number(snapshot.price),
      tp: Number(snapshot.price) * (1 + config.dayTrade.takeProfitPct),
      sl: Number(snapshot.price) * (1 - config.dayTrade.stopLossPct),
      riskPct: config.risk.stopLossPct,
      reason: 'MANUAL_OVERRIDE',
      ts: Date.now(),
      indicators: {
        regime: 'MANUAL_OVERRIDE',
        strategyMode: config.strategyMode,
      },
    };
    const execution = await unifiedExecutionRouter.route({
      signal,
      snapshot,
      priceMap: buildPriceMap(),
      executionContext: {
        manualOverride: true,
        forceTrade: true,
        forceMinNotional: true,
        maxOpenPositions: config.dayTrade.maxOpenPositions,
        manualNotionalUsd: sizeUsd,
      },
    });
    if (!execution?.executed) {
      return {
        ok: false,
        code: 409,
        reason: execution?.reason || 'MANUAL_OVERRIDE_EXECUTION_BLOCKED',
        message: execution?.details?.reason || execution?.reason || 'Manual BUY was rejected',
        details: execution?.details || null,
      };
    }
    return {
      ok: true,
      code: 200,
      reason: 'MANUAL_OVERRIDE_EXECUTED',
      execution,
      symbol,
      side: 'BUY',
      sizeUsd,
      filled: Boolean(execution?.positionOpened),
    };
  }

  const balances = await getBalances();
  const baseCurrency = symbol.split('-')[0];
  const availableBase = Number(balances?.[baseCurrency]?.available || 0);
  if (!Number.isFinite(availableBase) || availableBase <= 0) {
    return { ok: false, code: 409, reason: 'NO_AVAILABLE_BASE_ASSET', message: `No available ${baseCurrency} to sell` };
  }

  const mark = Number(snapshot.price);
  let baseSize = availableBase;
  if (requestedClose && portfolio.hasPosition(symbol)) {
    const position = portfolio.getPosition(symbol);
    const trackedBaseSize = Number(position?.baseSize);
    baseSize = Math.min(availableBase, Number.isFinite(trackedBaseSize) && trackedBaseSize > 0 ? trackedBaseSize : availableBase);
  } else if (!requestedClose) {
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      return { ok: false, code: 400, reason: 'INVALID_SIZE_USD', message: 'sizeUsd must be a positive number for SELL' };
    }
    baseSize = Math.min(availableBase, sizeUsd / mark);
  }

  if (!Number.isFinite(baseSize) || baseSize <= 0) {
    return { ok: false, code: 409, reason: 'INVALID_SELL_SIZE', message: 'Computed sell size is not valid' };
  }

  const productMeta = await getProduct(symbol);
  const minCheck = validateMinimumOrder(productMeta, baseSize, null);
  if (!minCheck.valid) {
    return { ok: false, code: 409, reason: 'BROKER_MIN_ORDER_REJECTED', message: minCheck.reason };
  }

  const result = await createOrder({
    productId: symbol,
    side: 'SELL',
    baseSize: Number(baseSize.toFixed(8)),
  });
  const tracked = portfolio.getPosition(symbol);
  if (!result?.dryRun && tracked && baseSize >= Number(tracked.baseSize || 0) * CLOSE_POSITION_COMPLETION_THRESHOLD) {
    portfolio.closePosition(symbol, mark, 'manual_override');
  }
  return {
    ok: true,
    code: 200,
    reason: 'MANUAL_OVERRIDE_EXECUTED',
    symbol,
    side: requestedClose ? 'CLOSE' : 'SELL',
    sizeUsd: Number((baseSize * mark).toFixed(2)),
    baseSize: Number(baseSize.toFixed(8)),
    filled: !result?.dryRun,
    result,
  };
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

  'POST /manual-override': async (req, res) => {
    try {
      const body = await readBody(req);
      const result = await executeManualOverrideOrder(body);
      if (!result.ok) {
        log.warn('MANUAL_OVERRIDE_REJECTED', {
          symbol: body?.symbol || null,
          side: body?.side || null,
          sizeUsd: Number(body?.sizeUsd || 0),
          reason: result.reason,
          message: result.message,
        });
        return json(res, result.code || 409, {
          ok: false,
          reason: result.reason,
          message: result.message,
          details: result.details || null,
        });
      }
      log.info('MANUAL_OVERRIDE_SUBMITTED', {
        symbol: result.symbol,
        side: result.side,
        sizeUsd: result.sizeUsd,
      });
      if (result.filled) {
        log.info('MANUAL_OVERRIDE_FILLED', {
          symbol: result.symbol,
          side: result.side,
          sizeUsd: result.sizeUsd,
        });
      }
      return json(res, 200, {
        ok: true,
        reason: result.reason,
        symbol: result.symbol,
        side: result.side,
        sizeUsd: result.sizeUsd,
        baseSize: result.baseSize || null,
        filled: Boolean(result.filled),
        details: result.execution || result.result || null,
      });
    } catch (err) {
      log.warn('MANUAL_OVERRIDE_REJECTED', {
        reason: 'MANUAL_OVERRIDE_EXCEPTION',
        message: err.message,
      });
      return json(res, 500, { ok: false, reason: 'MANUAL_OVERRIDE_EXCEPTION', message: err.message });
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
