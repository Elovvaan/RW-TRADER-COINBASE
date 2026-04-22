import config from '../../config/index.js';
import log from '../logging/index.js';
import coinbaseAdapter from '../brokers/coinbase-adapter.js';
import stockAdapter from '../brokers/stock-adapter.js';
import portfolio from '../portfolio/index.js';
import { allocateSignal } from './allocator.js';
import { getKillSwitch } from '../risk/index.js';

function toCryptoUnifiedPositions() {
  return portfolio.getAllPositions().map((position) => ({
    broker: 'coinbase',
    symbol: position.productId,
    market: 'crypto',
    executionType: 'REAL',
    size: position.baseSize,
    entry: position.entryPrice,
    currentPrice: position.markPrice ?? position.lastPrice ?? position.entryPrice,
    unrealizedPnL: position.unrealizedPnlUsd ?? 0,
    tp: position.tpPrice,
    sl: position.slPrice,
    openedAt: position.openedAt,
    positionAgeMs: Number.isFinite(position.openedAt) ? Math.max(0, Date.now() - position.openedAt) : null,
    lastMarketUpdateTs: position.lastMarketUpdateTs ?? null,
  }));
}

export class UnifiedExecutionRouter {
  constructor() {
    this.adapters = {
      crypto: coinbaseAdapter,
      equities: stockAdapter,
    };
  }

  async route({ signal, snapshot, priceMap }) {
    if (signal.market === 'crypto' && !config.cryptoAutoEnabled) {
      log.info('CRYPTO_ENGINE_DISABLED', { market: signal.market, symbol: signal.symbol, reason: 'CRYPTO_AUTO_DISABLED' });
      return { executed: false, reason: 'CRYPTO_DISABLED' };
    }
    if (signal.market === 'equities' && !config.stockPaperEnabled) {
      log.info('STOCK_ENGINE_DISABLED', { market: signal.market, symbol: signal.symbol, reason: 'STOCK_PAPER_DISABLED' });
      return { executed: false, reason: 'EQUITIES_DISABLED' };
    }
    if (getKillSwitch()) return { executed: false, reason: 'GLOBAL_KILL_SWITCH_ACTIVE' };
    if (config.authority === 'OFF') return { executed: false, reason: 'AUTHORITY_OFF' };

    const adapter = this.adapters[signal.market];
    if (!adapter) return { executed: false, reason: 'UNSUPPORTED_MARKET' };

    const hasExistingPosition = signal.market === 'crypto'
      ? portfolio.hasPosition(signal.symbol)
      : stockAdapter.hasPosition(signal.symbol);
    const pyramidingAllowed = signal.market === 'crypto'
      ? config.execution.cryptoAllowPyramiding
      : config.execution.stockAllowPyramiding;

    if (hasExistingPosition && !pyramidingAllowed) {
      log.info('POSITION_ADD_BLOCKED_DUPLICATE', {
        market: signal.market,
        symbol: signal.symbol,
        pyramidingAllowed,
      });
      return { executed: false, reason: 'POSITION_DUPLICATE_BLOCKED' };
    }
    log.info('POSITION_ADD_ALLOWED', {
      market: signal.market,
      symbol: signal.symbol,
      duplicate: hasExistingPosition,
      pyramidingAllowed,
    });

    const [coinbaseBalances, stockBalances] = await Promise.all([
      coinbaseAdapter.getBalances().catch(() => ({})),
      stockAdapter.getBalances().catch(() => ({})),
    ]);

    const positions = [
      ...toCryptoUnifiedPositions(),
      ...stockAdapter.getOpenPositions(),
    ];

    const proposedNotionalUsd = signal.market === 'crypto'
      ? await coinbaseAdapter.estimateEntryNotional({ priceMap }).catch(() => null)
      : null;

    const allocation = await allocateSignal({
      signal,
      positions,
      balancesByBroker: {
        coinbase: coinbaseBalances,
        stocks: stockBalances,
      },
      dailyLossUsd: portfolio.getDailyLoss() + stockAdapter.getDailyLossUsd(),
      adapter,
      proposedNotionalUsd,
    });

    if (!allocation.approved) {
      return { executed: false, reason: allocation.reason, details: allocation.details || null };
    }

    if (signal.market === 'crypto') {
      return adapter.executeSignal({ signal, snapshot, priceMap });
    }

    if (config.authority === 'ASSIST') {
      log.info('ASSIST_MODE_SIGNAL', {
        market: signal.market,
        symbol: signal.symbol,
        signal,
        allocation,
      });
      return { executed: false, reason: 'ASSIST_MODE', allocation };
    }

    return adapter.executeSignal({ signal, notionalUsd: allocation.notionalUsd });
  }
}

const unifiedExecutionRouter = new UnifiedExecutionRouter();
export default unifiedExecutionRouter;
