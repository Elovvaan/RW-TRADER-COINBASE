import config from '../../config/index.js';

const WOBBLE_PCT = 0.006;
const DRIFT_PCT = 0.003;
const WOBBLE_PERIOD_MIN = 3;
const DRIFT_PERIOD_MIN = 11;

function toCents(v) {
  return Math.round(Number(v) * 100) / 100;
}

function seededOffset(symbol) {
  return symbol.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 31;
}

export class StockAdapter {
  constructor() {
    this.broker = config.stockBroker.name;
    this.market = 'equities';
    this.cashUsd = config.stockBroker.startingCashUsd;
    this.positions = new Map();
    this.fills = [];
    this.dailyLossUsd = 0;
    this.dailyLossResetAt = this._todayMidnight();
    this.lastQuotes = new Map();
  }

  _todayMidnight() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }

  _rollDailyLossIfNeeded() {
    const nowMidnight = this._todayMidnight();
    if (nowMidnight > this.dailyLossResetAt) {
      this.dailyLossUsd = 0;
      this.dailyLossResetAt = nowMidnight;
    }
  }

  getQuote(symbol) {
    const anchor = config.stockBroker.priceAnchors[symbol] || 100;
    const t = Date.now() / 60000;
    // Paper-trading quote model: ~0.9% bounded oscillation around anchor, with
    // short wobble + slow drift to keep prices moving but deterministic/repeatable.
    const wobble = Math.sin((t + seededOffset(symbol)) / WOBBLE_PERIOD_MIN) * WOBBLE_PCT;
    const drift = Math.cos((t + seededOffset(symbol)) / DRIFT_PERIOD_MIN) * DRIFT_PCT;
    const price = anchor * (1 + wobble + drift);
    const quote = {
      symbol,
      price: Number(price.toFixed(4)),
      ts: Date.now(),
    };
    this.lastQuotes.set(symbol, quote);
    return quote;
  }

  generateSignal(symbol) {
    const current = this.getQuote(symbol);
    const prev = this.lastQuotes.get(`${symbol}:prev`) || null;
    this.lastQuotes.set(`${symbol}:prev`, current);

    const entry = current.price;
    const tp = entry * 1.02;
    const sl = entry * (1 - config.allocator.perPositionMaxRisk);

    if (!prev) {
      return {
        market: this.market,
        broker: this.broker,
        symbol,
        side: 'WAIT',
        confidence: 0,
        entry,
        tp,
        sl,
        riskPct: config.allocator.perPositionMaxRisk,
        reason: 'WAITING_FOR_BASELINE',
        ts: Date.now(),
      };
    }

    const momentum = (current.price - prev.price) / prev.price;
    const side = momentum > 0.0012 ? 'BUY' : 'WAIT';
    const confidence = side === 'BUY'
      ? Math.min(0.8, Number((0.4 + Math.abs(momentum) * 200).toFixed(2)))
      : 0.05;

    return {
      market: this.market,
      broker: this.broker,
      symbol,
      side,
      confidence,
      entry,
      tp,
      sl,
      riskPct: config.allocator.perPositionMaxRisk,
      reason: side === 'BUY' ? 'SHORT_TERM_MOMENTUM' : 'NO_MOMENTUM_SETUP',
      ts: Date.now(),
    };
  }

  async getBalances() {
    let equityValue = 0;
    for (const position of this.positions.values()) {
      const quote = this.getQuote(position.symbol);
      equityValue += quote.price * position.size;
    }

    return {
      USD: {
        available: toCents(this.cashUsd),
        hold: 0,
        total: toCents(this.cashUsd),
      },
      EQUITY_VALUE: {
        available: toCents(equityValue),
        hold: 0,
        total: toCents(equityValue),
      },
    };
  }

  getOpenPositions() {
    const open = [];
    for (const position of this.positions.values()) {
      const quote = this.getQuote(position.symbol);
      const currentPrice = quote.price;
      const unrealizedPnL = (currentPrice - position.entry) * position.size;
      open.push({
        broker: this.broker,
        symbol: position.symbol,
        market: this.market,
        size: position.size,
        entry: position.entry,
        currentPrice,
        unrealizedPnL,
        tp: position.tp,
        sl: position.sl,
        openedAt: position.openedAt,
      });
    }
    return open;
  }

  async validateMinOrder({ notionalUsd }) {
    if (notionalUsd < config.stockBroker.minOrderUsd) {
      return {
        valid: false,
        reason: `notional ${toCents(notionalUsd)} below stock minimum ${toCents(config.stockBroker.minOrderUsd)}`,
      };
    }
    return { valid: true, reason: null };
  }

  async executeSignal({ signal, notionalUsd }) {
    if (signal.side !== 'BUY') {
      return { executed: false, reason: signal.reason || 'NO_BUY_SIGNAL' };
    }

    const quote = this.getQuote(signal.symbol);
    const executionPrice = quote.price;
    const spend = Math.min(notionalUsd, this.cashUsd);
    if (spend < config.stockBroker.minOrderUsd) {
      return { executed: false, reason: 'INSUFFICIENT_EQUITY_CASH' };
    }

    const size = spend / executionPrice;
    const existing = this.positions.get(signal.symbol);
    if (existing) {
      const newSize = existing.size + size;
      const weightedEntry = ((existing.entry * existing.size) + (executionPrice * size)) / newSize;
      existing.size = newSize;
      existing.entry = weightedEntry;
      existing.currentPrice = executionPrice;
      existing.unrealizedPnL = (executionPrice - existing.entry) * existing.size;
      existing.tp = signal.tp;
      existing.sl = signal.sl;
    } else {
      this.positions.set(signal.symbol, {
        broker: this.broker,
        symbol: signal.symbol,
        market: this.market,
        size,
        entry: executionPrice,
        currentPrice: executionPrice,
        unrealizedPnL: 0,
        tp: signal.tp,
        sl: signal.sl,
        openedAt: Date.now(),
      });
    }

    this.cashUsd -= spend;

    const fill = {
      broker: this.broker,
      market: this.market,
      symbol: signal.symbol,
      side: 'BUY',
      size: Number(size.toFixed(6)),
      price: executionPrice,
      fee: 0,
      filledAt: new Date().toISOString(),
      orderId: `stock-${Date.now()}`,
      tradeId: `stock-trade-${Date.now()}`,
    };
    this.fills.unshift(fill);
    this.fills = this.fills.slice(0, 100);

    return { executed: true, reason: 'EQUITY_ORDER_EXECUTED', fill };
  }

  async getRecentFills(limit = 25) {
    return this.fills.slice(0, limit);
  }

  getDailyLossUsd() {
    this._rollDailyLossIfNeeded();
    return this.dailyLossUsd;
  }
}

const stockAdapter = new StockAdapter();
export default stockAdapter;
