// src/agent.js – Main trading agent loop
// Drives the strategy → risk → execution cycle.

import config from '../config/index.js';
import log from './logging/index.js';
import { MarketFeed } from './market/index.js';
import { generateSignal, checkExits } from './strategy/index.js';
import { evaluateAndExecute, checkAndExecuteExits } from './execution/index.js';
import { getKillSwitch } from './risk/index.js';
import portfolio from './portfolio/index.js';

const EXIT_CHECK_INTERVAL_MS = 60 * 1000;         // Check exits every 60s

export class TradingAgent {
  constructor() {
    this.feed     = new MarketFeed(config.tradingPairs);
    this._onTicker = (snapshot) => portfolio.applyMarketSnapshot(snapshot);
    this.signals  = {};       // productId → latest signal
    this.running  = false;
    this._signalTimer = null;
    this._exitTimer   = null;
    this._scanInProgress = false;
    this._scanSequence = 0;
  }

  async start() {
    if (this.running) {
      log.warn('AGENT_ALREADY_RUNNING', {});
      return;
    }

    this.running = true;
    log.info('AGENT_START', {
      pairs: config.tradingPairs,
      authority: config.authority,
      dryRun: config.dryRun,
      scanIntervalMs: config.scanIntervalMs,
      signalConfidenceThreshold: config.signalConfidenceThreshold,
    });

    // Keep position telemetry synced to incoming market ticks
    this.feed.on('ticker', this._onTicker);

    // Start WebSocket feed
    await this.feed.start();

    // Initial signal pass immediately, then recurring interval
    await this._runSignalCycleSafely('startup');

    if (this._signalTimer) clearInterval(this._signalTimer);
    this._signalTimer = setInterval(() => {
      void this._runSignalCycleSafely('interval');
    }, config.scanIntervalMs);
    log.info('SCAN_SCHEDULER_STARTED', {
      intervalMs: config.scanIntervalMs,
      timerActive: Boolean(this._signalTimer),
    });

    // Exit checks every 60s
    this._exitTimer = setInterval(() => this._runExitCycle(), EXIT_CHECK_INTERVAL_MS);

    log.info('AGENT_READY', {});
  }

  stop() {
    this.running = false;
    clearInterval(this._signalTimer);
    clearInterval(this._exitTimer);
    this.feed.off('ticker', this._onTicker);
    this.feed.stop();
    log.info('AGENT_STOPPED', {});
  }

  getSignals() {
    return Object.values(this.signals);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  async _runSignalCycleSafely(trigger) {
    log.info('SCAN_TICK', {
      trigger,
      running: this.running,
      killSwitch: getKillSwitch(),
      intervalMs: config.scanIntervalMs,
    });

    try {
      await this._runSignalCycle(trigger);
    } catch (err) {
      log.error('SCAN_CYCLE_FATAL', { trigger, error: err.message, stack: err.stack });
    }
  }

  async _runSignalCycle(trigger = 'manual') {
    if (!this.running) return;

    if (this._scanInProgress) {
      log.warn('SCAN_SKIPPED_OVERLAP', { trigger });
      return;
    }

    this._scanInProgress = true;
    const startedAt = Date.now();
    this._scanSequence += 1;

    const summary = {
      trigger,
      scanId: this._scanSequence,
      pairsTotal: config.tradingPairs.length,
      pairsEvaluated: 0,
      skippedSignals: 0,
      executedTrades: 0,
    };

    log.info('SCAN_START', summary);

    if (getKillSwitch()) {
      log.info('SIGNAL_SKIPPED', { trigger, reason: 'KILL_SWITCH_ACTIVE' });
      log.info('NO_TRADE_CONDITIONS_MET', { ...summary, reason: 'KILL_SWITCH_ACTIVE' });
      log.info('SCAN_COMPLETE', { ...summary, durationMs: Date.now() - startedAt });
      this._scanInProgress = false;
      return;
    }

    try {
      const priceMap = this._buildPriceMap();

      for (const productId of config.tradingPairs) {
        if (getKillSwitch()) {
          log.info('SIGNAL_SKIPPED', { trigger, productId, reason: 'KILL_SWITCH_ACTIVE' });
          continue;
        }

        // Skip if position already open
        if (portfolio.hasPosition(productId)) {
          summary.pairsEvaluated += 1;
          summary.skippedSignals += 1;
          log.info('PAIR_EVALUATED', {
            trigger,
            scanId: summary.scanId,
            productId,
            action: 'SKIP',
            reason: 'POSITION_EXISTS',
          });
          log.info('SIGNAL_SKIPPED', { trigger, scanId: summary.scanId, productId, reason: 'POSITION_EXISTS' });
          continue;
        }

        const snap = this.feed.getSnapshot(productId);
        if (!snap) {
          summary.pairsEvaluated += 1;
          summary.skippedSignals += 1;
          log.warn('PAIR_EVALUATED', {
            trigger,
            scanId: summary.scanId,
            productId,
            action: 'SKIP',
            reason: 'NO_SNAPSHOT',
          });
          log.info('SIGNAL_SKIPPED', { trigger, scanId: summary.scanId, productId, reason: 'NO_SNAPSHOT' });
          continue;
        }

        try {
          const signal = await generateSignal(productId, snap.price);
          this.signals[productId] = signal;
          summary.pairsEvaluated += 1;

          log.info('PAIR_EVALUATED', {
            trigger,
            scanId: summary.scanId,
            productId,
            action: signal.action,
            reason: signal.reason,
            confidence: signal.confidence,
            snapshotAgeMs: typeof snap.ts === 'number' ? Date.now() - snap.ts : null,
          });

          if (signal.action !== 'BUY') {
            summary.skippedSignals += 1;
            log.info('SIGNAL_SKIPPED', {
              trigger,
              scanId: summary.scanId,
              productId,
              reason: signal.reason || 'NO_BUY_SIGNAL',
              action: signal.action,
              confidence: signal.confidence,
            });
            continue;
          }

          if (signal.confidence < config.signalConfidenceThreshold) {
            summary.skippedSignals += 1;
            log.info('SIGNAL_SKIPPED', {
              trigger,
              scanId: summary.scanId,
              productId,
              reason: 'CONFIDENCE_BELOW_THRESHOLD',
              confidence: signal.confidence,
              threshold: config.signalConfidenceThreshold,
            });
            continue;
          }

          const execution = await evaluateAndExecute(signal, snap, priceMap);
          if (execution?.executed) {
            summary.executedTrades += 1;
          } else {
            summary.skippedSignals += 1;
            log.info('SIGNAL_SKIPPED', {
              trigger,
              scanId: summary.scanId,
              productId,
              reason: execution?.reason || 'EXECUTION_NOT_PERFORMED',
            });
          }
        } catch (err) {
          summary.pairsEvaluated += 1;
          summary.skippedSignals += 1;
          log.error('SIGNAL_CYCLE_ERROR', { productId, error: err.message });
        }
      }

      if (summary.executedTrades === 0) {
        log.info('NO_TRADE_CONDITIONS_MET', {
          ...summary,
          confidenceThreshold: config.signalConfidenceThreshold,
        });
      }

      log.info('SCAN_COMPLETE', {
        ...summary,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      this._scanInProgress = false;
    }
  }

  async _runExitCycle() {
    if (!this.running || getKillSwitch()) return;

    const positions = portfolio.getAllPositions();
    if (!positions.length) return;

    const priceMap = this._buildPriceMap();
    if (!Object.keys(priceMap).length) return;

    try {
      await checkAndExecuteExits(priceMap);
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
