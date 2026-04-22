// src/strategy/index.js – Spot swing trading strategy
// Timeframe bias: 4h + 1d
// Entry: pullback in trend (EMA crossover + RSI dip in uptrend)
// Exit: TP, SL, trailing stop
// No leverage, no shorting.

import { getCandles } from '../products/index.js';
import log from '../logging/index.js';
import config from '../../config/index.js';

const DAY_TRADE_GRANULARITY = {
  '1m': 'ONE_MINUTE',
  '5m': 'FIVE_MINUTE',
  '15m': 'FIFTEEN_MINUTE',
};
const MICRO_TREND_THRESHOLD_PCT = 0.0008;
const MICRO_TREND_LOOKBACK_PERIODS = 4;

// ── Indicator helpers ─────────────────────────────────────────────────────────

function ema(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k);
  }
  return val;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ── Signal generation ─────────────────────────────────────────────────────────

/**
 * Analyze a single product and return a signal.
 * Signal shape:
 * { productId, action: 'BUY'|'WAIT'|'SELL', confidence, reason,
 *   entryPrice, tpPrice, slPrice, indicators }
 */
export async function generateSignal(productId, currentPrice, options = {}) {
  const mode = String(options.mode || config.strategyMode || 'SWING').toUpperCase();
  const timeframe = options.timeframe || config.dayTrade.defaultTimeframe || '1m';
  if (mode === 'DAY_TRADE') {
    return generateDayTradeSignal(productId, currentPrice, timeframe);
  }
  return generateSwingSignal(productId, currentPrice);
}

async function generateSwingSignal(productId, currentPrice) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Fetch 4h and 1d candles
    const [candles4h, candles1d] = await Promise.all([
      getCandles(productId, 'TWO_HOUR', now - 86400 * 30, now),   // ~30 days of 2h (closest to 4h available)
      getCandles(productId, 'ONE_DAY',  now - 86400 * 180, now),  // 6 months daily
    ]);

    if (candles4h.length < 50 || candles1d.length < 50) {
      return _waitSignal(productId, 'INSUFFICIENT_CANDLES', currentPrice);
    }

    // Sort oldest → newest
    candles4h.sort((a, b) => a.time - b.time);
    candles1d.sort((a, b) => a.time - b.time);

    const closes4h = candles4h.map(c => c.close);
    const closes1d = candles1d.map(c => c.close);

    // 1D trend: EMA 21 vs EMA 55
    const ema21_1d = ema(closes1d, 21);
    const ema55_1d = ema(closes1d, 55);
    const trend1d  = ema21_1d > ema55_1d ? 'UP' : 'DOWN';

    // 4H momentum: EMA 9 vs EMA 21
    const ema9_4h  = ema(closes4h, 9);
    const ema21_4h = ema(closes4h, 21);

    // RSI on 4h
    const rsi4h = rsi(closes4h, 14);

    // ATR for position sizing
    const atr4h = atr(candles4h, 14);

    const indicators = {
      trend1d, ema21_1d, ema55_1d,
      ema9_4h, ema21_4h, rsi4h, atr4h,
      currentPrice,
    };

    // ── Entry logic: pullback in uptrend ─────────────────────────────────────
    // Conditions:
    // 1. Daily trend is UP (EMA21 > EMA55 on 1d)
    // 2. 4h EMA9 crossed above EMA21 recently (momentum confirmation)
    // 3. RSI 4h is in pullback zone (30–55) — not overbought, not deeply oversold
    // 4. Price is near 4h EMA21 (within 1% — the pullback level)

    const nearEma21_4h = ema21_4h
      ? Math.abs(currentPrice - ema21_4h) / ema21_4h < 0.012
      : false;

    const bullishCross = ema9_4h > ema21_4h;
    const pullbackRsi  = rsi4h !== null && rsi4h >= 30 && rsi4h <= 58;
    const uptrend      = trend1d === 'UP';

    if (uptrend && bullishCross && pullbackRsi && nearEma21_4h) {
      const slPrice = currentPrice * (1 - config.risk.stopLossPct);
      const tpPrice = currentPrice * (1 + config.risk.takeProfitPct);

      const signal = {
        productId,
        action:     'BUY',
        confidence: _confidence(rsi4h, ema9_4h, ema21_4h, ema21_1d, ema55_1d),
        reason:     'PULLBACK_IN_UPTREND',
        entryPrice: currentPrice,
        tpPrice,
        slPrice,
        indicators,
        ts: Date.now(),
      };

      signal.indicators.regime = trend1d === 'UP' ? 'BULL' : 'BEAR';
      signal.indicators.strategyMode = 'SWING';
      log.signalGenerated(signal);
      return signal;
    }

    // ── Downtrend: no entry, wait ─────────────────────────────────────────────
    return _waitSignal(productId, trend1d === 'DOWN' ? 'REGIME_BLOCKED' : 'NO_SETUP', currentPrice, {
      ...indicators,
      regime: trend1d === 'UP' ? 'BULL' : 'BEAR',
      strategyMode: 'SWING',
    });

  } catch (err) {
    log.error('SIGNAL_ERROR', { productId, error: err.message });
    return _waitSignal(productId, 'ERROR', currentPrice);
  }
}

