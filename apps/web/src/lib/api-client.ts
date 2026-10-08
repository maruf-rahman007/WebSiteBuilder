import {
  SseDecoder,
  STREAM_PROTOCOL_VERSION,
  streamEventSchema,
  type ErrorCode,
  type ErrorResponse,
  type GenerateRequest,
  type ModelsResponse,
  type StreamEvent,
} from '@wb/shared';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'network',
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorResponse;
    if (body.error?.message) {
      return new ApiError(
        body.error.code,
        body.error.message,
        RETRYABLE_STATUS.has(response.status),
        response.status,
      );
    }
  } catch {
    // Non-JSON error body (proxy error page, etc.)
  }
  return new ApiError(
    'internal',
    `Request failed with status ${response.status}`,
    RETRYABLE_STATUS.has(response.status),
    response.status,
  );
}

export async function fetchModels(signal?: AbortSignal): Promise<ModelsResponse> {
  const response = await fetch(`${API_BASE}/api/models`, signal ? { signal } : {});
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as ModelsResponse;
}

/**
 * Starts a generation and yields typed events as they arrive. Throws
 * `ApiError` for HTTP failures and for streams that end unexpectedly, and
 * the native `AbortError` when `signal` is aborted.
 */
export async function* streamGeneration(
  body: GenerateRequest,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(
      'network',
      'Could not reach the server. Check your connection and try again.',
      true,
    );
  }

  if (!response.ok || !response.body) throw await toApiError(response);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const decoder = new SseDecoder();
  let terminal = false;

  const parse = function* (data: string): Generator<StreamEvent> {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const result = streamEventSchema.safeParse(json);
    // Unknown event types are skipped so newer servers don't break older clients.
    if (!result.success) return;
    const event = result.data;
    if (event.type === 'run.started' && event.protocolVersion !== STREAM_PROTOCOL_VERSION) {
      throw new ApiError('internal', 'The app was updated. Please reload the page.', false);
    }
    if (event.type === 'run.completed' || event.type === 'run.error') terminal = true;
    yield event;
  };

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ApiError('network', 'The connection to the server was interrupted.', true);
      }
      if (chunk.done) break;
      for (const message of decoder.push(chunk.value)) yield* parse(message.data);
    }
    for (const message of decoder.flush()) yield* parse(message.data);
  } finally {
    reader.releaseLock();
  }

  if (!terminal) {
    throw new ApiError('network', 'The response ended unexpectedly. Please try again.', true);
  }
}
