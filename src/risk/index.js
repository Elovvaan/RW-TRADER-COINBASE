// src/risk/index.js – Risk engine
// All checks run BEFORE any order is submitted.
// Returns { approved: bool, reason: string, details: {} }

import config from '../../config/index.js';
import log from '../logging/index.js';
import portfolio from '../portfolio/index.js';

// Runtime kill switch (can be toggled via API)
let _killSwitch = config.killSwitch;

export function setKillSwitch(active) {
  _killSwitch = active;
  if (active) log.killSwitch({ source: 'API', ts: new Date().toISOString() });
  else log.info('KILL_SWITCH_DEACTIVATED', { ts: new Date().toISOString() });
}

export function getKillSwitch() {
  return _killSwitch;
}

/**
 * Run all pre-trade risk checks.
 *
 * @param {object} opts
 * @param {string}  opts.productId
 * @param {object}  opts.snapshot      { price, bid, ask, spreadPct, ts }
 * @param {number}  opts.proposedQuote Dollar amount to commit
 * @param {number}  opts.portfolioUSD  Total portfolio value in USD
 * @returns {{ approved: boolean, reason: string, details: object }}
 */
export function runRiskChecks(opts) {
  const { productId, snapshot, proposedQuote, portfolioUSD, cooldownAfterStopMs } = opts;
  const r = config.risk;

  // 1. Kill switch
  if (_killSwitch) {
    return _block('KILL_SWITCH', { killSwitch: true });
  }

  // 2. Authority check
  if (config.authority === 'OFF') {
    return _block('AUTHORITY_OFF', { authority: config.authority });
  }

  // 3. Cooldown after stop-out
  const cooldownMs = Number.isFinite(Number(cooldownAfterStopMs))
    ? Number(cooldownAfterStopMs)
    : r.cooldownAfterStopMs;
  if (portfolio.isInCooldown(productId, cooldownMs)) {
    const remaining = portfolio.cooldownRemaining(productId, cooldownMs);
    return _block('COOLDOWN_ACTIVE', { productId, remainingMs: remaining, cooldownMs });
  }

  // 4. Stale price
  const priceAge = Date.now() - snapshot.ts;
  if (priceAge > r.stalePriceThresholdMs) {
    return _block('STALE_PRICE', { ageMs: priceAge, thresholdMs: r.stalePriceThresholdMs });
  }

  // 5. Spread check
  if (snapshot.spreadPct > r.maxSpreadPct) {
    return _block('SPREAD_TOO_WIDE', {
      spreadPct:   (snapshot.spreadPct * 100).toFixed(3) + '%',
      maxSpreadPct: (r.maxSpreadPct * 100).toFixed(3) + '%',
    });
  }

  // 6. Max portfolio % per trade
  if (portfolioUSD > 0) {
    const pct = proposedQuote / portfolioUSD;
    if (pct > r.maxPortfolioPctPerTrade) {
      return _block('EXCEEDS_MAX_PORTFOLIO_PCT', {
        proposedPct: (pct * 100).toFixed(2) + '%',
        maxPct:      (r.maxPortfolioPctPerTrade * 100).toFixed(2) + '%',
      });
    }
  }

  // 7. Max dollar loss per trade
  // Potential loss = proposedQuote * stopLossPct
  const potentialLoss = proposedQuote * r.stopLossPct;
  if (potentialLoss > r.maxDollarLossPerTrade) {
    return _block('EXCEEDS_MAX_DOLLAR_LOSS', {
      potentialLossUsd: potentialLoss.toFixed(2),
      maxLossUsd:       r.maxDollarLossPerTrade.toFixed(2),
    });
  }

  // 8. Daily loss cutoff
  const dailyLoss = portfolio.getDailyLoss();
  if (dailyLoss >= r.maxDailyLossUsd) {
    return _block('DAILY_LOSS_CUTOFF', {
      dailyLossUsd: dailyLoss.toFixed(2),
      limitUsd:     r.maxDailyLossUsd.toFixed(2),
    });
  }

  // 9. Already have a position in this product
  if (portfolio.hasPosition(productId)) {
    return _block('POSITION_EXISTS', { productId });
  }

  // 10. Price sanity
  if (!snapshot.price || snapshot.price <= 0) {
    return _block('INVALID_PRICE', { price: snapshot.price });
  }

  return { approved: true, reason: 'ALL_CHECKS_PASSED', details: {} };
}

function _block(reason, details = {}) {
  log.riskBlocked({ reason, details });
  return { approved: false, reason, details };
}

/**
 * Validate minimum order size against exchange rules.
 * @param {object} product  CB product object (from getProduct)
 * @param {number} baseSize
 * @param {number} quoteSize
 */
export function validateMinimumOrder(product, baseSize, quoteSize) {
  const minBase  = parseFloat(product.base_min_size  ?? '0');
  const minQuote = parseFloat(product.quote_min_size ?? '0');

  if (baseSize && baseSize < minBase) {
    return { valid: false, reason: `baseSize ${baseSize} < minimum ${minBase}` };
  }
  if (quoteSize && quoteSize < minQuote) {
    return { valid: false, reason: `quoteSize ${quoteSize} < minimum ${minQuote}` };
  }

  return { valid: true };
}

/**
 * Calculate position size (quote USD) given portfolio value and risk params.
 * Returns the dollar amount to risk, capped by all relevant limits.
 */
export function calculatePositionSize(portfolioUSD) {
  const r = config.risk;
  const byPortfolioPct = portfolioUSD * r.maxPortfolioPctPerTrade;
  const byDollarLoss   = r.maxDollarLossPerTrade / r.stopLossPct; // inverse of loss formula
  return Math.min(byPortfolioPct, byDollarLoss);
}
