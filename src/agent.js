// src/agent.js – Main trading agent loop
// Drives the strategy → risk → execution cycle.

import config from '../config/index.js';
import log from './logging/index.js';
import { MarketFeed } from './market/index.js';
import { generateSignal, checkExits } from './strategy/index.js';
import { evaluateAndExecute, checkAndExecuteExits } from './execution/index.js';
import { getKillSwitch } from './risk/index.js';
import portfolio from './portfolio/index.js';

const SIGNAL_INTERVAL_MS = 4 * 60 * 60 * 1000;  // 4h cycle
const EXIT_CHECK_INTERVAL_MS = 60 * 1000;         // Check exits every 60s

export class TradingAgent {
  constructor() {
    this.feed     = new MarketFeed(config.tradingPairs);
    this.signals  = {};       // productId → latest signal
    this.running  = false;
    this._signalTimer = null;
    this._exitTimer   = null;
  }

  async start() {
    this.running = true;
    log.info('AGENT_START', { pairs: config.tradingPairs, authority: config.authority, dryRun: config.dryRun });

    // Start WebSocket feed
    await this.feed.start();

    // Initial signal pass immediately, then every 4h
    await this._runSignalCycle();
    this._signalTimer = setInterval(() => this._runSignalCycle(), SIGNAL_INTERVAL_MS);

    // Exit checks every 60s
    this._exitTimer = setInterval(() => this._runExitCycle(), EXIT_CHECK_INTERVAL_MS);

    log.info('AGENT_READY', {});
  }

  stop() {
    this.running = false;
    clearInterval(this._signalTimer);
    clearInterval(this._exitTimer);
    this.feed.stop();
    log.info('AGENT_STOPPED', {});
  }

  getSignals() {
    return Object.values(this.signals);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  async _runSignalCycle() {
    if (!this.running || getKillSwitch()) return;

    const priceMap = this._buildPriceMap();

    for (const productId of config.tradingPairs) {
      if (getKillSwitch()) break;

      // Skip if position already open
      if (portfolio.hasPosition(productId)) continue;

      const snap = this.feed.getSnapshot(productId);
      if (!snap) {
        log.warn('NO_SNAPSHOT', { productId });
        continue;
      }

      try {
        const signal = await generateSignal(productId, snap.price);
        this.signals[productId] = signal;

        if (signal.action === 'BUY') {
          await evaluateAndExecute(signal, snap, priceMap);
        }
      } catch (err) {
        log.error('SIGNAL_CYCLE_ERROR', { productId, error: err.message });
      }
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
