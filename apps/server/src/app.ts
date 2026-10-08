import { randomUUID } from 'node:crypto';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { ActiveStreams } from './http/active-streams.js';
import type { LlmProvider } from './llm/types.js';
import type { Logger } from './logger.js';
import { generateRouter } from './routes/generate.js';
import { metaRouter } from './routes/meta.js';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  provider: LlmProvider;
  activeStreams?: ActiveStreams;
}

export function createApp({
  config,
  logger,
  provider,
  activeStreams = new ActiveStreams(),
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      // Keep access logs lean: no header dumps (and never cookies/auth).
      serializers: {
        req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          ip: req.remoteAddress,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // --- API ---------------------------------------------------------------
  const api = express.Router();
  api.use(helmet());
  if (config.corsOrigins.length > 0) {
    api.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'], maxAge: 600 }));
  }
  api.use(express.json({ limit: '4mb' }));
  api.use(metaRouter(config));
  api.use(generateRouter({ config, provider, activeStreams }));
  api.use(notFoundHandler);
  app.use('/api', api);

  // --- Optional static hosting of the built web app ---------------------
  if (config.staticDir) {
    const root = path.resolve(config.staticDir);
    app.use(
      helmet({
        // WebContainers need cross-origin isolation. CSP is left off because
        // the runtime loads code from StackBlitz origins it controls.
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: { policy: 'require-corp' },
        crossOriginOpenerPolicy: { policy: 'same-origin' },
      }),
    );
    app.use(
      express.static(root, {
        index: false,
        setHeaders: (res, file) => {
          const immutable = file.includes(`${path.sep}assets${path.sep}`);
          res.setHeader(
            'Cache-Control',
            immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      }),
    );
    // SPA fallback
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(root, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
