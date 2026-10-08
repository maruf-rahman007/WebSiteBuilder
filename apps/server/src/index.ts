import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { ActiveStreams } from './http/active-streams.js';
import { OpenRouterProvider } from './llm/openrouter.js';
import { createLogger } from './logger.js';

const SHUTDOWN_GRACE_MS = 10_000;

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config);
  const activeStreams = new ActiveStreams();
  const provider = new OpenRouterProvider({
    apiKey: config.openRouter.apiKey,
    baseUrl: config.openRouter.baseUrl,
    appUrl: config.openRouter.appUrl,
    appName: config.openRouter.appName,
    fallbackModels: config.openRouter.fallbackModels,
    reasoningEffort: config.openRouter.reasoningEffort,
    logger,
  });

  const app = createApp({ config, logger, provider, activeStreams });
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, models: config.openRouter.models }, 'server listening');
  });
  // Generations stream for minutes; don't let Node's defaults cut them off.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 65_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, activeStreams: activeStreams.size }, 'shutting down');
    activeStreams.abortAll();
    server.close((err) => {
      if (err) logger.error({ err }, 'error during shutdown');
      process.exit(err ? 1 : 0);
    });
    server.closeIdleConnections();
    setTimeout(() => {
      logger.warn('forcing shutdown');
      server.closeAllConnections();
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) =>
    logger.error({ err: reason }, 'unhandled rejection'),
  );
}

try {
  main();
} catch (error) {
  // Config errors happen before the logger exists.
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
