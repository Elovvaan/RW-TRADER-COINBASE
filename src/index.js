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

  if (config.hasCoinbaseCredentials) {
    const ok = await runStartupValidation();
    if (!ok) {
      process.stderr.write('[BOOT] Startup validation failed. Exiting.\n');
      process.exit(1);
    }

    agent = new TradingAgent();
    attachAgent(agent);
    await agent.start();
  } else {
    log.warn('STARTUP_DEGRADED', {
      reason: 'Coinbase credentials missing. Agent disabled; API/health endpoints remain available.',
    });
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
