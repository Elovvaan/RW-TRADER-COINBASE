// src/products/index.js – Products & price snapshots via CB Advanced Trade v3

import cbFetch from '../rest.js';
import log from '../logging/index.js';

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
  const path = `/api/v3/brokerage/best_bid_ask?product_ids=${productId}`;
  const data = await cbFetch('GET', path);

  const pricebooks = data.pricebooks || [];
  const pb = pricebooks.find(p => p.product_id === productId);

  if (!pb) throw new Error(`[PRODUCTS] No pricebook returned for ${productId}`);

  const bid    = parseFloat(pb.bids?.[0]?.price ?? '0');
  const ask    = parseFloat(pb.asks?.[0]?.price ?? '0');
  const price  = (bid + ask) / 2;
  const spread = ask - bid;
  const spreadPct = bid > 0 ? spread / bid : 0;

  return {
    productId,
    bid,
    ask,
    price,
    spread,
    spreadPct,
    ts: Date.now(),
  };
}

/**
 * Fetch price snapshots for multiple products in one call.
 * Returns map: { productId → snapshot }
 */
export async function getPriceSnapshots(productIds) {
  const ids = productIds.join(',');
  const path = `/api/v3/brokerage/best_bid_ask?product_ids=${ids}`;
  const data = await cbFetch('GET', path);
  const pricebooks = data.pricebooks || [];

  const result = {};
  for (const pb of pricebooks) {
    const bid    = parseFloat(pb.bids?.[0]?.price ?? '0');
    const ask    = parseFloat(pb.asks?.[0]?.price ?? '0');
    const price  = (bid + ask) / 2;
    const spread = ask - bid;
    const spreadPct = bid > 0 ? spread / bid : 0;
    result[pb.product_id] = { productId: pb.product_id, bid, ask, price, spread, spreadPct, ts: Date.now() };
  }

  return result;
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
  const path = `/api/v3/brokerage/products/${productId}/candles?granularity=${granularity}&start=${start}&end=${end}`;
  const data = await cbFetch('GET', path);
  // Returns array of [start, low, high, open, close, volume]
  return (data.candles || []).map(c => ({
    time:   parseInt(c.start, 10),
    low:    parseFloat(c.low),
    high:   parseFloat(c.high),
    open:   parseFloat(c.open),
    close:  parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}