async function generateDayTradeSignal(productId, currentPrice, timeframe) {
  const validatedTimeframe = DAY_TRADE_GRANULARITY[timeframe] ? timeframe : '1m';
  try {
    const now = Math.floor(Date.now() / 1000);
    const granularity = DAY_TRADE_GRANULARITY[validatedTimeframe];
    const [intradayCandles, regimeCandles] = await Promise.all([
      getCandles(productId, granularity, now - 86400, now),
      getCandles(productId, 'FIFTEEN_MINUTE', now - (86400 * 3), now),
    ]);

    if (intradayCandles.length < 60 || regimeCandles.length < 60) {
      return _waitSignal(productId, 'NO_SETUP', currentPrice, {
        strategyMode: 'DAY_TRADE',
        timeframe: validatedTimeframe,
        regime: 'UNKNOWN',
      });
    }

    intradayCandles.sort((a, b) => a.time - b.time);
    regimeCandles.sort((a, b) => a.time - b.time);
    const closes = intradayCandles.map((c) => c.close);
    const regimeCloses = regimeCandles.map((c) => c.close);

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const ema34 = ema(closes, 34);
    const regimeFast = ema(regimeCloses, 21);
    const regimeSlow = ema(regimeCloses, 55);
    const intradayRsi = rsi(closes, 14);
    const intradayAtr = atr(intradayCandles, 14);

    const regime = regimeFast > regimeSlow ? 'BULL' : 'BEAR';
    const momentumBull = ema9 > ema21 && ema21 >= ema34;
    const latest = closes[closes.length - 1];
    // intradayCandles length is validated (>= 60), so this lookback index is safe in day-trade mode.
    const prior = closes[Math.max(0, closes.length - MICRO_TREND_LOOKBACK_PERIODS)];
    const microTrendPct = Number.isFinite(latest) && Number.isFinite(prior) && prior > 0
      ? (latest - prior) / prior
      : 0;
    const microTrendDetected = (ema9 >= ema21) || microTrendPct > MICRO_TREND_THRESHOLD_PCT;
    const shortTermMomentum = momentumBull || (Number.isFinite(latest) && Number.isFinite(closes[closes.length - 2]) && latest > closes[closes.length - 2]);
    const pullbackRsi = Number.isFinite(intradayRsi)
      && intradayRsi >= config.dayTrade.rsiMin
      && intradayRsi <= config.dayTrade.rsiMax;
    const nearTrend = Number.isFinite(ema21)
      && Math.abs(currentPrice - ema21) / ema21 < config.dayTrade.trendProximityPct;
    const nearTrendRelaxed = Number.isFinite(ema21)
      && Math.abs(currentPrice - ema21) / ema21 < (config.dayTrade.trendProximityPct * 1.75);
    const relaxedFallbackMin = Math.max(0.2, Number(config.dayTrade.fallbackMinConfidence || 0.28) - 0.06);
    const confidence = _dayTradeConfidence({ intradayRsi, ema9, ema21, ema34, regimeFast, regimeSlow });
    const indicators = {
      strategyMode: 'DAY_TRADE',
      timeframe: validatedTimeframe,
      regime,
      ema9,
      ema21,
      ema34,
      regimeFast,
      regimeSlow,
      intradayRsi,
      intradayAtr,
      currentPrice,
      confidence,
      momentumBull,
      shortTermMomentum,
      microTrendDetected,
      microTrendPct,
      cooldownAfterStopMs: config.dayTrade.cooldownAfterStopMs,
    };

    const primaryEntry = regime === 'BULL'
      && momentumBull
      && pullbackRsi
      && nearTrend
      && confidence >= config.dayTrade.minConfidence;
    const fallbackEntry = confidence >= relaxedFallbackMin
      && (shortTermMomentum || microTrendDetected || (pullbackRsi && nearTrendRelaxed));
    const strongBearRejection = regime !== 'BULL'
      && !shortTermMomentum
      && microTrendPct < (-MICRO_TREND_THRESHOLD_PCT);
    if (!primaryEntry && !fallbackEntry && strongBearRejection) {
      return _waitSignal(productId, 'REGIME_BLOCKED', currentPrice, indicators);
    }
    if (!primaryEntry && !fallbackEntry) {
      return _waitSignal(productId, 'NO_SETUP', currentPrice, indicators);
    }

    const signal = {
      productId,
      action: 'BUY',
      confidence,
      reason: primaryEntry ? 'DAY_TRADE_PULLBACK' : 'DAY_TRADE_MOMENTUM_FALLBACK',
      entryPrice: currentPrice,
      tpPrice: currentPrice * (1 + config.dayTrade.takeProfitPct),
      slPrice: currentPrice * (1 - config.dayTrade.stopLossPct),
      indicators: {
        ...indicators,
        entryMode: primaryEntry ? 'PRIMARY' : 'FALLBACK',
      },
      ts: Date.now(),
    };
    log.signalGenerated(signal);
    return signal;
  } catch (err) {
    log.error('DAY_TRADE_SIGNAL_ERROR', { productId, timeframe: validatedTimeframe, error: err.message });
    return _waitSignal(productId, 'ERROR', currentPrice, {
      strategyMode: 'DAY_TRADE',
      timeframe: validatedTimeframe,
      regime: 'UNKNOWN',
    });
  }
}

