// src/products/index.js – Products & price snapshots via CB Advanced Trade v3

import { cbFetch } from '../rest.js';
import log from '../logging/index.js';

const CANDLE_SECONDS_BY_GRANULARITY = {
  ONE_MINUTE: 60,
  FIVE_MINUTE: 300,
  FIFTEEN_MINUTE: 900,
  THIRTY_MINUTE: 1800,
  ONE_HOUR: 3600,
  TWO_HOUR: 7200,
  SIX_HOUR: 21600,
  ONE_DAY: 86400,
};

const MAX_CANDLES_PER_REQUEST = 350;

/**
 * List all products or filter by type.
 * Returns raw product array.
 */
export async function listProducts(productType = 'SPOT') {
  const path = `/api/v3/brokerage/products?product_type=${productType}&limit=250`;
  const data = await cbFetch('GET', path);
  return data.products || [];
}

/**
 * Get current best bid/ask + last price for a single product.
 * Returns { productId, bid, ask, price, spread, spreadPct, ts }
 */
export async function getPriceSnapshot(productId) {
  const { snapshots, diagnostics } = await getPriceSnapshotsWithDiagnostics([productId]);
  const snap = snapshots[productId];
  if (!snap) {
    const d = diagnostics[productId];
    throw new Error(`[PRODUCTS] Snapshot missing for ${productId}: ${d?.missingReason ?? 'unknown reason'}`);
  }
  return snap;
}

/**
 * Fetch price snapshots for multiple products via one request per product.
 * Returns map: { productId → snapshot }
 */
export async function getPriceSnapshots(productIds) {
  const { snapshots } = await getPriceSnapshotsWithDiagnostics(productIds);
  return snapshots;
}

export async function getPriceSnapshotsWithDiagnostics(productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return {
      snapshots: {},
      diagnostics: {},
      endpoint: null,
      status: null,
      responseShapeKeys: [],
      endpoints: {},
      statuses: {},
      responseShapeKeysByProduct: {},
    };
  }

  const snapshots = {};
  const diagnostics = {};
  const endpoints = {};
  const statuses = {};
  const responseShapeKeysByProduct = {};

  await Promise.all(productIds.map(async (pid) => {
    const path = `/api/v3/brokerage/best_bid_ask?product_ids=${encodeURIComponent(pid)}`;
    endpoints[pid] = path;
    try {
      const { data, meta } = await cbFetch('GET', path, null, { withMeta: true });
      const shapeKeys = Object.keys(data || {});
      const status = meta.status;
      statuses[pid] = status;
      responseShapeKeysByProduct[pid] = shapeKeys;
      const pricebooks = _extractPricebooks(data);
      const pb = pricebooks.find(p => (p.product_id || p.productId) === pid);
      const parsed = _parseSnapshotFromPricebook(pb, pid);
      if (parsed.snapshot) snapshots[pid] = parsed.snapshot;
      diagnostics[pid] = {
        endpoint: path,
        productId: pid,
        httpStatus: status,
        responseShapeKeys: shapeKeys,
        missingReason: parsed.missingReason,
      };
    } catch (err) {
      const status = _extractErrorStatus(err);
      const shapeKeys = Object.keys(err?.body || {});
      statuses[pid] = status;
      responseShapeKeysByProduct[pid] = shapeKeys;
      diagnostics[pid] = {
        endpoint: path,
        productId: pid,
        httpStatus: status,
        responseShapeKeys: shapeKeys,
        missingReason: `request_failed: ${err.message}`,
      };
    }
  }));

  const representativeProductId = productIds.find(pid => {
    const status = statuses[pid];
    return Number.isInteger(status) && status >= 200 && status < 400;
  }) || productIds[0];
  const representativeEndpoint = representativeProductId ? endpoints[representativeProductId] : null;
  const representativeStatus = representativeProductId ? statuses[representativeProductId] : null;
  const representativeShapeKeys = representativeProductId ? responseShapeKeysByProduct[representativeProductId] : [];
  return {
    snapshots,
    diagnostics,
    endpoint: representativeEndpoint,
    status: representativeStatus,
    responseShapeKeys: representativeShapeKeys,
    endpoints,
    statuses,
    responseShapeKeysByProduct,
  };
}

/**
 * Get product metadata (min order size, base increment, etc.).
 */
export async function getProduct(productId) {
  const path = `/api/v3/brokerage/products/${productId}`;
  return cbFetch('GET', path);
}

/**
 * Fetch historical candles for a product.
 * granularity: ONE_MINUTE | FIVE_MINUTE | FIFTEEN_MINUTE | THIRTY_MINUTE | ONE_HOUR | TWO_HOUR | SIX_HOUR | ONE_DAY
 */
