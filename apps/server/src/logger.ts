import { pino, type Logger } from 'pino';
import type { AppConfig } from './config.js';

export type { Logger };

export function createLogger(config: Pick<AppConfig, 'env' | 'logLevel'>): Logger {
  return pino({
    level: config.env === 'test' ? 'silent' : config.logLevel,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey'],
      censor: '[redacted]',
    },
    ...(config.env === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } } }
      : {}),
  });
}