function _waitSignal(productId, reason, price, indicators = {}) {
  return { productId, action: 'WAIT', confidence: 0, reason, entryPrice: price, indicators, ts: Date.now() };
}

function _confidence(rsi4h, ema9, ema21, ema21_1d, ema55_1d) {
  let score = 0;
  // RSI in sweet spot (40–52)
  if (rsi4h >= 40 && rsi4h <= 52) score += 0.35;
  else score += 0.15;
  // Strong EMA separation on 4h
  if ((ema9 - ema21) / ema21 > 0.002) score += 0.25;
  else score += 0.10;
  // Strong daily trend
  if ((ema21_1d - ema55_1d) / ema55_1d > 0.02) score += 0.40;
  else score += 0.20;
  return Math.min(1, parseFloat(score.toFixed(2)));
}

function _dayTradeConfidence({ intradayRsi, ema9, ema21, ema34, regimeFast, regimeSlow }) {
  let score = 0;
  if (intradayRsi >= 40 && intradayRsi <= 68) score += 0.32;
  else score += 0.18;
  if ((ema9 - ema21) / Math.max(ema21, 1) > 0.0006) score += 0.30;
  else score += 0.16;
  if ((regimeFast - regimeSlow) / Math.max(regimeSlow, 1) > 0.0015) score += 0.22;
  else score += 0.14;
  if (ema21 >= ema34) score += 0.16;
  else score += 0.08;
  return Math.min(1, Number(score.toFixed(2)));
}

/**
 * Check exit conditions for an open position.
 * Returns { shouldExit, reason, exitPrice } or null.
 */
export function checkExits(position, currentPrice) {
  if (!position) return null;

  // Hard stop loss
  if (currentPrice <= position.slPrice) {
    return { shouldExit: true, reason: 'stop_loss', exitPrice: currentPrice };
  }

  // Take profit
  if (currentPrice >= position.tpPrice) {
    return { shouldExit: true, reason: 'take_profit', exitPrice: currentPrice };
  }

  // Trailing stop (only activates after price moves up by trailingStopPct)
  const activationPrice = position.entryPrice * (1 + config.risk.trailingStopPct);
  if (position.trailingStopPrice && currentPrice >= activationPrice) {
    if (currentPrice <= position.trailingStopPrice) {
      return { shouldExit: true, reason: 'trailing_stop', exitPrice: currentPrice };
    }
  }

  return { shouldExit: false };
}
