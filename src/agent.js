// src/agent.js – Main trading agent loop
// Drives the strategy → risk → execution cycle.

import config from '../config/index.js';
import log from './logging/index.js';
import { MarketFeed } from './market/index.js';
import { generateSignal } from './strategy/index.js';
import { checkAndExecuteExits } from './execution/index.js';
import { getKillSwitch } from './risk/index.js';
import portfolio from './portfolio/index.js';
import stockAdapter from './brokers/stock-adapter.js';
import unifiedExecutionRouter from './unified/execution-router.js';
import { normalizeCryptoSignal, normalizeEquitySignal } from './unified/signals.js';

const EXIT_CHECK_INTERVAL_MS = 60 * 1000; // Check exits every 60s

export class TradingAgent {
  constructor() {
    this.feed = new MarketFeed(config.tradingPairs);
    this._onTicker = (snapshot) => portfolio.applyMarketSnapshot(snapshot);
    this.signals = {}; // `${market}:${symbol}` → latest unified signal
    this.cryptoDecisions = {}; // productId -> decision telemetry
    this.running = false;
    this._signalTimer = null;
    this._scanIntervalBoundMs = null;
    this._exitTimer = null;
    this._scanInProgress = false;
    this._scanSequence = 0;
    this.dayTradeSession = {
      startedAt: Date.now(),
      tradesExecuted: 0,
      stopOutCount: 0,
    };
  }

  async start() {
    if (this.running) {
      log.warn('AGENT_ALREADY_RUNNING', {});
      return;
    }

    this.running = true;
    log.info('AGENT_START', {
      pairs: config.tradingPairs,
      stockSymbols: config.stockSymbols,
      enableCrypto: config.enableCrypto,
      enableEquities: config.enableEquities,
      cryptoAutoEnabled: config.cryptoAutoEnabled,
      stockPaperEnabled: config.stockPaperEnabled,
      authority: config.authority,
      dryRun: config.dryRun,
      strategyMode: config.strategyMode,
      scanIntervalMs: this._scanIntervalMs(),
      signalConfidenceThreshold: config.signalConfidenceThreshold,
    });

    if (config.cryptoAutoEnabled) {
      // Keep position telemetry synced to incoming market ticks
      this.feed.on('ticker', this._onTicker);
      await this.feed.start();
    }

    // Initial signal pass immediately, then recurring interval
    await this._runSignalCycleSafely('startup');
    this._scheduleSignalTimer();

    // Exit checks every 60s
    this._exitTimer = setInterval(() => this._runExitCycle(), EXIT_CHECK_INTERVAL_MS);

    log.info('AGENT_READY', {});
  }

  stop() {
    this.running = false;
    clearInterval(this._signalTimer);
    clearInterval(this._exitTimer);
    if (config.cryptoAutoEnabled) {
      this.feed.off('ticker', this._onTicker);
      this.feed.stop();
    }
    log.info('AGENT_STOPPED', {});
  }

  getSignals() {
    return Object.values(this.signals);
  }

