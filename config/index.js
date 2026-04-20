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

export const config = {
  // Coinbase credentials
  cbApiKeyName: optionalEnv('CB_API_KEY_NAME', ''),
  cbApiPrivateKey: optionalEnv('CB_API_PRIVATE_KEY', ''),

  // Operational mode
  dryRun: parseBool('DRY_RUN', true),
  authority: optionalEnv('AUTHORITY', 'ASSIST'), // OFF | ASSIST | AUTO

  // Trading universe
  tradingPairs: optionalEnv('TRADING_PAIRS', 'BTC-USD,ETH-USD,SOL-USD')
    .split(',').map(p => p.trim()).filter(Boolean),

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
  killSwitch: parseBool('KILL_SWITCH', false),

  // Coinbase API base
  cbRestBase: 'https://api.coinbase.com',
  cbWsUrl:    'wss://advanced-trade-ws.coinbase.com',
};

config.hasCoinbaseCredentials = Boolean(config.cbApiKeyName && config.cbApiPrivateKey);

// Validate authority value
if (!['OFF', 'ASSIST', 'AUTO'].includes(config.authority)) {
  throw new Error(`[CONFIG] AUTHORITY must be OFF, ASSIST, or AUTO. Got: "${config.authority}"`);
}

// Safety: AUTO only allowed when DRY_RUN is explicitly false
if (config.authority === 'AUTO' && config.dryRun) {
  throw new Error('[CONFIG] AUTHORITY=AUTO requires DRY_RUN=false. Set DRY_RUN=false intentionally to enable live execution.');
}

export default config;
