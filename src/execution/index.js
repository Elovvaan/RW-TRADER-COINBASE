// src/execution/index.js – Execution engine
// Orchestrates signal → risk check → size → preview → submit → position open.

import config from '../../config/index.js';
import log from '../logging/index.js';
import { getBalances, portfolioValueUSD } from '../accounts/index.js';
import { getProduct } from '../products/index.js';
import { previewOrder, createOrder } from '../orders/index.js';
import { runRiskChecks, validateMinimumOrder, calculatePositionSize } from '../risk/index.js';
import { generateSignal, checkExits } from '../strategy/index.js';
import portfolio from '../portfolio/index.js';

// ── Entry execution ───────────────────────────────────────────────────────────

/**
 * Evaluate a signal and execute if all checks pass.
 * @param {object} signal  From generateSignal()
 * @param {object} snapshot  Current price snapshot
 * @param {object} priceMap  { 'BTC-USD': price, ... } for portfolio valuation
 */
export async function evaluateAndExecute(signal, snapshot, priceMap) {
  if (signal.action !== 'BUY') return { executed: false, reason: signal.reason };

  const { productId, entryPrice, tpPrice, slPrice } = signal;
  const cooldownAfterStopMs = Number(signal?.indicators?.cooldownAfterStopMs);

  // ── 1. Portfolio value for sizing ─────────────────────────────────────────
  let balances, portfolioUSD;
  try {
    balances     = await getBalances();
    portfolioUSD = portfolioValueUSD(balances, priceMap);
  } catch (err) {
    log.error('PORTFOLIO_FETCH_ERROR', { error: err.message });
    return { executed: false, reason: 'PORTFOLIO_FETCH_ERROR' };
  }

  const quoteSize = calculatePositionSize(portfolioUSD);

  // ── 2. Risk checks ────────────────────────────────────────────────────────
  const risk = runRiskChecks({
    productId,
    snapshot,
    proposedQuote: quoteSize,
    portfolioUSD,
    cooldownAfterStopMs: Number.isFinite(cooldownAfterStopMs) ? cooldownAfterStopMs : undefined,
  });
  if (!risk.approved) {
    return { executed: false, reason: risk.reason, details: risk.details };
  }

  // ── 3. Product minimum validation ─────────────────────────────────────────
  let product;
  try {
    product = await getProduct(productId);
  } catch (err) {
    log.error('PRODUCT_FETCH_ERROR', { productId, error: err.message });
    return { executed: false, reason: 'PRODUCT_FETCH_ERROR' };
  }

  const minCheck = validateMinimumOrder(product, null, quoteSize);
  if (!minCheck.valid) {
    log.orderRejected({ productId, reason: `BELOW_MINIMUM: ${minCheck.reason}` });
    return { executed: false, reason: 'BELOW_MINIMUM', details: minCheck };
  }

  // ── 4. Preview order ──────────────────────────────────────────────────────
  let preview;
  try {
    preview = await previewOrder({ productId, side: 'BUY', quoteSize });
  } catch (err) {
    log.warn('PREVIEW_FAILED', { productId, error: err.message });
    return { executed: false, reason: 'PREVIEW_FAILED', error: err.message };
  }

  // ── 5. ASSIST mode: log signal, don't auto-submit ────────────────────────
  if (config.authority === 'ASSIST') {
    log.info('ASSIST_MODE_SIGNAL', {
      productId, signal, preview,
      note: 'Set AUTHORITY=AUTO and DRY_RUN=false to enable autonomous execution.',
    });
    return { executed: false, reason: 'ASSIST_MODE', signal, preview };
  }

  // ── 6. Submit order (AUTO mode, DRY_RUN=false) ───────────────────────────
  let result;
  try {
    result = await createOrder({ productId, side: 'BUY', quoteSize });
  } catch (err) {
    log.orderRejected({ productId, error: err.message });
    return { executed: false, reason: 'ORDER_SUBMIT_FAILED', error: err.message };
  }

  // ── 7. Record position ────────────────────────────────────────────────────
  if (!result.dryRun) {
    portfolio.openPosition({
      productId,
      side:      'BUY',
      entryPrice,
      quoteSpent: quoteSize,
      baseSize:   quoteSize / entryPrice,
      tpPrice,
      slPrice,
      trailingStopPrice: null,
      orderId:   result.orderId,
    });
  }

  return { executed: true, result, signal, preview, positionOpened: !result.dryRun };
}

// ── Exit execution ────────────────────────────────────────────────────────────

/**
 * Check and execute exits for all open positions.
 * @param {object} priceMap  { productId → price }
 */
export async function checkAndExecuteExits(priceMap) {
  const positions = portfolio.getAllPositions();
  const results   = [];

  for (const pos of positions) {
    const currentPrice = priceMap[pos.productId];
    if (!currentPrice) continue;

    // Update trailing stop
    portfolio.updateTrailingStop(pos.productId, currentPrice);

    // Check exit conditions
    const { generateSignal: _, checkExits } = await import('../strategy/index.js');
    const exit = (await import('../strategy/index.js')).checkExits(pos, currentPrice);
    if (!exit?.shouldExit) continue;

    log.info('EXIT_TRIGGERED', { productId: pos.productId, reason: exit.reason, price: currentPrice });

    // Submit market sell
    let sellResult;
    try {
      sellResult = await createOrder({
        productId: pos.productId,
        side:      'SELL',
        baseSize:  pos.baseSize.toFixed(8),
      });
    } catch (err) {
      log.error('EXIT_ORDER_FAILED', { productId: pos.productId, error: err.message });
      continue;
    }

    const closed = portfolio.closePosition(pos.productId, currentPrice, exit.reason);
    results.push({ ...closed, sellResult });
  }

  return results;
}
