import type { ErrorCode, ErrorResponse } from '@wb/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  rate_limited: 429,
  too_many_streams: 429,
  upstream_rate_limited: 503,
  upstream_unavailable: 502,
  upstream_error: 502,
  quota_exceeded: 503,
  timeout: 504,
  misconfigured: 500,
  internal: 500,
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'rate_limited',
  'too_many_streams',
  'upstream_rate_limited',
  'upstream_unavailable',
  'timeout',
]);

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { cause?: unknown; details?: unknown; expose?: boolean } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    // Server-side faults hide their message unless explicitly marked safe.
    this.expose = options.expose ?? this.status < 500;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }

  get publicMessage(): string {
    return this.expose ? this.message : 'Something went wrong on our side. Please try again.';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new AppError('timeout', 'The request was aborted', { cause: error, expose: true });
  }
  return new AppError('internal', 'Unexpected error', { cause: error });
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('not_found', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // body-parser errors carry a status (400 bad JSON, 413 too large).
  const bodyError = err as { type?: string; status?: number };
  const appError =
    bodyError.type && bodyError.status && bodyError.status < 500
      ? new AppError(
          'bad_request',
          bodyError.type === 'entity.too.large'
            ? 'Request body is too large'
            : 'Malformed request body',
        )
      : toAppError(err);

  if (appError.status >= 500) req.log.error({ err }, 'request failed');
  else req.log.warn({ code: appError.code, msg: appError.message }, 'request rejected');

  if (res.headersSent) {
    res.end();
    return;
  }
  const body: ErrorResponse = {
    error: {
      code: appError.code,
      message: appError.publicMessage,
      requestId: String(req.id),
      ...(appError.expose && appError.details !== undefined ? { details: appError.details } : {}),
    },
  };
  res.status(bodyError.status === 413 ? 413 : appError.status).json(body);
};
