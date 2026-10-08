import type { ModelsResponse } from '@wb/shared';
import { Router } from 'express';
import type { AppConfig } from '../config.js';

export function metaRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  router.get('/models', (_req, res) => {
    const body: ModelsResponse = {
      models: config.openRouter.models.map((id) => ({ id, label: modelLabel(id) })),
      defaultModel: config.openRouter.models[0]!,
    };
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(body);
  });

  return router;
}

/** `poolside/laguna-s-2.1:free` -> `Laguna S 2.1 (free)` */
export function modelLabel(id: string): string {
  const [name = id, variant] = (id.split('/').pop() ?? id).split(':');
  const pretty = name
    .split('-')
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
  return variant ? `${pretty} (${variant})` : pretty;
}