  getCryptoDecisions() {
    return Object.values(this.cryptoDecisions).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _scanIntervalMs() {
    return config.strategyMode === 'DAY_TRADE'
      ? config.dayTrade.scanIntervalMs
      : config.scanIntervalMs;
  }

  _scheduleSignalTimer() {
    const intervalMs = this._scanIntervalMs();
    if (this._signalTimer) clearInterval(this._signalTimer);
    this._scanIntervalBoundMs = intervalMs;
    this._signalTimer = setInterval(() => {
      void this._runSignalCycleSafely('interval');
    }, intervalMs);
    log.info('SCAN_SCHEDULER_STARTED', {
      intervalMs,
      strategyMode: config.strategyMode,
      timerActive: Boolean(this._signalTimer),
    });
  }

  _ensureSignalSchedulerCurrent() {
    const intervalMs = this._scanIntervalMs();
    if (!this._signalTimer || this._scanIntervalBoundMs !== intervalMs) {
      this._scheduleSignalTimer();
    }
  }

  async _runSignalCycleSafely(trigger) {
    this._ensureSignalSchedulerCurrent();
    log.info('SCAN_TICK', {
      trigger,
      running: this.running,
      killSwitch: getKillSwitch(),
      intervalMs: this._scanIntervalMs(),
      strategyMode: config.strategyMode,
    });

    try {
      await this._runSignalCycle(trigger);
    } catch (err) {
      log.error('SCAN_CYCLE_FATAL', { trigger, error: err.message, stack: err.stack });
    }
  }

  _recordDecision({ productId, status, skipReason = null, signal = null, details = {} }) {
    const confidence = Number(signal?.confidence || 0);
    const regime = signal?.indicators?.regime || null;
    const decision = {
      symbol: productId,
      productId,
      status,
      skipReason: skipReason || (status === 'SIGNAL_READY' ? null : status),
      confidence,
      regime,
      signalSide: signal?.action || signal?.side || 'WAIT',
      strategyMode: config.strategyMode,
      timeframe: config.strategyMode === 'DAY_TRADE' ? config.dayTrade.defaultTimeframe : '2h/1d',
      ts: Date.now(),
      ...details,
    };
    this.cryptoDecisions[productId] = decision;
    if (status === 'SIGNAL_SKIPPED') {
      log.info('SIGNAL_SKIPPED', decision);
    } else {
      log.info(status, decision);
      if (status !== 'SIGNAL_READY') {
        log.info('SIGNAL_SKIPPED', decision);
      }
    }
    if (config.strategyMode === 'DAY_TRADE') {
      if (status === 'SIGNAL_READY') {
        log.info('DAY_TRADE_SIGNAL', decision);
      } else {
        log.info('DAY_TRADE_SKIPPED', decision);
      }
    }
  }

  _executionStatus(reason) {
    if (!reason) return 'SIGNAL_SKIPPED';
    if (reason === 'DUPLICATE_ENTRY_BLOCKED') return 'DUPLICATE_ENTRY_BLOCKED';
    if (reason === 'MAX_POSITIONS_REACHED') return 'MAX_POSITIONS_BLOCKED';
    if ([
      'PER_POSITION_RISK_EXCEEDED',
      'MAX_TOTAL_DAILY_LOSS_REACHED',
      'MARKET_ALLOCATION_LIMIT_REACHED',
      'NO_ALLOCATABLE_CAPITAL',
      'NO_VALID_ORDER_NOTIONAL',
      'BROKER_MIN_ORDER_REJECTED',
      'COOLDOWN_ACTIVE',
      'EXCEEDS_MAX_PORTFOLIO_PCT',
      'EXCEEDS_MAX_DOLLAR_LOSS',
      'DAILY_LOSS_CUTOFF',
      'STALE_PRICE',
      'SPREAD_TOO_WIDE',
      'POSITION_EXISTS',
      'INVALID_PRICE',
      'KILL_SWITCH',
      'AUTHORITY_OFF',
    ].includes(reason)) return 'RISK_BLOCKED';
    return 'SIGNAL_SKIPPED';
  }

  _incrementSkipped(summary) {
    summary.skippedSignals += 1;
  }

  _resetDayTradeSessionIfExpired() {
    if (config.strategyMode !== 'DAY_TRADE') return;
    const now = Date.now();
    if (now - this.dayTradeSession.startedAt < config.dayTrade.sessionDurationMs) return;
    log.info('DAY_TRADE_SESSION_SUMMARY', {
      endedAt: new Date(now).toISOString(),
      startedAt: new Date(this.dayTradeSession.startedAt).toISOString(),
      tradesExecuted: this.dayTradeSession.tradesExecuted,
      stopOutCount: this.dayTradeSession.stopOutCount,
      reason: 'SESSION_DURATION_ELAPSED',
    });
    this.dayTradeSession = {
      startedAt: now,
      tradesExecuted: 0,
      stopOutCount: 0,
    };
  }

  async _runSignalCycle(trigger = 'manual') {
    if (!this.running) return;

    if (this._scanInProgress) {
      log.warn('SCAN_SKIPPED_OVERLAP', { trigger });
      return;
    }

    this._scanInProgress = true;
    this._resetDayTradeSessionIfExpired();
    const startedAt = Date.now();
    this._scanSequence += 1;

    const summary = {
      trigger,
      scanId: this._scanSequence,
      strategyMode: config.strategyMode,
      pairsTotal: config.tradingPairs.length,
      pairsEvaluated: 0,
      skippedSignals: 0,
      executedTrades: 0,
    };

    log.info('SCAN_START', summary);
    if (config.strategyMode === 'DAY_TRADE') {
      log.info('DAY_TRADE_SCAN_START', {
        ...summary,
        timeframe: config.dayTrade.defaultTimeframe,
        maxTradesPerSession: config.dayTrade.maxTradesPerSession,
      });
    }

    if (getKillSwitch()) {
      log.info('SIGNAL_SKIPPED', { trigger, reason: 'KILL_SWITCH_ACTIVE' });
      log.info('NO_TRADE_CONDITIONS_MET', { ...summary, reason: 'KILL_SWITCH_ACTIVE' });
      log.info('SCAN_COMPLETE', { ...summary, durationMs: Date.now() - startedAt });
      this._scanInProgress = false;
      return;
    }

    try {
      const priceMap = this._buildPriceMap();

      if (!config.cryptoAutoEnabled) {
        log.info('CRYPTO_ENGINE_DISABLED', { trigger, reason: 'CRYPTO_AUTO_DISABLED' });
      } else {
        for (const productId of config.tradingPairs) {
          if (getKillSwitch()) {
            summary.pairsEvaluated += 1;
            this._incrementSkipped(summary);
            this._recordDecision({
              productId,
              status: 'SIGNAL_SKIPPED',
              skipReason: 'KILL_SWITCH_ACTIVE',
            });
            continue;
          }

          const snap = this.feed.getSnapshot(productId);
          if (!snap) {
            summary.pairsEvaluated += 1;
            this._incrementSkipped(summary);
            log.warn('PAIR_EVALUATED', {
              trigger,
              scanId: summary.scanId,
              productId,
              action: 'SKIP',
              reason: 'NO_SNAPSHOT',
            });
            this._recordDecision({
              productId,
              status: 'SIGNAL_SKIPPED',
              skipReason: 'NO_SNAPSHOT',
            });
            continue;
          }

          try {
            const signal = await generateSignal(productId, snap.price, {
              mode: config.strategyMode,
              timeframe: config.dayTrade.defaultTimeframe,
            });
            const unifiedSignal = normalizeCryptoSignal(signal);
            this.signals[`crypto:${productId}`] = unifiedSignal;
            summary.pairsEvaluated += 1;

            log.info('PAIR_EVALUATED', {
              trigger,
              scanId: summary.scanId,
              productId,
              action: signal.action,
              reason: signal.reason,
              confidence: signal.confidence,
              snapshotAgeMs: typeof snap.ts === 'number' ? Date.now() - snap.ts : null,
              strategyMode: config.strategyMode,
            });

            if (signal.action !== 'BUY') {
              this._incrementSkipped(summary);
              const status = signal.reason === 'NO_SETUP'
                ? 'NO_SETUP'
                : (signal.reason === 'REGIME_BLOCKED' ? 'REGIME_BLOCKED' : 'SIGNAL_SKIPPED');
              this._recordDecision({
                productId,
                status,
                skipReason: signal.reason || 'NO_BUY_SIGNAL',
                signal,
              });
              continue;
            }

            if (signal.confidence < config.signalConfidenceThreshold) {
              this._incrementSkipped(summary);
              this._recordDecision({
                productId,
                status: 'CONFIDENCE_TOO_LOW',
                skipReason: 'CONFIDENCE_TOO_LOW',
                signal,
                details: {
                  threshold: config.signalConfidenceThreshold,
                },
              });
              continue;
            }

            if (config.strategyMode === 'DAY_TRADE') {
              if (this.dayTradeSession.tradesExecuted >= config.dayTrade.maxTradesPerSession) {
                this._incrementSkipped(summary);
                this._recordDecision({
                  productId,
                  status: 'SIGNAL_SKIPPED',
                  skipReason: 'MAX_TRADES_PER_SESSION',
                  signal,
                });
                continue;
              }

              if (portfolio.isInCooldown(productId, config.dayTrade.cooldownAfterStopMs)) {
                this._incrementSkipped(summary);
                this._recordDecision({
                  productId,
                  status: 'RISK_BLOCKED',
                  skipReason: 'COOLDOWN_ACTIVE',
                  signal,
                  details: {
                    remainingMs: portfolio.cooldownRemaining(productId, config.dayTrade.cooldownAfterStopMs),
                  },
                });
                continue;
              }
            }

            this._recordDecision({
              productId,
              status: 'SIGNAL_READY',
              signal,
            });

            const execution = await unifiedExecutionRouter.route({
              signal: unifiedSignal,
              snapshot: snap,
              priceMap,
            });
            if (execution?.executed) {
              summary.executedTrades += 1;
              if (config.strategyMode === 'DAY_TRADE') {
                this.dayTradeSession.tradesExecuted += 1;
                log.info('DAY_TRADE_ORDER_SUBMITTED', {
                  productId,
                  dryRun: Boolean(execution?.result?.dryRun),
                  strategyMode: config.strategyMode,
                });
                if (execution?.positionOpened) {
                  log.info('DAY_TRADE_ORDER_FILLED', {
                    productId,
                    orderId: execution?.result?.orderId || null,
                  });
                }
              }
            } else {
              this._incrementSkipped(summary);
              const status = this._executionStatus(execution?.reason);
              this._recordDecision({
                productId,
                status,
                skipReason: execution?.reason || 'EXECUTION_NOT_PERFORMED',
                signal,
                details: execution?.details ? { details: execution.details } : {},
              });
            }
          } catch (err) {
            summary.pairsEvaluated += 1;
            this._incrementSkipped(summary);
            log.error('SIGNAL_CYCLE_ERROR', { productId, error: err.message });
            this._recordDecision({
              productId,
              status: 'SIGNAL_SKIPPED',
              skipReason: 'SIGNAL_CYCLE_ERROR',
            });
          }
        }
      }

      if (!config.stockPaperEnabled) {
        log.info('STOCK_ENGINE_DISABLED', { trigger, reason: 'STOCK_PAPER_DISABLED' });
      }
      if (config.stockPaperEnabled) {
        for (const symbol of config.stockSymbols) {
          const equitySignal = normalizeEquitySignal(stockAdapter.generateSignal(symbol));
          this.signals[`equities:${symbol}`] = equitySignal;

          if (equitySignal.side !== 'BUY') continue;
          if (equitySignal.confidence < config.signalConfidenceThreshold) continue;
          if (config.authority === 'OFF') continue;
          if (getKillSwitch()) continue;

          const execution = await unifiedExecutionRouter.route({
            signal: equitySignal,
            snapshot: { ts: equitySignal.ts, price: equitySignal.entry, spreadPct: 0, bid: equitySignal.entry, ask: equitySignal.entry },
            priceMap,
          });
          if (execution?.executed) summary.executedTrades += 1;
        }
      }

      if (summary.executedTrades === 0) {
        log.info('NO_TRADE_CONDITIONS_MET', {
          ...summary,
          confidenceThreshold: config.signalConfidenceThreshold,
        });
      }

      const completedSummary = {
        ...summary,
        durationMs: Date.now() - startedAt,
      };
      log.info('SCAN_COMPLETE', completedSummary);
      if (config.strategyMode === 'DAY_TRADE') {
        log.info('DAY_TRADE_SESSION_SUMMARY', {
          ...completedSummary,
          sessionStartedAt: new Date(this.dayTradeSession.startedAt).toISOString(),
          tradesExecutedThisSession: this.dayTradeSession.tradesExecuted,
          maxTradesPerSession: config.dayTrade.maxTradesPerSession,
        });
      }
    } finally {
      this._scanInProgress = false;
    }
  }

  async _runExitCycle() {
    if (!this.running || getKillSwitch()) return;

    if (!config.cryptoAutoEnabled) return;

    const positions = portfolio.getAllPositions();
    if (!positions.length) return;

    const priceMap = this._buildPriceMap();
    if (!Object.keys(priceMap).length) return;

    try {
      const exitsResult = await checkAndExecuteExits(priceMap);
      const exits = Array.isArray(exitsResult) ? exitsResult : [];
      if (!Array.isArray(exitsResult)) {
        log.warn('EXIT_CYCLE_UNEXPECTED_RESULT', { resultType: typeof exitsResult });
      }
      if (config.strategyMode === 'DAY_TRADE' && Array.isArray(exits)) {
        exits.forEach((result) => {
          if (result?.reason === 'stop_loss' || result?.reason === 'stop_out') {
            this.dayTradeSession.stopOutCount += 1;
          }
        });
      }
    } catch (err) {
      log.error('EXIT_CYCLE_ERROR', { error: err.message });
    }
  }

  _buildPriceMap() {
    const map = {};
    for (const pid of config.tradingPairs) {
      const snap = this.feed.getSnapshot(pid);
      if (snap?.price) map[pid] = snap.price;
    }
    return map;
  }
}

export default TradingAgent;
