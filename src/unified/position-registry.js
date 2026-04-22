class UnifiedPositionRegistry {
  constructor() {
    this.positions = new Map();
  }

  _key(broker, symbol) {
    return `${broker}:${symbol}`;
  }

  syncPositions(items, broker) {
    const nextKeys = new Set();
    for (const item of items) {
      const key = this._key(item.broker || broker, item.symbol);
      nextKeys.add(key);
      this.positions.set(key, {
        broker: item.broker || broker,
        symbol: item.symbol,
        market: item.market,
        size: item.size,
        entry: item.entry,
        currentPrice: item.currentPrice,
        unrealizedPnL: item.unrealizedPnL,
        tp: item.tp ?? null,
        sl: item.sl ?? null,
        openedAt: item.openedAt ?? null,
      });
    }

    for (const [key, value] of this.positions.entries()) {
      if (value.broker === broker && !nextKeys.has(key)) {
        this.positions.delete(key);
      }
    }
  }

  list({ broker = null, market = null } = {}) {
    return Array.from(this.positions.values()).filter((position) => {
      if (broker && position.broker !== broker) return false;
      if (market && position.market !== market) return false;
      return true;
    });
  }
}

const unifiedPositionRegistry = new UnifiedPositionRegistry();
export default unifiedPositionRegistry;
