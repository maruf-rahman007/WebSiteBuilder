import { generateRequestSchema } from '@wb/shared';
import { Router } from 'express';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';
import type { ActiveStreams } from '../http/active-streams.js';
import { concurrentStreamLimit, generationRateLimit } from '../http/rate-limit.js';
import { SseStream } from '../http/sse-stream.js';
import type { LlmProvider } from '../llm/types.js';
import { runGeneration } from '../generation/run-generation.js';

export interface GenerateRouteDeps {
  config: AppConfig;
  provider: LlmProvider;
  activeStreams: ActiveStreams;
}

export function generateRouter({ config, provider, activeStreams }: GenerateRouteDeps): Router {
  const router = Router();
  const allowedModels = new Set(config.openRouter.models);

  router.post(
    '/generate',
    generationRateLimit({
      windowMs: config.limits.rateLimitWindowMs,
      limit: config.limits.rateLimitMax,
    }),
    concurrentStreamLimit(config.limits.maxConcurrentStreamsPerIp),
    async (req, res) => {
      const parsed = generateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('bad_request', 'Invalid generation request', {
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      const model = parsed.data.model ?? config.openRouter.models[0]!;
      if (!allowedModels.has(model)) {
        throw new AppError('bad_request', `Model "${model}" is not available`);
      }

      const stream = new SseStream(res);
      const handle = activeStreams.register();
      res.once('close', () => {
        // Client went away before we finished: stop paying for tokens.
        if (!res.writableFinished) handle.abort();
        handle.release();
      });

      stream.open();
      try {
        await runGeneration({
          provider,
          request: parsed.data,
          model,
          maxOutputTokens: config.openRouter.maxOutputTokens,
          signal: handle.signal,
          totalTimeoutMs: config.limits.generationTimeoutMs,
          idleTimeoutMs: config.limits.upstreamIdleTimeoutMs,
          emit: (event) => stream.send(event),
          logger: req.log,
        });
      } finally {
        stream.end();
        handle.release();
      }
    },
  );

  return router;
}
