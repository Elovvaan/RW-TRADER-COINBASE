import config from '../config/index.js';
import { getKillSwitch } from './risk/index.js';

export function getAutonomyBlockers({ includeRuntimeKillSwitch = true } = {}) {
  const blockers = [];

  if (config.authority !== 'AUTO') {
    blockers.push(`AUTHORITY=${config.authority} (requires AUTHORITY=AUTO for autonomous execution)`);
  }

  if (config.dryRun) {
    blockers.push('DRY_RUN=true (set DRY_RUN=false to allow live order submission)');
  }

  if (!config.cryptoAutoEnabled) {
    blockers.push('CRYPTO_AUTO_ENABLED=false (crypto signal/execution loop is disabled)');
  }

  if (!config.hasCoinbaseCredentials) {
    blockers.push('Coinbase credentials missing (CB_API_KEY_NAME/CB_API_PRIVATE_KEY)');
  }

  if (config.killSwitch) {
    blockers.push('GLOBAL_KILL_SWITCH=true (startup kill switch is armed)');
  }

  if (includeRuntimeKillSwitch && getKillSwitch()) {
    blockers.push('Runtime kill switch is armed');
  }

  return blockers;
}

export function getAutonomyStatus(options = {}) {
  const blockers = getAutonomyBlockers(options);
  return {
    autonomousTradingReady: blockers.length === 0,
    blockers,
  };
}
