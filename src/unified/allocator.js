import config from '../../config/index.js';

function toExposureUsd(position) {
  const price = Number(position.currentPrice);
  const size = Number(position.size);
  if (!Number.isFinite(price) || !Number.isFinite(size)) return 0;
  return Math.abs(price * size);
}

export async function allocateSignal({ signal, positions, balancesByBroker, dailyLossUsd, adapter, proposedNotionalUsd }) {
  const limits = config.allocator;

  if (dailyLossUsd >= limits.maxTotalDailyLossUsd) {
    return { approved: false, reason: 'MAX_TOTAL_DAILY_LOSS_REACHED' };
  }

  if (!Number.isFinite(signal.riskPct) || signal.riskPct <= 0 || signal.riskPct > limits.perPositionMaxRisk) {
    return { approved: false, reason: 'PER_POSITION_RISK_EXCEEDED' };
  }

  const cryptoExposure = positions
    .filter((position) => position.market === 'crypto')
    .reduce((sum, position) => sum + toExposureUsd(position), 0);
  const equityExposure = positions
    .filter((position) => position.market === 'equities')
    .reduce((sum, position) => sum + toExposureUsd(position), 0);

  const coinbaseUsd = Number(balancesByBroker.coinbase?.USD?.available || 0);
  const stockUsd = Number(balancesByBroker.stocks?.USD?.available || 0);
  const totalPortfolioUsd = coinbaseUsd + stockUsd + cryptoExposure + equityExposure;
  if (totalPortfolioUsd <= 0) return { approved: false, reason: 'NO_ALLOCATABLE_CAPITAL' };

  const marketExposure = signal.market === 'crypto' ? cryptoExposure : equityExposure;
  const marketLimitPct = signal.market === 'crypto' ? limits.maxCryptoAllocation : limits.maxEquitiesAllocation;
  const marketRemainingUsd = (totalPortfolioUsd * marketLimitPct) - marketExposure;
  if (marketRemainingUsd <= 0) return { approved: false, reason: 'MARKET_ALLOCATION_LIMIT_REACHED' };

  const availableCash = signal.market === 'crypto' ? coinbaseUsd : stockUsd;
  const targetNotional = availableCash * limits.targetNotionalPct;
  const riskBoundNotional = totalPortfolioUsd * (limits.perPositionMaxRisk / signal.riskPct);
  const requestedNotional = Number.isFinite(proposedNotionalUsd) && proposedNotionalUsd > 0
    ? proposedNotionalUsd
    : targetNotional;
  const notionalUsd = Math.min(
    Math.max(0, requestedNotional),
    marketRemainingUsd,
    availableCash,
    riskBoundNotional,
  );

  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    return { approved: false, reason: 'NO_VALID_ORDER_NOTIONAL' };
  }

  const minCheck = await adapter.validateMinOrder({
    symbol: signal.symbol,
    notionalUsd,
  });
  if (!minCheck.valid) {
    return { approved: false, reason: 'BROKER_MIN_ORDER_REJECTED', details: minCheck.reason };
  }

  return { approved: true, reason: 'ALLOCATOR_APPROVED', notionalUsd };
}
