// src/logging/index.js – Structured audit logger
// All events are written as newline-delimited JSON to stdout.
// Consumer can pipe to a file, Loki, Datadog, etc.

import config from '../../config/index.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, event, data = {}) {
  if ((LEVELS[level] ?? 0) < configuredLevel) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  // Use stderr for errors so stdout stays clean JSON for consumers
  const out = level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

// ── Public interface ──────────────────────────────────────────────────────────

export const log = {
  debug: (event, data)  => emit('debug', event, data),
  info:  (event, data)  => emit('info',  event, data),
  warn:  (event, data)  => emit('warn',  event, data),
  error: (event, data)  => emit('error', event, data),

  // Semantic audit events
  authSuccess: (data)         => emit('info',  'AUTH_SUCCESS', data),
  authFailure: (data)         => emit('error', 'AUTH_FAILURE', data),
  signalGenerated: (data)     => emit('info',  'SIGNAL_GENERATED', data),
  orderPreview: (data)        => emit('info',  'ORDER_PREVIEW', data),
  orderSubmitted: (data)      => emit('info',  'ORDER_SUBMITTED', data),
  orderRejected: (data)       => emit('warn',  'ORDER_REJECTED', data),
  fillReceived: (data)        => emit('info',  'FILL_RECEIVED', data),
  stopTriggered: (data)       => emit('warn',  'STOP_TRIGGERED', data),
  takeProfitTriggered: (data) => emit('info',  'TAKE_PROFIT_TRIGGERED', data),
  riskBlocked: (data)         => emit('warn',  'RISK_BLOCKED', data),
  killSwitch: (data)          => emit('error', 'KILL_SWITCH_ACTIVATED', data),
  startupOk: (data)           => emit('info',  'STARTUP_VALIDATION_OK', data),
  startupFail: (data)         => emit('error', 'STARTUP_VALIDATION_FAIL', data),
  wsConnected: (data)         => emit('info',  'WS_CONNECTED', data),
  wsDisconnected: (data)      => emit('warn',  'WS_DISCONNECTED', data),
  wsFallback: (data)          => emit('warn',  'WS_FALLBACK_TO_REST', data),
};

export default log;
