import config from '../../config/index.js';
import log from '../logging/index.js';

function toExposureUsd(position) {
  const price = Number(position.currentPrice);
  const size = Number(position.size);
  if (!Number.isFinite(price) || !Number.isFinite(size)) return 0;
  return Math.abs(price * size);
}

export async function allocateSignal({ signal, positions, balancesByBroker, dailyLossUsd, adapter, proposedNotionalUsd }) {
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
  const stockUsd = Number(balancesByBroker.stocks?.USD?.available || 0);
  const marketCash = signal.market === 'crypto' ? coinbaseUsd : stockUsd;
  const marketExposureUsd = signal.market === 'crypto' ? cryptoExposure : equityExposure;
  const marketPortfolioUsd = marketCash + marketExposureUsd;
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
  const targetNotional = availableCash * limits.targetNotionalPct;
  const confidence = Number(signal.confidence || 0);
  const confidenceMultiplier = Math.min(1, Math.max(0.25, confidence));
  const confidenceScaledTarget = targetNotional * confidenceMultiplier;
  const riskBoundNotional = marketPortfolioUsd * (limits.perPositionMaxRisk / riskPct);
  const requestedNotional = Number.isFinite(proposedNotionalUsd) && proposedNotionalUsd > 0
    ? proposedNotionalUsd
    : confidenceScaledTarget;
  const notionalUsd = Math.min(
    Math.max(0, requestedNotional),
    marketRemainingUsd,
    availableCash,
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
  log.info('CAPITAL_ALLOCATION_DECISION', {
    market: signal.market,
    symbol: signal.symbol,
    ...decision,
    availableCash,
    marketExposureUsd,
    marketPortfolioUsd,
    confidence,
    requestedNotional,
  });
  return decision;
}
