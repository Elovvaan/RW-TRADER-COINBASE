// config/index.js – Central configuration loader
// All values from environment; no hardcoded secrets or defaults that mask misconfiguration.

import 'dotenv/config';

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`[CONFIG] Missing required environment variable: ${key}`);
  return val;
}

function optionalEnv(key, fallback) {
  return process.env[key] ?? fallback;
}

function parseFloat_(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  if (isNaN(n)) throw new Error(`[CONFIG] ${key} must be a number, got: "${v}"`);
  return n;
}

function parseInt_(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`[CONFIG] ${key} must be an integer, got: "${v}"`);
  return n;
}

function parseBool(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`[CONFIG] ${key} must be "true" or "false", got: "${v}"`);
}

function parseBoolAliases(keys, fallback) {
  for (const key of keys) {
    const v = process.env[key];
    if (v === undefined || v === '') continue;
    if (v === 'true') return true;
    if (v === 'false') return false;
    throw new Error(`[CONFIG] ${key} must be "true" or "false", got: "${v}"`);
  }
  return fallback;
}

function parseCsv(key, fallback) {
  return optionalEnv(key, fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  // Coinbase credentials
  cbApiKeyName: optionalEnv('CB_API_KEY_NAME', ''),
  cbApiPrivateKey: optionalEnv('CB_API_PRIVATE_KEY', ''),

  // Operational mode
  dryRun: parseBool('DRY_RUN', true),
  authority: optionalEnv('AUTHORITY', 'ASSIST'), // OFF | ASSIST | AUTO
  strategyMode: optionalEnv('STRATEGY_MODE', 'SWING').toUpperCase(), // SWING | DAY_TRADE
  scanIntervalMs: parseInt_('SCAN_INTERVAL_MS', 60000),
  signalConfidenceThreshold: parseFloat_('SIGNAL_CONFIDENCE_THRESHOLD', 0),
  cryptoAutoEnabled: parseBoolAliases(['CRYPTO_AUTO_ENABLED', 'ENABLE_CRYPTO'], true),
  stockPaperEnabled: parseBoolAliases(['STOCK_PAPER_ENABLED', 'ENABLE_EQUITIES'], true),
  enableCrypto: parseBoolAliases(['CRYPTO_AUTO_ENABLED', 'ENABLE_CRYPTO'], true),
  enableEquities: parseBoolAliases(['STOCK_PAPER_ENABLED', 'ENABLE_EQUITIES'], true),

  // Trading universe
  tradingPairs: parseCsv('TRADING_PAIRS', 'BTC-USD,ETH-USD,SOL-USD'),
  stockSymbols: parseCsv('STOCK_SYMBOLS', 'AAPL,NVDA,TSLA,SPY'),

  // Risk
  risk: {
    maxPortfolioPctPerTrade: parseFloat_('MAX_PORTFOLIO_PCT_PER_TRADE', 0.05),
    maxDollarLossPerTrade:   parseFloat_('MAX_DOLLAR_LOSS_PER_TRADE', 50),
    maxDailyLossUsd:         parseFloat_('MAX_DAILY_LOSS_USD', 150),
    stalePriceThresholdMs:   parseInt_('STALE_PRICE_THRESHOLD_MS', 30000),
    maxSpreadPct:            parseFloat_('MAX_SPREAD_PCT', 0.005),
    cooldownAfterStopMs:     parseInt_('COOLDOWN_AFTER_STOP_MS', 3600000),
    takeProfitPct:           parseFloat_('TAKE_PROFIT_PCT', 0.04),
    stopLossPct:             parseFloat_('STOP_LOSS_PCT', 0.02),
    trailingStopPct:         parseFloat_('TRAILING_STOP_PCT', 0.015),
  },

  // Server
  port: parseInt_('PORT', 3000),
  host: optionalEnv('HOST', '0.0.0.0'),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),

  // Kill switch
  globalKillSwitch: parseBoolAliases(['GLOBAL_KILL_SWITCH', 'KILL_SWITCH'], false),
  killSwitch: parseBoolAliases(['GLOBAL_KILL_SWITCH', 'KILL_SWITCH'], false),

  // Coinbase API base
  cbRestBase: 'https://api.coinbase.com',
  cbWsUrl:    'wss://advanced-trade-ws.coinbase.com',

  // Unified portfolio allocator
  allocator: {
    maxTotalDailyLossUsd: parseFloat_('MAX_TOTAL_DAILY_LOSS_USD', 150),
    maxCryptoAllocation: parseFloat_('MAX_CRYPTO_ALLOCATION', 1),
    maxEquitiesAllocation: parseFloat_('MAX_EQUITIES_ALLOCATION', 0.4),
    perPositionMaxRisk: parseFloat_('PER_POSITION_MAX_RISK', 0.02),
    targetNotionalPct: parseFloat_('TARGET_NOTIONAL_PCT', 0.1),
  },

  execution: {
    cryptoAllowPyramiding: parseBool('CRYPTO_ALLOW_PYRAMIDING', false),
    stockAllowPyramiding: parseBool('STOCK_ALLOW_PYRAMIDING', false),
  },

  dayTrade: {
    scanIntervalMs: parseInt_('DAY_TRADE_SCAN_INTERVAL_MS', 15000),
    defaultTimeframe: optionalEnv('DAY_TRADE_TIMEFRAME', '1m'),
    minConfidence: parseFloat_('DAY_TRADE_MIN_CONFIDENCE', 0.4),
    fallbackMinConfidence: parseFloat_('DAY_TRADE_FALLBACK_MIN_CONFIDENCE', 0.35),
    takeProfitPct: parseFloat_('DAY_TRADE_TAKE_PROFIT_PCT', 0.012),
    stopLossPct: parseFloat_('DAY_TRADE_STOP_LOSS_PCT', 0.006),
    trendProximityPct: parseFloat_('DAY_TRADE_TREND_PROXIMITY_PCT', 0.008),
    rsiMin: parseFloat_('DAY_TRADE_RSI_MIN', 40),
    rsiMax: parseFloat_('DAY_TRADE_RSI_MAX', 68),
    maxTradesPerSession: parseInt_('DAY_TRADE_MAX_TRADES_PER_SESSION', 12),
    maxOpenPositions: parseInt_('DAY_TRADE_MAX_OPEN_POSITIONS', 2),
    cooldownAfterStopMs: parseInt_('DAY_TRADE_COOLDOWN_AFTER_STOP_MS', 600000), // Reduced from 30m to 10m to avoid inactivity deadlock after stop-outs.
    sessionDurationMs: parseInt_('DAY_TRADE_SESSION_DURATION_MS', 28800000),
    inactivityForceTradeMs: parseInt_('DAY_TRADE_INACTIVITY_FORCE_TRADE_MS', 3600000),
    idleCapitalThresholdPct: parseFloat_('DAY_TRADE_IDLE_CAPITAL_THRESHOLD_PCT', 0.7),
    idleCapitalWindowMs: parseInt_('DAY_TRADE_IDLE_CAPITAL_WINDOW_MS', 3600000),
    minTradesTarget: parseInt_('DAY_TRADE_MIN_TRADES_TARGET', 1),
    maxThresholdRelaxation: parseFloat_('DAY_TRADE_MAX_THRESHOLD_RELAXATION', 0.08),
  },

  smallAccount: {
    equityThresholdUsd: parseFloat_('SMALL_ACCOUNT_EQUITY_THRESHOLD_USD', 500),
    lowEquitySinglePositionUsd: parseFloat_('SMALL_ACCOUNT_LOW_EQUITY_SINGLE_POSITION_USD', 250),
    minPositionPct: parseFloat_('SMALL_ACCOUNT_MIN_POSITION_PCT', 0.2),
    maxPositionPct: parseFloat_('SMALL_ACCOUNT_MAX_POSITION_PCT', 0.5),
    maxOpenPositions: parseInt_('SMALL_ACCOUNT_MAX_OPEN_POSITIONS', 2),
    duplicateWindowMs: parseInt_('SMALL_ACCOUNT_DUPLICATE_WINDOW_MS', 300000),
    maxSingleTradeCashPct: parseFloat_('MAX_SINGLE_TRADE_CASH_PCT', 0.95),
  },

  // Stock broker adapter
  stockBroker: {
    name: optionalEnv('STOCK_BROKER_NAME', 'paper-stock'),
    minOrderUsd: parseFloat_('STOCK_MIN_ORDER_USD', 1),
    startingCashUsd: parseFloat_('STOCK_STARTING_CASH_USD', 100000),
    priceAnchors: {
      AAPL: parseFloat_('STOCK_ANCHOR_AAPL', 180),
      NVDA: parseFloat_('STOCK_ANCHOR_NVDA', 900),
      TSLA: parseFloat_('STOCK_ANCHOR_TSLA', 180),
      SPY: parseFloat_('STOCK_ANCHOR_SPY', 500),
    },
  },
};

