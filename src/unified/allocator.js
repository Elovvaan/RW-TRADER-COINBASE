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

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export async function allocateSignal({ signal, positions, balancesByBroker, dailyLossUsd, adapter, proposedNotionalUsd, executionContext = {} }) {
  const limits = config.allocator;
  const riskPct = Number(signal.riskPct);

  if (dailyLossUsd >= limits.maxTotalDailyLossUsd) {
    const decision = { approved: false, reason: 'MAX_TOTAL_DAILY_LOSS_REACHED' };
    log.info('CAPITAL_ALLOCATION_DECISION', { market: signal.market, symbol: signal.symbol, ...decision });
    return decision;
  }

  if (!Number.isFinite(riskPct) || riskPct <= 0 || riskPct > limits.perPositionMaxRisk) {
    const decision = { approved: false, reason: 'PER_POSITION_RISK_EXCEEDED' };
    log.info('CAPITAL_ALLOCATION_DECISION', { market: signal.market, symbol: signal.symbol, ...decision, riskPct });
    return decision;
  }

  const cryptoExposure = positions
    .filter((position) => position.market === 'crypto')
    .reduce((sum, position) => sum + toExposureUsd(position), 0);
  const equityExposure = positions
    .filter((position) => position.market === 'equities')
    .reduce((sum, position) => sum + toExposureUsd(position), 0);

  const coinbaseUsd = Number(balancesByBroker.coinbase?.USD?.available || 0);
  const btcHeld = Number(balancesByBroker.coinbase?.BTC?.total || 0);
  const ethHeld = Number(balancesByBroker.coinbase?.ETH?.total || 0);
  const btcPrice = Number(executionContext.priceMap?.['BTC-USD'] || 0);
  const ethPrice = Number(executionContext.priceMap?.['ETH-USD'] || 0);
  const btcUsd = Number.isFinite(btcPrice) && btcPrice > 0 ? btcHeld * btcPrice : 0;
  const ethUsd = Number.isFinite(ethPrice) && ethPrice > 0 ? ethHeld * ethPrice : 0;
  const rotatableCryptoUsd = btcUsd + ethUsd;
  const symbolBase = String(signal.symbol || '').split('-')[0];
  const symbolHeldUnits = Number(balancesByBroker.coinbase?.[symbolBase]?.available || 0);
  const symbolUsdPrice = Number(executionContext.priceMap?.[`${symbolBase}-USD`] || executionContext.priceMap?.[signal.symbol] || 0);
  const symbolHeldUsd = Number.isFinite(symbolUsdPrice) && symbolUsdPrice > 0 ? symbolHeldUnits * symbolUsdPrice : 0;
  const stockUsd = Number(balancesByBroker.stocks?.USD?.available || 0);
  const marketCash = signal.market === 'crypto' ? coinbaseUsd : stockUsd;
  const marketExposureUsd = signal.market === 'crypto' ? cryptoExposure : equityExposure;
  const marketPortfolioUsd = marketCash + marketExposureUsd;
  const openStrategyPositions = positions.filter((position) => position.market === signal.market);
  if (signal.market === 'crypto') {
    log.info('CAPITAL_STATE_READ', {
      market: signal.market,
      symbol: signal.symbol,
      usdCash: coinbaseUsd,
      btcHeld,
      ethHeld,
      btcUsd,
      ethUsd,
      symbolBase,
      symbolHeldUnits,
      symbolHeldUsd,
      rotatableCryptoUsd,
      openStrategyPositions: openStrategyPositions.map((position) => ({
        symbol: position.symbol,
        size: position.size,
        exposureUsd: toExposureUsd(position),
      })),
      marketExposureUsd,
      marketPortfolioUsd,
    });
  }
  if (marketPortfolioUsd <= 0) {
    const decision = { approved: false, reason: 'NO_ALLOCATABLE_CAPITAL' };
    log.info('CAPITAL_ALLOCATION_DECISION', { market: signal.market, symbol: signal.symbol, ...decision, marketCash, marketExposureUsd });
    return decision;
  }

  const marketLimitPct = signal.market === 'crypto' ? limits.maxCryptoAllocation : limits.maxEquitiesAllocation;
  const marketRemainingUsd = (marketPortfolioUsd * marketLimitPct) - marketExposureUsd;
  if (marketRemainingUsd <= 0) {
    const decision = { approved: false, reason: 'MARKET_ALLOCATION_LIMIT_REACHED' };
    log.info('CAPITAL_ALLOCATION_DECISION', { market: signal.market, symbol: signal.symbol, ...decision, marketPortfolioUsd, marketExposureUsd, marketLimitPct });
    return decision;
  }

  const availableCash = marketCash;
  const maxOpenPositions = Number(executionContext.maxOpenPositions || 3);
  const regime = String(executionContext.regime || executionContext.strategyMode || config.strategyMode || 'SWING').toUpperCase();
  const baseTargetPct = clamp01(limits.targetNotionalPct, 0.2);
  const regimeMultiplier = regime === 'DAY_TRADE' ? 1 : 0.8;
  const positionPressure = Math.max(0.5, 1 - (openStrategyPositions.length / Math.max(1, maxOpenPositions + 1)));
  const confidence = Number(signal.confidence || 0);
  const confidenceMultiplier = Math.min(1, Math.max(0.25, confidence));
  const rebalanceTargetPct = clamp01(baseTargetPct * regimeMultiplier * positionPressure * confidenceMultiplier, baseTargetPct);
  const rebalanceBudgetUsd = marketPortfolioUsd * rebalanceTargetPct;
  const targetNotional = availableCash * limits.targetNotionalPct;
  // Confidence scales target sizing while preserving a 25% floor so approved
  // low-confidence but valid entries still receive a non-trivial allocation.
  // Upper bound is clamped to 1.0 to prevent over-allocation from malformed
  // strategies that emit confidence values above the normalized [0,1] range.
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
    requestedNotional = Math.max(requestedNotional, availableCash * confidenceScaledPct);
    if (forceMinNotional) {
      requestedNotional = Math.max(requestedNotional, availableCash * minPct);
    }
  }

  if (signal.market === 'crypto' && forceTrade && !forceMinNotional) {
    requestedNotional = Math.max(requestedNotional, availableCash * limits.targetNotionalPct);
  }

  if (signal.market === 'crypto' && availableCash <= 0) {
    const decision = { approved: false, reason: 'NO_ALLOCATABLE_CAPITAL' };
    log.info('CAPITAL_ALLOCATION_DECISION', {
      market: signal.market,
      symbol: signal.symbol,
      ...decision,
      availableCash,
      note: 'NO_USD_FOR_ENTRY_PREFERS_EXISTING_CRYPTO_MANAGEMENT',
    });
    if (signal.market === 'crypto' && rotatableCryptoUsd > 0) {
      log.info('ROTATION_DECISION', {
        market: signal.market,
        symbol: signal.symbol,
        reason: 'NO_USD_AVAILABLE_USE_BTC_ETH_ROTATION',
        rotatableCryptoUsd,
      });
    }
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
    rebalanceBudgetUsd,
    marketRemainingUsd,
    availableCash,
    availableCash * maxSingleTradeCashPct,
    riskBoundNotional,
  );

  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    const decision = { approved: false, reason: 'NO_VALID_ORDER_NOTIONAL' };
    log.info('CAPITAL_ALLOCATION_DECISION', {
      market: signal.market,
      symbol: signal.symbol,
      ...decision,
      requestedNotional,
      marketRemainingUsd,
      availableCash,
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
    log.info('CAPITAL_ALLOCATION_DECISION', { market: signal.market, symbol: signal.symbol, ...decision, notionalUsd });
    return decision;
  }

  const decision = { approved: true, reason: 'ALLOCATOR_APPROVED', notionalUsd };
  log.info('ALLOCATION_DECISION', {
    market: signal.market,
    symbol: signal.symbol,
    ...decision,
    availableCash,
    marketExposureUsd,
    marketPortfolioUsd,
    confidence,
    requestedNotional,
    rebalanceTargetPct,
    rebalanceBudgetUsd,
    smallAccountMode,
    forceTrade,
    forceMinNotional,
  });
  if (signal.market === 'crypto') {
    log.info('REBALANCE_DECISION', {
      symbol: signal.symbol,
      usdCash: coinbaseUsd,
      btcUsd,
      ethUsd,
      currentHoldSymbolUsd: symbolHeldUsd,
      desiredNotionalUsd: notionalUsd,
      confidence,
      regime,
      maxOpenPositions,
    });
  }
  return decision;
}
