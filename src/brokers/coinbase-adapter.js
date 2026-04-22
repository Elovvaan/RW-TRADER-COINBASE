import { getBalances, portfolioValueUSD } from '../accounts/index.js';
import { listFills } from '../orders/index.js';
import { getProduct } from '../products/index.js';
import { validateMinimumOrder, calculatePositionSize } from '../risk/index.js';
import { evaluateAndExecute } from '../execution/index.js';

export class CoinbaseAdapter {
  constructor() {
    this.broker = 'coinbase';
    this.market = 'crypto';
  }

  async getBalances() {
    return getBalances();
  }

  async getRecentFills(limit = 25) {
    const fills = await listFills(null, limit);
    return fills.map((fill) => ({
      broker: this.broker,
      market: this.market,
      symbol: fill.product_id,
      side: fill.side,
      size: Number(fill.size),
      price: Number(fill.price),
      fee: Number(fill.commission || 0),
      filledAt: fill.trade_time || fill.created_time || null,
      orderId: fill.order_id || null,
      tradeId: fill.trade_id || null,
    }));
  }

  async estimateEntryNotional({ priceMap }) {
    const balances = await getBalances();
    const portfolioUsd = portfolioValueUSD(balances, priceMap);
    return calculatePositionSize(portfolioUsd);
  }

  async validateMinOrder({ symbol, notionalUsd }) {
    const product = await getProduct(symbol);
    const check = validateMinimumOrder(product, null, notionalUsd);
    return { valid: check.valid, reason: check.reason || null };
  }

  async executeSignal({ signal, snapshot, priceMap }) {
    const legacySignal = {
      productId: signal.symbol,
      action: signal.side,
      confidence: signal.confidence,
      reason: signal.reason,
      entryPrice: signal.entry,
      tpPrice: signal.tp,
      slPrice: signal.sl,
      ts: signal.ts,
      indicators: signal.indicators || {},
    };

    return evaluateAndExecute(legacySignal, snapshot, priceMap);
  }
}

const coinbaseAdapter = new CoinbaseAdapter();
export default coinbaseAdapter;
