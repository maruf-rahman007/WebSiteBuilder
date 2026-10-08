import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

/**
 * Free models verified to follow the artifact protocol (October 2026). Used
 * when the env doesn't override them, so only the API key is required.
 */
const DEFAULT_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-s-2.1:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];
const DEFAULT_FALLBACK_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

/** Comma-separated list; empty or unset means `fallback`. */
const csvOr = (fallback: string[]) => csv.transform((list) => (list.length > 0 ? list : fallback));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODELS: csvOr(DEFAULT_MODELS),
  OPENROUTER_FALLBACK_MODELS: csvOr(DEFAULT_FALLBACK_MODELS),
  MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(16_000),
  /** Caps thinking on reasoning models so they don't spend the whole budget before writing code. */
  REASONING_EFFORT: z.enum(['default', 'low', 'medium', 'high']).default('low'),

  APP_URL: z.string().default('http://localhost:5173'),
  APP_NAME: z.string().default('Website Builder'),
  CORS_ORIGINS: csv,
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SERVE_STATIC_DIR: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  MAX_CONCURRENT_STREAMS_PER_IP: z.coerce.number().int().positive().default(2),
  GENERATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60_000),
  UPSTREAM_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  port: number;
  host: string;
  logLevel: Env['LOG_LEVEL'];
  openRouter: {
    apiKey: string;
    baseUrl: string;
    models: string[];
    fallbackModels: string[];
    maxOutputTokens: number;
    reasoningEffort: Env['REASONING_EFFORT'];
    appUrl: string;
    appName: string;
  };
  corsOrigins: string[];
  trustProxy: number;
  staticDir: string | undefined;
  limits: {
    rateLimitWindowMs: number;
    rateLimitMax: number;
    maxConcurrentStreamsPerIp: number;
    generationTimeoutMs: number;
    upstreamIdleTimeoutMs: number;
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    openRouter: {
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: env.OPENROUTER_BASE_URL.replace(/\/+$/, ''),
      models: env.OPENROUTER_MODELS,
      fallbackModels: env.OPENROUTER_FALLBACK_MODELS,
      maxOutputTokens: env.MAX_OUTPUT_TOKENS,
      reasoningEffort: env.REASONING_EFFORT,
      appUrl: env.APP_URL,
      appName: env.APP_NAME,
    },
    corsOrigins: env.CORS_ORIGINS,
    trustProxy: env.TRUST_PROXY,
    staticDir: env.SERVE_STATIC_DIR,
    limits: {
      rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
      rateLimitMax: env.RATE_LIMIT_MAX,
      maxConcurrentStreamsPerIp: env.MAX_CONCURRENT_STREAMS_PER_IP,
      generationTimeoutMs: env.GENERATION_TIMEOUT_MS,
      upstreamIdleTimeoutMs: env.UPSTREAM_IDLE_TIMEOUT_MS,
    },
  };
}
