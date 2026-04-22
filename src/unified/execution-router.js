import config from '../../config/index.js';
import log from '../logging/index.js';
import coinbaseAdapter from '../brokers/coinbase-adapter.js';
import stockAdapter from '../brokers/stock-adapter.js';
import portfolio from '../portfolio/index.js';
import { allocateSignal } from './allocator.js';
import { getKillSwitch } from '../risk/index.js';
import { createOrder } from '../orders/index.js';

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
    this.tradeActions = [];
  }

  async route({ signal, snapshot, priceMap, executionContext = {} }) {
    if (signal.market === 'crypto' && !config.cryptoAutoEnabled) {
      log.info('CRYPTO_ENGINE_DISABLED', { market: signal.market, symbol: signal.symbol, reason: 'CRYPTO_AUTO_DISABLED' });
      return { executed: false, reason: 'CRYPTO_DISABLED' };
    }
    if (signal.market === 'equities' && !config.stockPaperEnabled) {
      log.info('STOCK_ENGINE_DISABLED', { market: signal.market, symbol: signal.symbol, reason: 'STOCK_PAPER_DISABLED' });
      return { executed: false, reason: 'EQUITIES_DISABLED' };
    }
    const killSwitchBlock = this._blockIf({
      condition: getKillSwitch(),
      market: signal.market,
      symbol: signal.symbol,
      reason: 'GLOBAL_KILL_SWITCH_ACTIVE',
    });
    if (killSwitchBlock) return killSwitchBlock;

    const authorityBlock = this._blockIf({
      condition: config.authority === 'OFF',
      market: signal.market,
      symbol: signal.symbol,
      reason: 'AUTHORITY_OFF',
    });
    if (authorityBlock) return authorityBlock;

    const adapter = this.adapters[signal.market];
    if (!adapter) return { executed: false, reason: 'UNSUPPORTED_MARKET' };

    const hasExistingPosition = signal.market === 'crypto'
      ? portfolio.hasPosition(signal.symbol)
      : stockAdapter.hasPosition(signal.symbol);
    const pyramidingAllowed = signal.market === 'crypto'
      ? config.execution.cryptoAllowPyramiding
      : config.execution.stockAllowPyramiding;

    const smallAccountMode = Boolean(executionContext.smallAccountMode);
    const overrideMaxOpenPositions = Number(executionContext.maxOpenPositions);
    const effectiveMaxOpenPositions = Number.isFinite(overrideMaxOpenPositions) && overrideMaxOpenPositions > 0
      ? Math.floor(overrideMaxOpenPositions)
      : (signal.market === 'crypto' && smallAccountMode
      ? Math.max(1, Math.min(config.smallAccount.maxOpenPositions, config.dayTrade.maxOpenPositions))
      : config.dayTrade.maxOpenPositions);

    if (signal.market === 'crypto' && !hasExistingPosition) {
      const openCryptoPositions = portfolio.getAllPositions().length;
      const modeLimit = config.strategyMode === 'DAY_TRADE'
        ? effectiveMaxOpenPositions
        : config.tradingPairs.length;
      log.info('MAX_POSITIONS_LIMIT=3', {
        market: signal.market,
        symbol: signal.symbol,
        maxPositions: modeLimit,
      });
      if (openCryptoPositions >= modeLimit) {
        log.info('POSITION_OPEN_BLOCKED', {
          market: signal.market,
          symbol: signal.symbol,
          openPositions: openCryptoPositions,
          maxPositions: modeLimit,
        });
        return { executed: false, reason: 'MAX_POSITIONS_REACHED' };
      }
      log.info('POSITION_OPEN_ALLOWED', {
        market: signal.market,
        symbol: signal.symbol,
        openPositions: openCryptoPositions,
        maxPositions: modeLimit,
      });
    }

    const duplicateWindowMs = signal.market === 'crypto'
      ? Number(config.smallAccount.duplicateWindowMs || 0)
      : 0;
    const hasRecentDuplicate = signal.market === 'crypto'
      ? portfolio.hasRecentEntry(signal.symbol, duplicateWindowMs)
      : false;

    if ((hasRecentDuplicate || (hasExistingPosition && !pyramidingAllowed)) && !Boolean(executionContext.allowScaleIn)) {
      log.info('DUPLICATE_ENTRY_BLOCKED', {
        market: signal.market,
        symbol: signal.symbol,
        pyramidingAllowed,
        hasExistingPosition,
        hasRecentDuplicate,
        remainingMs: signal.market === 'crypto'
          ? portfolio.recentEntryRemaining(signal.symbol, duplicateWindowMs)
          : 0,
      });
      return { executed: false, reason: 'DUPLICATE_ENTRY_BLOCKED' };
    }
    if (hasExistingPosition && signal.market === 'crypto') {
      log.info('SCALE_IN_DECISION', {
        symbol: signal.symbol,
        decision: pyramidingAllowed || Boolean(executionContext.allowScaleIn) ? 'ALLOW' : 'BLOCK',
        pyramidingAllowed,
      });
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

    const proposedNotionalUsd = Number.isFinite(Number(executionContext.manualNotionalUsd))
      ? Number(executionContext.manualNotionalUsd)
      : (signal.market === 'crypto'
      ? await coinbaseAdapter.estimateEntryNotional({ priceMap }).catch(() => null)
      : null);

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
      executionContext: { ...executionContext, priceMap },
    });

    if (!allocation.approved && signal.market === 'crypto' && this._canRotateFromBalances(allocation.reason)) {
      const rotated = await this._attemptRotation({
        signal,
        priceMap,
        balances: coinbaseBalances,
        reason: allocation.reason,
        executionContext,
      });
      if (rotated) {
        const balancesAfterRotation = await coinbaseAdapter.getBalances().catch(() => coinbaseBalances);
        const retryAllocation = await allocateSignal({
          signal,
          positions,
          balancesByBroker: {
            coinbase: balancesAfterRotation,
            stocks: stockBalances,
          },
          dailyLossUsd: portfolio.getDailyLoss() + stockAdapter.getDailyLossUsd(),
          adapter,
          proposedNotionalUsd,
          executionContext: { ...executionContext, priceMap },
        });
        if (retryAllocation.approved) {
          return adapter.executeSignal({ signal, snapshot, priceMap, allocation: retryAllocation, executionContext });
        }
        return { executed: false, reason: retryAllocation.reason, details: retryAllocation.details || null };
      }
    }

    if (!allocation.approved) {
      return { executed: false, reason: allocation.reason, details: allocation.details || null };
    }

    if (signal.market === 'crypto') {
      const result = await adapter.executeSignal({
        signal,
        snapshot,
        priceMap,
        allocation,
        executionContext: {
          ...executionContext,
          allowScaleIn: hasExistingPosition && (pyramidingAllowed || Boolean(executionContext.allowScaleIn)),
        },
      });
      const tradeType = hasExistingPosition ? 'scale-in' : 'fresh-buy';
      if (result?.executed) {
        this._pushTradeAction({
          ts: Date.now(),
          symbol: signal.symbol,
          side: signal.side,
          type: tradeType,
          notionalUsd: allocation.notionalUsd,
          reason: signal.reason || 'SIGNAL_EXECUTED',
        });
      }
      return result;
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

  _blockIf({ condition, market, symbol, reason }) {
    if (!condition) return null;
    log.info('EXECUTION_BLOCKED', { market, symbol, reason });
    return { executed: false, reason };
  }

  _canRotateFromBalances(reason) {
    return reason === 'NO_ALLOCATABLE_CAPITAL' || reason === 'NO_VALID_ORDER_NOTIONAL';
  }

  _pushTradeAction(action) {
    this.tradeActions.unshift(action);
    this.tradeActions = this.tradeActions.slice(0, 100);
  }

  getRecentTradeActions(limit = 25) {
    return this.tradeActions.slice(0, Math.max(1, limit));
  }

  async _attemptRotation({ signal, priceMap, balances, reason, executionContext = {} }) {
    const candidates = portfolio.getAllPositions()
      .filter((position) => position.productId !== signal.symbol)
      .sort((a, b) => Number(b.unrealizedPnlUsd || 0) - Number(a.unrealizedPnlUsd || 0));
    if (!candidates.length) return false;

    const rotationTarget = candidates[candidates.length - 1];
    const incomingConfidence = Number(signal.confidence || 0);
    const rotationConfidenceFloor = Number(executionContext.rotationConfidenceFloor || 0.55);
    if (!Number.isFinite(incomingConfidence) || incomingConfidence < rotationConfidenceFloor) {
      log.info('ROTATION_DECISION', {
        symbol: signal.symbol,
        fromSymbol: rotationTarget.productId,
        reason: 'INCOMING_SIGNAL_NOT_STRONG_ENOUGH',
        incomingConfidence,
        rotationConfidenceFloor,
      });
      return false;
    }
    const trimPct = Math.max(0.2, Math.min(1, Number(executionContext.rotationTrimPct || 0.5)));
    const originalBaseSize = Number(rotationTarget.baseSize);
    const trimBaseSize = originalBaseSize * trimPct;
    log.info('ROTATION_DECISION', {
      symbol: signal.symbol,
      fromSymbol: rotationTarget.productId,
      reason,
      trimPct,
      incomingConfidence,
    });
    try {
      log.info('EXIT_TO_REALLOCATE', {
        symbol: signal.symbol,
        fromSymbol: rotationTarget.productId,
        reason,
        trimPct,
      });
      const result = await createOrder({
        productId: rotationTarget.productId,
        side: 'SELL',
        baseSize: trimBaseSize.toFixed(8),
      });
      if (!result?.dryRun) {
        const markPrice = Number(priceMap?.[rotationTarget.productId] || rotationTarget.currentPrice || rotationTarget.entryPrice);
        if (Number.isFinite(markPrice) && markPrice > 0) {
          if (trimPct >= 0.999) {
            portfolio.closePosition(rotationTarget.productId, markPrice, 'rotation');
          } else {
            const remainingBase = originalBaseSize - trimBaseSize;
            const remainingRatio = remainingBase / Math.max(1e-12, originalBaseSize);
            rotationTarget.baseSize = Math.max(0, remainingBase);
            rotationTarget.quoteSpent = Number(rotationTarget.quoteSpent || 0) * Math.max(0, Math.min(1, remainingRatio));
          }
        }
      }
      log.info('ROTATION_EXECUTED', {
        symbol: signal.symbol,
        fromSymbol: rotationTarget.productId,
        orderId: result?.orderId || null,
        dryRun: Boolean(result?.dryRun),
      });
      this._pushTradeAction({
        ts: Date.now(),
        symbol: rotationTarget.productId,
        side: 'SELL',
        type: trimPct >= 0.999 ? 'rotation' : 'trim',
        notionalUsd: Number(priceMap?.[rotationTarget.productId] || 0) * trimBaseSize,
        reason: 'EXIT_TO_REALLOCATE',
      });
      return true;
    } catch (error) {
      log.warn('ROTATION_FAILED', {
        symbol: signal.symbol,
        fromSymbol: rotationTarget.productId,
        error: error.message,
      });
      return false;
    }
  }
}

const unifiedExecutionRouter = new UnifiedExecutionRouter();
export default unifiedExecutionRouter;
