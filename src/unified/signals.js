import config from '../../config/index.js';

export function normalizeCryptoSignal(signal) {
  const side = signal.action === 'BUY' ? 'BUY' : signal.action === 'SELL' ? 'SELL' : 'WAIT';
  return {
    market: 'crypto',
    broker: 'coinbase',
    symbol: signal.productId,
    side,
    confidence: signal.confidence ?? 0,
    entry: signal.entryPrice ?? null,
    tp: signal.tpPrice ?? null,
    sl: signal.slPrice ?? null,
    riskPct: config.risk.stopLossPct,
    reason: signal.reason || null,
    ts: signal.ts || Date.now(),
    indicators: signal.indicators || {},
    productId: signal.productId,
    action: signal.action,
    entryPrice: signal.entryPrice,
    tpPrice: signal.tpPrice,
    slPrice: signal.slPrice,
  };
}

export function normalizeEquitySignal(signal) {
  return {
    market: 'equities',
    broker: signal.broker,
    symbol: signal.symbol,
    side: signal.side,
    confidence: signal.confidence ?? 0,
    entry: signal.entry ?? null,
    tp: signal.tp ?? null,
    sl: signal.sl ?? null,
    riskPct: signal.riskPct ?? config.allocator.perPositionMaxRisk,
    reason: signal.reason || null,
    ts: signal.ts || Date.now(),
  };
}
