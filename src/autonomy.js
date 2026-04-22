import config from '../config/index.js';
import log from './logging/index.js';
import { getKillSwitch } from './risk/index.js';

function killSwitchActive({ includeRuntimeKillSwitch = true } = {}) {
  if (config.killSwitch) return true;
  return includeRuntimeKillSwitch && getKillSwitch();
}

export function getAutonomyBlockers(options = {}) {
  const blockers = [];
  if (killSwitchActive(options)) {
    blockers.push('KILL_SWITCH_ACTIVE');
  }
  return blockers;
}

export function getAutonomyStatus(options = {}) {
  const blockers = getAutonomyBlockers(options);
  const authorityReady = config.authority === 'AUTO';
  const killSwitchIsActive = blockers.includes('KILL_SWITCH_ACTIVE');

  const cryptoBlockedReasons = [];
  const equitiesBlockedReasons = [];

  if (killSwitchIsActive) {
    cryptoBlockedReasons.push('KILL_SWITCH_ACTIVE');
    equitiesBlockedReasons.push('KILL_SWITCH_ACTIVE');
  }

  if (!authorityReady) {
    const authorityReason = `AUTHORITY_${String(config.authority || 'UNKNOWN').toUpperCase()}`;
    cryptoBlockedReasons.push(authorityReason);
    equitiesBlockedReasons.push(authorityReason);
  }

  if (!config.cryptoAutoEnabled) {
    cryptoBlockedReasons.push('CRYPTO_AUTO_DISABLED');
  }

  if (config.cryptoAutoEnabled && !config.hasCoinbaseCredentials) {
    cryptoBlockedReasons.push('COINBASE_CREDENTIALS_MISSING');
  }

  if (!config.stockPaperEnabled) {
    equitiesBlockedReasons.push('EQUITIES_AUTO_DISABLED');
  }

  const cryptoReady = cryptoBlockedReasons.length === 0;
  const equitiesReady = equitiesBlockedReasons.length === 0;

  if (blockers.length > 0) {
    log.warn('BLOCKERS_DETECTED', { blockers });
  }
  if (!cryptoReady) {
    log.warn('CRYPTO_BLOCKED_REASON', { reasons: cryptoBlockedReasons });
  }
  if (!equitiesReady) {
    log.warn('EQUITIES_BLOCKED_REASON', { reasons: equitiesBlockedReasons });
  }

  log.info('AUTONOMY_MARKET_STATUS', {
    cryptoReady,
    equitiesReady,
    anyMarketReady: cryptoReady || equitiesReady,
  });

  return {
    cryptoReady,
    equitiesReady,
    anyMarketReady: cryptoReady || equitiesReady,
    blockers,
    markets: {
      crypto: {
        ready: cryptoReady,
        blockers: cryptoBlockedReasons,
      },
      equities: {
        ready: equitiesReady,
        blockers: equitiesBlockedReasons,
      },
    },
  };
}