config.hasCoinbaseCredentials = Boolean(config.cbApiKeyName && config.cbApiPrivateKey);

// Validate authority value
if (!['OFF', 'ASSIST', 'AUTO'].includes(config.authority)) {
  throw new Error(`[CONFIG] AUTHORITY must be OFF, ASSIST, or AUTO. Got: "${config.authority}"`);
}

if (!['SWING', 'DAY_TRADE'].includes(config.strategyMode)) {
  throw new Error(`[CONFIG] STRATEGY_MODE must be SWING or DAY_TRADE. Got: "${config.strategyMode}"`);
}

if (config.scanIntervalMs <= 0) {
  throw new Error(`[CONFIG] SCAN_INTERVAL_MS must be > 0. Got: "${config.scanIntervalMs}"`);
}

if (config.signalConfidenceThreshold < 0 || config.signalConfidenceThreshold > 1) {
  throw new Error(`[CONFIG] SIGNAL_CONFIDENCE_THRESHOLD must be between 0 and 1. Got: "${config.signalConfidenceThreshold}"`);
}

if (!config.cryptoAutoEnabled && !config.stockPaperEnabled) {
  throw new Error('[CONFIG] At least one market must be enabled (CRYPTO_AUTO_ENABLED or STOCK_PAPER_ENABLED).');
}

