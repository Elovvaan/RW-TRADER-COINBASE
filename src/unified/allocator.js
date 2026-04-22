import config from '../../config/index.js';
import log from '../logging/index.js';

const MIN_SINGLE_TRADE_PCT = 0.01;
const MAX_SINGLE_TRADE_PCT = 0.99;
const DEFAULT_MAX_SINGLE_TRADE_PCT = 0.95;
const MIN_SMALL_ACCOUNT_POSITION_PCT = 0.01;
const MAX_SMALL_ACCOUNT_POSITION_PCT = 0.95;

function toExposureUsd(position) {
  const price = Number(position.currentPrice);
  const size = Number(position.size);
  if (!Number.isFinite(price) || !Number.isFinite(size)) return 0;
  return Math.abs(price * size);
}

function toHoldingUsd(currency, balance, priceMap) {
  const total = Number(balance?.total || 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (currency === 'USD') return total;
  const px = Number(priceMap?.[`${currency}-USD`]);
  if (!Number.isFinite(px) || px <= 0) return 0;
  return total * px;
}

function logAllocationDecision(payload) {
  log.info('ALLOCATION_DECISION', payload);
}

export async function allocateSignal({ signal, positions, balancesByBroker, dailyLossUsd, adapter, proposedNotionalUsd, priceMap = {}, executionContext = {} }) {
  const limits = config.allocator;
  const riskPct = Number(signal.riskPct);
  const coinbaseBalances = balancesByBroker.coinbase || {};
  const coinbaseUsd = Number(coinbaseBalances?.USD?.available || 0);
  const stockUsd = Number(balancesByBroker.stocks?.USD?.available || 0);
  const btcHoldingUsd = toHoldingUsd('BTC', coinbaseBalances.BTC, priceMap);
  const ethHoldingUsd = toHoldingUsd('ETH', coinbaseBalances.ETH, priceMap);
  const coinbasePortfolioUsd = Object.entries(coinbaseBalances).reduce((sum, [currency, bal]) => {
    return sum + toHoldingUsd(currency, bal, priceMap);
  }, 0);
  const targetAsset = String(signal.symbol || '').split('-')[0] || null;
  const rotationCandidates = ['BTC', 'ETH']
    .filter((currency) => currency !== targetAsset)
    .map((currency) => ({
      currency,
      productId: `${currency}-USD`,
      available: Number(coinbaseBalances?.[currency]?.available || 0),
      price: Number(priceMap?.[`${currency}-USD`] || 0),
    }))
    .map((candidate) => ({
      ...candidate,
      usdValue: candidate.available * candidate.price,
    }))
    .filter((candidate) => candidate.available > 0 && candidate.usdValue > 0 && candidate.price > 0);
  const rotatableUsd = rotationCandidates.reduce((sum, candidate) => sum + candidate.usdValue, 0);

  log.info('CAPITAL_STATE_READ', {
    market: signal.market,
    symbol: signal.symbol,
    usdAvailable: coinbaseUsd,
    btcHoldingUsd,
    ethHoldingUsd,
    rotatableUsd,
    coinbasePortfolioUsd,
  });

  if (dailyLossUsd >= limits.maxTotalDailyLossUsd) {
    const decision = { approved: false, reason: 'MAX_TOTAL_DAILY_LOSS_REACHED' };
    logAllocationDecision({ market: signal.market, symbol: signal.symbol, ...decision });
    return decision;
  }

  if (!Number.isFinite(riskPct) || riskPct <= 0 || riskPct > limits.perPositionMaxRisk) {
    const decision = { approved: false, reason: 'PER_POSITION_RISK_EXCEEDED' };
    logAllocationDecision({ market: signal.market, symbol: signal.symbol, ...decision, riskPct });
    return decision;
  }

  const cryptoExposure = positions
    .filter((position) => position.market === 'crypto')
    .reduce((sum, position) => sum + toExposureUsd(position), 0);
  const equityExposure = positions
    .filter((position) => position.market === 'equities')
    .reduce((sum, position) => sum + toExposureUsd(position), 0);

  const marketCash = signal.market === 'crypto' ? coinbaseUsd : stockUsd;
  const availableCapitalUsd = signal.market === 'crypto'
    ? marketCash + rotatableUsd
    : marketCash;
  const marketExposureUsd = signal.market === 'crypto' ? cryptoExposure : equityExposure;
  const marketPortfolioUsd = signal.market === 'crypto'
    ? Math.max(coinbasePortfolioUsd, marketCash + marketExposureUsd)
    : (marketCash + marketExposureUsd);
  if (marketPortfolioUsd <= 0) {
    const decision = { approved: false, reason: 'NO_ALLOCATABLE_CAPITAL' };
    logAllocationDecision({ market: signal.market, symbol: signal.symbol, ...decision, marketCash, marketExposureUsd });
    return decision;
  }

  const marketLimitPct = signal.market === 'crypto' ? limits.maxCryptoAllocation : limits.maxEquitiesAllocation;
  const marketRemainingUsd = (marketPortfolioUsd * marketLimitPct) - marketExposureUsd;
  if (marketRemainingUsd <= 0) {
    const decision = { approved: false, reason: 'MARKET_ALLOCATION_LIMIT_REACHED' };
    logAllocationDecision({ market: signal.market, symbol: signal.symbol, ...decision, marketPortfolioUsd, marketExposureUsd, marketLimitPct });
    return decision;
  }

  const targetNotional = availableCapitalUsd * limits.targetNotionalPct;
  const confidence = Number(signal.confidence || 0);
  // Confidence scales target sizing while preserving a 25% floor so approved
  // low-confidence but valid entries still receive a non-trivial allocation.
  // Upper bound is clamped to 1.0 to prevent over-allocation from malformed
  // strategies that emit confidence values above the normalized [0,1] range.
  const confidenceMultiplier = Math.min(1, Math.max(0.25, confidence));
  const confidenceScaledTarget = targetNotional * confidenceMultiplier;
  const riskBoundNotional = marketPortfolioUsd * (limits.perPositionMaxRisk / riskPct);
  const hasSmallAccountFlag = typeof executionContext.smallAccountMode === 'boolean';
  const smallAccountMode = signal.market === 'crypto'
    && (hasSmallAccountFlag ? executionContext.smallAccountMode : marketPortfolioUsd <= config.smallAccount.equityThresholdUsd);
  const forceTrade = Boolean(executionContext.forceTrade);
  const forceMinNotional = Boolean(executionContext.forceMinNotional);
  const maxSingleTradeCashPct = Math.max(
    MIN_SINGLE_TRADE_PCT,
    Math.min(MAX_SINGLE_TRADE_PCT, Number(config.smallAccount.maxSingleTradeCashPct || DEFAULT_MAX_SINGLE_TRADE_PCT)),
  );

  let requestedNotional = Number.isFinite(proposedNotionalUsd) && proposedNotionalUsd > 0
    ? proposedNotionalUsd
    : confidenceScaledTarget;
  if (signal.market === 'crypto' && smallAccountMode) {
    const minPct = Math.max(
      MIN_SMALL_ACCOUNT_POSITION_PCT,
      Math.min(MAX_SMALL_ACCOUNT_POSITION_PCT, Number(config.smallAccount.minPositionPct || 0.2)),
    );
    const maxPct = Math.max(minPct, Math.min(MAX_SINGLE_TRADE_PCT, Number(config.smallAccount.maxPositionPct || 0.5)));
    const confidenceScaledPct = minPct + ((maxPct - minPct) * Math.min(1, Math.max(0, confidence)));
    requestedNotional = Math.max(requestedNotional, availableCapitalUsd * confidenceScaledPct);
    if (forceMinNotional) {
      requestedNotional = Math.max(requestedNotional, availableCapitalUsd * minPct);
    }
  }

  if (signal.market === 'crypto' && forceTrade && !forceMinNotional) {
    requestedNotional = Math.max(requestedNotional, availableCapitalUsd * limits.targetNotionalPct);
  }

  if (signal.market === 'crypto' && availableCapitalUsd <= 0) {
    const decision = { approved: false, reason: 'NO_ALLOCATABLE_CAPITAL' };
    logAllocationDecision({
      market: signal.market,
      symbol: signal.symbol,
      ...decision,
      availableCapitalUsd,
      note: 'NO_USD_FOR_ENTRY_PREFERS_EXISTING_CRYPTO_MANAGEMENT',
    });
    return decision;
  }

  if (signal.market === 'crypto' && typeof adapter.getMinOrderNotional === 'function') {
    const minOrderNotional = await adapter.getMinOrderNotional(signal.symbol).catch(() => 0);
    if (Number.isFinite(minOrderNotional) && minOrderNotional > 0) {
      requestedNotional = Math.max(requestedNotional, minOrderNotional);
    }
  }

  const notionalUsd = Math.min(
    Math.max(0, requestedNotional),
    marketRemainingUsd,
    availableCapitalUsd,
    availableCapitalUsd * maxSingleTradeCashPct,
    riskBoundNotional,
  );

  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    const decision = { approved: false, reason: 'NO_VALID_ORDER_NOTIONAL' };
    logAllocationDecision({
      market: signal.market,
      symbol: signal.symbol,
      ...decision,
      requestedNotional,
      marketRemainingUsd,
      availableCapitalUsd,
      riskBoundNotional,
    });
    return decision;
  }

  const minCheck = await adapter.validateMinOrder({
    symbol: signal.symbol,
    notionalUsd,
  });
  if (!minCheck.valid) {
    const decision = { approved: false, reason: 'BROKER_MIN_ORDER_REJECTED', details: minCheck.reason };
    logAllocationDecision({ market: signal.market, symbol: signal.symbol, ...decision, notionalUsd });
    return decision;
  }

  const requiredRotationUsd = signal.market === 'crypto'
    ? Math.max(0, notionalUsd - marketCash)
    : 0;
  const rotationPlan = requiredRotationUsd > 0
    ? {
      requiredUsd: requiredRotationUsd,
      sources: rotationCandidates.map((candidate) => ({
        currency: candidate.currency,
        productId: candidate.productId,
        usdToRotate: requiredRotationUsd * (candidate.usdValue / Math.max(rotatableUsd, 1)),
      })),
    }
    : null;

  log.info('ROTATION_DECISION', {
    market: signal.market,
    symbol: signal.symbol,
    requiredUsd: rotationPlan ? rotationPlan.requiredUsd : 0,
    sources: rotationPlan ? rotationPlan.sources : [],
  });
  log.info('REBALANCE_DECISION', {
    market: signal.market,
    symbol: signal.symbol,
    targetAsset,
    action: requiredRotationUsd > 0 ? 'ROTATE_INTO_TARGET' : 'MAINTAIN',
    usdAvailable: marketCash,
    rotatableUsd,
  });

  const decision = { approved: true, reason: 'ALLOCATOR_APPROVED', notionalUsd, rotationPlan };
  logAllocationDecision({
    market: signal.market,
    symbol: signal.symbol,
    ...decision,
    availableCapitalUsd,
    usdAvailable: marketCash,
    rotatableUsd,
    marketExposureUsd,
    marketPortfolioUsd,
    confidence,
    requestedNotional,
    smallAccountMode,
    forceTrade,
    forceMinNotional,
  });
  return decision;
}
