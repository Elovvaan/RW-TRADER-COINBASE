import { getBalances, portfolioValueUSD } from '../accounts/index.js';
import { listFills } from '../orders/index.js';
import { getProduct } from '../products/index.js';
import { validateMinimumOrder, calculatePositionSize } from '../risk/index.js';
import { evaluateAndExecute } from '../execution/index.js';
import { createOrder } from '../orders/index.js';
import log from '../logging/index.js';

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

  async getMinOrderNotional(symbol) {
    const product = await getProduct(symbol);
    const minQuote = Number(product?.quote_min_size || 0);
    return Number.isFinite(minQuote) && minQuote > 0 ? minQuote : 0;
  }

  async executeSignal({ signal, snapshot, priceMap, allocation = null, executionContext = {} }) {
    if (signal.side === 'BUY' && allocation?.rotationPlan?.requiredUsd > 0) {
      await this.rotateCapitalForEntry({
        signal,
        allocation,
      });
    }

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

    const overrideQuoteSize = Number(allocation?.notionalUsd);
    return evaluateAndExecute(legacySignal, snapshot, priceMap, {
      quoteSizeOverride: Number.isFinite(overrideQuoteSize) ? overrideQuoteSize : null,
      executionContext: {
        ...executionContext,
        manualOverride: Boolean(executionContext?.manualOverride),
      },
    });
  }

  async rotateCapitalForEntry({ signal, allocation }) {
    const rotation = allocation?.rotationPlan;
    if (!rotation || !Array.isArray(rotation.sources) || rotation.requiredUsd <= 0) return;

    for (const source of rotation.sources) {
      const productId = source.productId;
      const usdToRotate = Number(source.usdToRotate || 0);
      if (!productId || !Number.isFinite(usdToRotate) || usdToRotate <= 0) continue;

      const balances = await getBalances();
      const baseCurrency = String(productId).split('-')[0];
      const availableBase = Number(balances?.[baseCurrency]?.available || 0);
      const px = Number((await getProduct(productId)).price || 0);
      if (!Number.isFinite(availableBase) || availableBase <= 0 || !Number.isFinite(px) || px <= 0) continue;

      const baseSize = Math.min(availableBase, usdToRotate / px);
      if (!Number.isFinite(baseSize) || baseSize <= 0) continue;

      const product = await getProduct(productId);
      const minCheck = validateMinimumOrder(product, baseSize, null);
      if (!minCheck.valid) {
        log.warn('ROTATION_DECISION', {
          market: 'crypto',
          symbol: signal.symbol,
          source: productId,
          action: 'SKIP_BELOW_MIN_ORDER',
          reason: minCheck.reason,
        });
        continue;
      }

      const result = await createOrder({
        productId,
        side: 'SELL',
        baseSize: Number(baseSize.toFixed(8)),
      });
      log.info('ROTATION_DECISION', {
        market: 'crypto',
        symbol: signal.symbol,
        source: productId,
        action: 'SUBMITTED',
        usdToRotate,
        baseSize: Number(baseSize.toFixed(8)),
        dryRun: Boolean(result?.dryRun),
      });
    }
  }
}

const coinbaseAdapter = new CoinbaseAdapter();
export default coinbaseAdapter;
