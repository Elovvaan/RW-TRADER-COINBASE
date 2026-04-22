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
export async function evaluateAndExecute(signal, snapshot, priceMap, options = {}) {
  if (signal.action !== 'BUY') return { executed: false, reason: signal.reason };

  const { productId, entryPrice, tpPrice, slPrice } = signal;
  const cooldownAfterStopMs = Number(signal?.indicators?.cooldownAfterStopMs);
  const quoteSizeOverride = Number(options?.quoteSizeOverride);
  const manualOverride = Boolean(options?.executionContext?.manualOverride);
  const allowScaleIn = Boolean(options?.executionContext?.allowScaleIn);
  const isExistingPosition = portfolio.hasPosition(productId);
  const tradeIntent = isExistingPosition ? 'scale-in' : 'fresh-buy';

  // ── 1. Portfolio value for sizing ─────────────────────────────────────────
  let balances, portfolioUSD;
  try {
    balances     = await getBalances();
    portfolioUSD = portfolioValueUSD(balances, priceMap);
  } catch (err) {
    log.error('PORTFOLIO_FETCH_ERROR', { error: err.message });
    return { executed: false, reason: 'PORTFOLIO_FETCH_ERROR' };
  }

  const availableUsd = Number(balances?.USD?.available || 0);
  const maxQuoteByCash = availableUsd * Math.max(0.01, Math.min(0.99, Number(config.smallAccount.maxSingleTradeCashPct || 0.95)));
  const baseQuoteSize = Number.isFinite(quoteSizeOverride) && quoteSizeOverride > 0
    ? quoteSizeOverride
    : calculatePositionSize(portfolioUSD);
  let quoteSize = Math.min(baseQuoteSize, availableUsd, maxQuoteByCash);
  if (!Number.isFinite(quoteSize) || quoteSize <= 0) {
    return { executed: false, reason: 'NO_ALLOCATABLE_CAPITAL' };
  }

  // ── 2. Risk checks ────────────────────────────────────────────────────────
  const risk = runRiskChecks({
    productId,
    snapshot,
    proposedQuote: quoteSize,
    portfolioUSD,
    cooldownAfterStopMs: Number.isFinite(cooldownAfterStopMs) ? cooldownAfterStopMs : undefined,
    allowExistingPosition: allowScaleIn,
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

  const minQuote = Number(product?.quote_min_size || 0);
  if (Number.isFinite(minQuote) && minQuote > 0 && quoteSize < minQuote) {
    if (availableUsd >= minQuote && maxQuoteByCash >= minQuote) {
      quoteSize = minQuote;
    }
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
  if (config.authority === 'ASSIST' && !manualOverride) {
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
    if (isExistingPosition && allowScaleIn) {
      const pos = portfolio.getPosition(productId);
      const addBase = quoteSize / entryPrice;
      const newBaseSize = Number(pos.baseSize) + addBase;
      const weightedEntry = ((Number(pos.baseSize) * Number(pos.entryPrice)) + (addBase * entryPrice)) / newBaseSize;
      const updatedQuoteSpent = Number(pos.quoteSpent || 0) + quoteSize;
      const lastScaleInAt = Date.now();

      portfolio.openPosition({
        ...pos,
        productId,
        side: 'BUY',
        entryPrice: weightedEntry,
        quoteSpent: updatedQuoteSpent,
        baseSize: newBaseSize,
        tpPrice,
        slPrice,
        trailingStopPrice: pos.trailingStopPrice ?? null,
        orderId: result.orderId,
        lastScaleInAt,
      });
      log.info('SCALE_IN_DECISION', {
        productId,
        addQuoteSize: quoteSize,
        newBaseSize,
        weightedEntry,
        reason: signal.reason || 'SIGNAL_CONFIRMED',
      });
    } else {
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
      log.info('SCALE_IN_DECISION', {
        productId,
        addQuoteSize: quoteSize,
        decision: 'FRESH_ENTRY',
      });
    }
  }

  return { executed: true, result, signal, preview, positionOpened: !result.dryRun, tradeIntent };
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
    if (pos.productId === 'BTC-USD') {
      log.info('BTC_EXIT_DECISION', {
        productId: pos.productId,
        reason: exit.reason,
        price: currentPrice,
        actionType: 'EXIT_BTC_TO_USD',
      });
    }

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
