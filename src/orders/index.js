// src/orders/index.js – Order management via CB Advanced Trade v3

import { randomUUID } from 'crypto';
import cbFetch from '../rest.js';
import log from '../logging/index.js';
import config from '../../config/index.js';

// ── Order creation ────────────────────────────────────────────────────────────

/**
 * Preview an order (does NOT submit).
 * Returns preview result including estimated fees, total, warnings.
 */
export async function previewOrder(params) {
  const body = _buildOrderBody(params);
  const data = await cbFetch('POST', '/api/v3/brokerage/orders/preview', body);

  log.orderPreview({
    productId: params.productId,
    side:      params.side,
    quoteSize: params.quoteSize,
    baseSize:  params.baseSize,
    preview:   {
      orderTotal:   data.order_total,
      commissionTotal: data.commission_total,
      warnings:     data.order_configuration_warnings,
      errs:         data.preview_failure_reason,
    },
  });

  return data;
}

/**
 * Submit a live order. In DRY_RUN mode, calls previewOrder only.
 * Returns { orderId, status, dryRun }
 */
export async function createOrder(params) {
  if (config.dryRun) {
    log.warn('DRY_RUN_ORDER_SKIPPED', { params });
    const preview = await previewOrder(params);
    return { orderId: null, status: 'dry_run', dryRun: true, preview };
  }

  const body = _buildOrderBody(params);
  body.client_order_id = randomUUID();

  const data = await cbFetch('POST', '/api/v3/brokerage/orders', body);

  if (!data.success) {
    const reason = data.error_response?.preview_failure_reason
      || data.error_response?.message
      || 'UNKNOWN';
    log.orderRejected({ params, reason, response: data.error_response });
    throw Object.assign(new Error(`[ORDERS] Order rejected: ${reason}`), { cbError: data.error_response });
  }

  const orderId = data.success_response?.order_id;
  log.orderSubmitted({ orderId, productId: params.productId, side: params.side, params });
  return { orderId, status: 'submitted', dryRun: false };
}

function _buildOrderBody(params) {
  const { productId, side, quoteSize, baseSize, limitPrice } = params;

  let order_configuration;

  if (limitPrice) {
    // Limit IOC for entries (price control)
    order_configuration = {
      limit_limit_gtc: {
        base_size:   String(baseSize),
        limit_price: String(limitPrice),
        post_only:   false,
      },
    };
  } else if (quoteSize) {
    // Market buy using quote (e.g. $100 worth of BTC)
    order_configuration = {
      market_market_ioc: { quote_size: String(quoteSize.toFixed(2)) },
    };
  } else {
    // Market sell using base (e.g. 0.001 BTC)
    order_configuration = {
      market_market_ioc: { base_size: String(baseSize) },
    };
  }

  return {
    product_id: productId,
    side: side.toUpperCase(),
    order_configuration,
  };
}

// ── Order queries ─────────────────────────────────────────────────────────────

/**
 * List open orders. Optional filter: productId.
 */
export async function listOpenOrders(productId = null) {
  const base = '/api/v3/brokerage/orders/historical/batch';
  const params = new URLSearchParams({ order_status: 'OPEN', limit: '100' });
  if (productId) params.set('product_id', productId);

  const data = await cbFetch('GET', `${base}?${params}`);
  return data.orders || [];
}

/**
 * List fills (recent executions).
 */
export async function listFills(productId = null, limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (productId) params.set('product_id', productId);

  const data = await cbFetch('GET', `/api/v3/brokerage/orders/historical/fills?${params}`);

  const fills = data.fills || [];
  for (const fill of fills) {
    log.fillReceived({ fill });
  }
  return fills;
}

/**
 * Cancel a single open order by ID.
 */
export async function cancelOrder(orderId) {
  if (config.dryRun) {
    log.warn('DRY_RUN_CANCEL_SKIPPED', { orderId });
    return { cancelled: false, dryRun: true };
  }

  const data = await cbFetch('POST', '/api/v3/brokerage/orders/batch_cancel', {
    order_ids: [orderId],
  });

  const result = data.results?.[0];
  if (!result?.success) {
    log.warn('CANCEL_FAILED', { orderId, result });
  } else {
    log.info('ORDER_CANCELLED', { orderId });
  }
  return result;
}

/**
 * Cancel all open orders for a product (or all products if null).
 */
export async function cancelAllOpenOrders(productId = null) {
  const open = await listOpenOrders(productId);
  if (!open.length) return [];

  const ids = open.map(o => o.order_id);

  if (config.dryRun) {
    log.warn('DRY_RUN_CANCEL_ALL_SKIPPED', { ids });
    return [];
  }

  const data = await cbFetch('POST', '/api/v3/brokerage/orders/batch_cancel', {
    order_ids: ids,
  });

  log.info('ORDERS_CANCELLED_ALL', { count: ids.length, results: data.results });
  return data.results || [];
}
