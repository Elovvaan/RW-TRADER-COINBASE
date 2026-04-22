class UnifiedPositionRegistry {
  constructor() {
    this.cryptoPositions = new Map();
    this.stockPositions = new Map();
  }

  _key(broker, symbol) {
    return `${broker}:${symbol}`;
  }

  _toRecord(item, defaultBroker, executionType) {
    return {
      broker: item.broker || defaultBroker,
      symbol: item.symbol,
      market: item.market,
      size: item.size,
      entry: item.entry,
      currentPrice: item.currentPrice,
      unrealizedPnL: item.unrealizedPnL,
      tp: item.tp ?? null,
      sl: item.sl ?? null,
      openedAt: item.openedAt ?? null,
      positionAgeMs: item.positionAgeMs ?? null,
      lastMarketUpdateTs: item.lastMarketUpdateTs ?? null,
      executionType: item.executionType || executionType,
    };
  }

  _syncMap(targetMap, items, defaultBroker, executionType) {
    const nextKeys = new Set();
    for (const item of items) {
      const key = this._key(item.broker || defaultBroker, item.symbol);
      nextKeys.add(key);
      targetMap.set(key, this._toRecord(item, defaultBroker, executionType));
    }

    for (const key of targetMap.keys()) {
      if (!key.startsWith(`${defaultBroker}:`)) continue;
      if (!nextKeys.has(key)) {
        targetMap.delete(key);
      }
    }
  }

  syncCryptoPositions(items, broker = 'coinbase') {
    this._syncMap(this.cryptoPositions, items, broker, 'REAL');
  }

  syncStockPositions(items, broker = 'paper-stock') {
    this._syncMap(this.stockPositions, items, broker, 'PAPER');
  }

  listCrypto() {
    return Array.from(this.cryptoPositions.values());
  }

  listStocks() {
    return Array.from(this.stockPositions.values());
  }

  listAll() {
    return [...this.listCrypto(), ...this.listStocks()];
  }
}

const unifiedPositionRegistry = new UnifiedPositionRegistry();
export default unifiedPositionRegistry;
