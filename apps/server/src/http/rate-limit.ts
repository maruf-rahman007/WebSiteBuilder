import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors.js';

/**
 * Per-IP request budget for generations. Uses the in-memory store, which is
 * correct for a single instance; swap in a Redis store before scaling out.
 */
export function generationRateLimit(options: { windowMs: number; limit: number }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next, opts) => {
      const minutes = Math.ceil(opts.windowMs / 60_000);
      next(
        new AppError(
          'rate_limited',
          `You've reached the limit of ${opts.limit} generations per ${minutes} minutes. Please wait a bit.`,
        ),
      );
    },
  });
}

/** Caps simultaneous open generation streams per client IP. */
export function concurrentStreamLimit(maxPerIp: number): RequestHandler {
  const active = new Map<string, number>();
  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const current = active.get(key) ?? 0;
    if (current >= maxPerIp) {
      next(
        new AppError(
          'too_many_streams',
          'Another generation is still running. Wait for it to finish.',
        ),
      );
      return;
    }
    active.set(key, current + 1);
    res.once('close', () => {
      const remaining = (active.get(key) ?? 1) - 1;
      if (remaining <= 0) active.delete(key);
      else active.set(key, remaining);
    });
    next();
  };
}
