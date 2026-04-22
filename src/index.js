// src/index.js – Entry point
import 'dotenv/config';
import { runStartupValidation } from './startup.js';
import { TradingAgent } from './agent.js';
import { createApiServer, attachAgent } from './server.js';
import config from '../config/index.js';
import log from './logging/index.js';

async function main() {
  log.info('BOOT', { pid: process.pid, node: process.version });

  const server = createApiServer();
  server.listen(config.port, config.host, () => {
    const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
    log.info('HTTP_LISTEN', {
      host: config.host,
      port: config.port,
      dashboard: `http://${displayHost}:${config.port}/`,
      health: `http://${displayHost}:${config.port}/health`,
    });
  });

  let agent = null;
  const cryptoEnabled = config.enableCrypto;
  const equitiesEnabled = config.enableEquities;

  if (cryptoEnabled && !config.hasCoinbaseCredentials) {
    log.warn('STARTUP_DEGRADED', {
      reason: equitiesEnabled
        ? 'Coinbase credentials missing. Crypto execution disabled; equities execution remains available.'
        : 'Coinbase credentials missing. Agent disabled; API/health endpoints remain available.',
    });
  }

  const canRunCrypto = cryptoEnabled && config.hasCoinbaseCredentials;
  const canRunEquities = equitiesEnabled;
  if (canRunCrypto || canRunEquities) {
    if (cryptoEnabled && config.hasCoinbaseCredentials) {
      const ok = await runStartupValidation();
      if (!ok) {
        log.warn('STARTUP_DEGRADED', {
          reason: 'Startup validation failed. Trading agent disabled; API/health endpoints remain available.',
        });
        if (!equitiesEnabled) return;
      }
    }

    agent = new TradingAgent();
    attachAgent(agent);
    await agent.start();
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    log.info('SHUTDOWN', { signal });
    if (agent) agent.stop();
    server.close(() => {
      log.info('SHUTDOWN_COMPLETE', {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    log.error('UNCAUGHT_EXCEPTION', { error: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    log.error('UNHANDLED_REJECTION', { reason: String(reason) });
  });
}

main().catch(err => {
  process.stderr.write(`[FATAL] ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
