// src/startup.js – Startup validation
// Confirms credentials, API connectivity, and required permissions
// before the agent enters its main loop.

import 'dotenv/config';
import { validateCredentials } from './auth/index.js';
import { listAccounts } from './accounts/index.js';
import { listProducts, getPriceSnapshot } from './products/index.js';
import { cbFetch } from './rest.js';
import config from '../config/index.js';
import log from './logging/index.js';

export async function runStartupValidation() {
  const errors = [];
  const warnings = [];

  // ── 1. Config sanity ───────────────────────────────────────────────────────
  log.info('STARTUP_CONFIG', {
    dryRun:       config.dryRun,
    authority:    config.authority,
    tradingPairs: config.tradingPairs,
    killSwitch:   config.killSwitch,
  });

  if (config.dryRun) {
    warnings.push('DRY_RUN=true — orders will be previewed but not submitted.');
  } else {
    warnings.push('DRY_RUN=false — LIVE EXECUTION ENABLED.');
  }

  if (config.authority === 'OFF') {
    warnings.push('AUTHORITY=OFF — no signals or orders will be generated.');
  }

  if (config.killSwitch) {
    warnings.push('KILL_SWITCH=true — all trading halted at startup.');
  }

  // ── 2. Credential validation ───────────────────────────────────────────────
  try {
    await validateCredentials();
  } catch (err) {
    errors.push(`Credential error: ${err.message}`);
  }

  if (errors.length) {
    _fail(errors, warnings);
    return false;
  }

  // ── 3. First authenticated REST request diagnostic ──────────────────────────
  const probePath = '/api/v3/brokerage/accounts?limit=1';
  const probeHost = new URL(config.cbRestBase).host;
  log.info('STARTUP_AUTH_ENDPOINT', { host: probeHost, path: probePath });
  try {
    await cbFetch('GET', probePath);
    log.info('STARTUP_AUTH_REQUEST_RESULT', { host: probeHost, path: probePath, status: 200 });
  } catch (err) {
    const status = err?.status ?? null;
    log.warn('STARTUP_AUTH_REQUEST_RESULT', {
      host: probeHost,
      path: probePath,
      status,
      unauthorized: status === 401,
      error: err.message,
    });
    errors.push(`First authenticated request failed (${status ?? 'unknown'}): ${err.message}`);
  }

  if (errors.length) {
    _fail(errors, warnings);
    return false;
  }

  // ── 4. Account access ──────────────────────────────────────────────────────
  let accounts = [];
  try {
    accounts = await listAccounts();
    if (!accounts.length) {
      warnings.push('No accounts returned — verify API key has "view" scope.');
    }
    log.info('STARTUP_ACCOUNTS', { count: accounts.length });
  } catch (err) {
    if (err.status === 403) {
      errors.push('403 Forbidden on /accounts — API key missing "view" scope.');
    } else {
      errors.push(`Account fetch error: ${err.message}`);
    }
  }

  // ── 5. Product access ──────────────────────────────────────────────────────
  try {
    const products = await listProducts();
    log.info('STARTUP_PRODUCTS', { count: products.length });
    if (!products.length) {
      warnings.push('No products returned. Possible connectivity issue.');
    }
  } catch (err) {
    errors.push(`Product list error: ${err.message}`);
  }

  // ── 6. Price snapshot for each trading pair ────────────────────────────────
  for (const pair of config.tradingPairs) {
    try {
      const snap = await getPriceSnapshot(pair);
      if (!snap.price || snap.price <= 0) {
        warnings.push(`${pair}: price returned as ${snap.price} — check product ID.`);
      } else {
        log.info('STARTUP_PRICE_OK', { pair, price: snap.price.toFixed(2) });
      }
    } catch (err) {
      errors.push(`Price fetch failed for ${pair}: ${err.message}`);
    }
  }

  if (errors.length) {
    _fail(errors, warnings);
    return false;
  }

  log.startupOk({
    dryRun:    config.dryRun,
    authority: config.authority,
    pairs:     config.tradingPairs,
    accounts:  accounts.length,
    warnings,
  });

  for (const w of warnings) {
    log.warn('STARTUP_WARNING', { warning: w });
  }

  return true;
}

function _fail(errors, warnings) {
  log.startupFail({ errors, warnings });
  for (const e of errors) {
    process.stderr.write(`[STARTUP ERROR] ${e}\n`);
  }
  for (const w of warnings) {
    process.stderr.write(`[STARTUP WARN]  ${w}\n`);
  }
}

// Allow running directly: node src/startup.js
if (process.argv[1]?.endsWith('startup.js')) {
  runStartupValidation().then(ok => process.exit(ok ? 0 : 1));
}
