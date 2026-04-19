// src/portfolio/index.js – In-memory portfolio state tracker
// Tracks open positions, daily P&L, cooldowns, and stop/TP levels.

import log from '../logging/index.js';
import config from '../../config/index.js';

// Position schema:
// { productId, side, entryPrice, baseSize, quoteSpent, tpPrice, slPrice,
//   trailingStopPrice, openedAt, orderId, status }

class PortfolioState {
  constructor() {
    this.positions = new Map();     // productId → position
    this.dailyLossUsd = 0;
    this.dailyLossResetAt = _todayMidnight();
    this.stopCooldowns = new Map(); // productId → timestamp of last stop-out
  }

  // ── Positions ─────────────────────────────────────────────────────────────

  openPosition(pos) {
    this.positions.set(pos.productId, { ...pos, status: 'open', openedAt: Date.now() });
    log.info('POSITION_OPENED', { pos });
  }

  closePosition(productId, exitPrice, reason) {
    const pos = this.positions.get(productId);
    if (!pos) return;

    const pnl = (exitPrice - pos.entryPrice) * pos.baseSize;
    this.positions.delete(productId);

    if (pnl < 0) {
      this._accumulateDailyLoss(Math.abs(pnl));
    }

    if (reason === 'stop_loss' || reason === 'stop_out') {
      this.stopCooldowns.set(productId, Date.now());
      log.stopTriggered({ productId, entryPrice: pos.entryPrice, exitPrice, pnl, reason });
    } else if (reason === 'take_profit') {
      log.takeProfitTriggered({ productId, entryPrice: pos.entryPrice, exitPrice, pnl });
    } else {
      log.info('POSITION_CLOSED', { productId, exitPrice, pnl, reason });
    }

    return { pos, exitPrice, pnl, reason };
  }

  updateTrailingStop(productId, currentPrice) {
    const pos = this.positions.get(productId);
    if (!pos) return;

    const newTrailing = currentPrice * (1 - config.risk.trailingStopPct);
    if (!pos.trailingStopPrice || newTrailing > pos.trailingStopPrice) {
      pos.trailingStopPrice = newTrailing;
    }
  }

  getPosition(productId) {
    return this.positions.get(productId) ?? null;
  }

  getAllPositions() {
    return Array.from(this.positions.values());
  }

  hasPosition(productId) {
    return this.positions.has(productId);
  }

  // ── Daily loss tracking ───────────────────────────────────────────────────

  _accumulateDailyLoss(amount) {
    const today = _todayMidnight();
    if (today > this.dailyLossResetAt) {
      this.dailyLossUsd = 0;
      this.dailyLossResetAt = today;
    }
    this.dailyLossUsd += amount;
    log.warn('DAILY_LOSS_UPDATED', { total: this.dailyLossUsd.toFixed(2), limit: config.risk.maxDailyLossUsd });
  }

  getDailyLoss() {
    const today = _todayMidnight();
    if (today > this.dailyLossResetAt) {
      this.dailyLossUsd = 0;
      this.dailyLossResetAt = today;
    }
    return this.dailyLossUsd;
  }

  // ── Cooldowns ─────────────────────────────────────────────────────────────

  isInCooldown(productId) {
    const ts = this.stopCooldowns.get(productId);
    if (!ts) return false;
    return Date.now() - ts < config.risk.cooldownAfterStopMs;
  }

  cooldownRemaining(productId) {
    const ts = this.stopCooldowns.get(productId);
    if (!ts) return 0;
    return Math.max(0, config.risk.cooldownAfterStopMs - (Date.now() - ts));
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  snapshot() {
    return {
      positions:    this.getAllPositions(),
      dailyLossUsd: this.getDailyLoss(),
      cooldowns:    Object.fromEntries(
        Array.from(this.stopCooldowns.entries()).map(([k, v]) => [k, {
          since: new Date(v).toISOString(),
          remainingMs: this.cooldownRemaining(k),
        }])
      ),
    };
  }
}

function _todayMidnight() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

// Singleton
export const portfolio = new PortfolioState();
export default portfolio;