if (config.allocator.maxCryptoAllocation < 0 || config.allocator.maxCryptoAllocation > 1) {
  throw new Error(`[CONFIG] MAX_CRYPTO_ALLOCATION must be between 0 and 1. Got: "${config.allocator.maxCryptoAllocation}"`);
}

if (config.allocator.maxEquitiesAllocation < 0 || config.allocator.maxEquitiesAllocation > 1) {
  throw new Error(`[CONFIG] MAX_EQUITIES_ALLOCATION must be between 0 and 1. Got: "${config.allocator.maxEquitiesAllocation}"`);
}

if (config.allocator.perPositionMaxRisk <= 0 || config.allocator.perPositionMaxRisk > 1) {
  throw new Error(`[CONFIG] PER_POSITION_MAX_RISK must be > 0 and <= 1. Got: "${config.allocator.perPositionMaxRisk}"`);
}

// Safety: AUTO only allowed when DRY_RUN is explicitly false
if (config.authority === 'AUTO' && config.dryRun) {
  throw new Error('[CONFIG] AUTHORITY=AUTO requires DRY_RUN=false. Set DRY_RUN=false intentionally to enable live execution.');
}

if ((process.env.ENABLE_CRYPTO ?? '') !== '' && (process.env.CRYPTO_AUTO_ENABLED ?? '') === '') {
  process.stderr.write('[CONFIG] ENABLE_CRYPTO is deprecated; use CRYPTO_AUTO_ENABLED.\n');
}
if ((process.env.ENABLE_EQUITIES ?? '') !== '' && (process.env.STOCK_PAPER_ENABLED ?? '') === '') {
  process.stderr.write('[CONFIG] ENABLE_EQUITIES is deprecated; use STOCK_PAPER_ENABLED.\n');
}
if ((process.env.KILL_SWITCH ?? '') !== '' && (process.env.GLOBAL_KILL_SWITCH ?? '') === '') {
  process.stderr.write('[CONFIG] KILL_SWITCH is deprecated; use GLOBAL_KILL_SWITCH.\n');
}

export default config;