export async function getCandles(productId, granularity, start, end) {
  const granularitySeconds = CANDLE_SECONDS_BY_GRANULARITY[granularity];
  if (!granularitySeconds) {
    throw new Error(`[PRODUCTS] Unsupported candle granularity: ${granularity}`);
  }

  const endSec = _toUnixSeconds(end);
  const startSecInput = _toUnixSeconds(start);
  const maxSpanSeconds = granularitySeconds * MAX_CANDLES_PER_REQUEST;
  const startSec = Math.max(0, Math.max(startSecInput, endSec - maxSpanSeconds));

  const query = new URLSearchParams({
    start: String(startSec),
    end: String(endSec),
    granularity,
  });
  const path = `/api/v3/brokerage/products/${productId}/candles?${query.toString()}`;

  try {
    const { data, meta } = await cbFetch('GET', path, null, { withMeta: true });
    log.info('CANDLES_REQUEST_RESULT', {
      productId,
      granularity,
      path,
      httpStatus: meta.status,
    });
    return _parseCandles(data?.candles);
  } catch (err) {
    log.warn('CANDLES_REQUEST_FAILED', {
      productId,
      granularity,
      path,
      httpStatus: _extractErrorStatus(err),
      responseShapeKeys: Object.keys(err?.body || {}),
      error: err.message,
    });
    throw err;
  }
}

function _toUnixSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`[PRODUCTS] Invalid candle timestamp: ${value}`);
  }
  return Math.max(0, Math.floor(n));
}

function _parseCandles(candles) {
  if (!Array.isArray(candles)) return [];
  const parsed = [];
  for (const candle of candles) {
    const normalized = _normalizeCandle(candle);
    if (normalized) parsed.push(normalized);
  }
  return parsed;
}

function _normalizeCandle(candle) {
  const source = Array.isArray(candle)
    ? {
        start: candle[0],
        low: candle[1],
        high: candle[2],
        open: candle[3],
        close: candle[4],
        volume: candle[5],
      }
    : candle || {};

  const time = Number.parseInt(source.start, 10);
  const low = Number.parseFloat(source.low);
  const high = Number.parseFloat(source.high);
  const open = Number.parseFloat(source.open);
  const close = Number.parseFloat(source.close);
  const volume = Number.parseFloat(source.volume);

  if (![time, low, high, open, close, volume].every(Number.isFinite)) return null;
  return { time, low, high, open, close, volume };
}

function _extractPricebooks(data) {
  if (Array.isArray(data?.pricebooks)) return data.pricebooks;
  if (Array.isArray(data?.books)) return data.books;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data?.pricebooks)) return data.data.pricebooks;
  if (Array.isArray(data?.data?.books)) return data.data.books;
  return [];
}

function _parseSnapshotFromPricebook(pb, fallbackProductId) {
  if (!pb) return { snapshot: null, missingReason: 'product_not_found_in_response' };

  const productId = pb.product_id || pb.productId || fallbackProductId;
  const bidRaw = pb.bids?.[0]?.price ?? pb.best_bid ?? pb.bid ?? pb.bestBid;
  const askRaw = pb.asks?.[0]?.price ?? pb.best_ask ?? pb.ask ?? pb.bestAsk;
  const priceRaw = pb.price ?? pb.mid_price ?? pb.midPrice;

  const bid = parseFloat(bidRaw);
  const ask = parseFloat(askRaw);

  let price = parseFloat(priceRaw);
  if (!Number.isFinite(price)) {
    if (Number.isFinite(bid) && Number.isFinite(ask)) price = (bid + ask) / 2;
    else if (Number.isFinite(bid)) price = bid;
    else if (Number.isFinite(ask)) price = ask;
  }

  if (!Number.isFinite(bid) && !Number.isFinite(ask) && !Number.isFinite(price)) {
    return { snapshot: null, missingReason: 'missing_bid_ask_and_price_fields' };
  }

  const finalBid = Number.isFinite(bid) ? bid : price;
  const finalAsk = Number.isFinite(ask) ? ask : price;
  const spread = finalAsk - finalBid;
  const spreadPct = finalBid > 0 ? spread / finalBid : 0;

  if (!Number.isFinite(price) || price <= 0) {
    return { snapshot: null, missingReason: 'non_positive_or_invalid_price' };
  }

  return {
    snapshot: {
      productId,
      bid: finalBid,
      ask: finalAsk,
      price,
      spread,
      spreadPct,
      ts: Date.now(),
    },
    missingReason: null,
  };
}

function _extractErrorStatus(err) {
  if (Number.isInteger(err?.status)) return err.status;
  if (Number.isInteger(err?.response?.status)) return err.response.status;
  return null;
}
