import { SseDecoder, type Usage } from '@wb/shared';
import { AppError } from '../errors.js';
import type { Logger } from '../logger.js';
import type { ChatStreamChunk, ChatStreamRequest, LlmProvider } from './types.js';

export interface OpenRouterOptions {
  apiKey: string;
  baseUrl: string;
  appUrl: string;
  appName: string;
  /** Extra models OpenRouter tries, in order, if the requested one fails. */
  fallbackModels: string[];
  /** `default` leaves reasoning to the model's own default. */
  reasoningEffort: 'default' | 'low' | 'medium' | 'high';
  logger: Logger;
  fetch?: typeof fetch;
}

interface OpenRouterChunk {
  model?: string;
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { code?: number | string; message?: string };
}

export class OpenRouterProvider implements LlmProvider {
  readonly name = 'openrouter';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenRouterOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async *streamChat(request: ChatStreamRequest): AsyncIterable<ChatStreamChunk> {
    const fallbacks = this.options.fallbackModels.filter((m) => m !== request.model);
    const body = {
      model: request.model,
      ...(fallbacks.length > 0 ? { models: [request.model, ...fallbacks] } : {}),
      messages: request.messages,
      stream: true,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.2,
      usage: { include: true },
      ...(this.options.reasoningEffort !== 'default'
        ? { reasoning: { effort: this.options.reasoningEffort } }
        : {}),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.options.appUrl,
          'X-Title': this.options.appName,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal.aborted) throw error;
      throw new AppError('upstream_unavailable', 'Could not reach the model provider', {
        cause: error,
        expose: true,
      });
    }

    if (!response.ok || !response.body) {
      throw await this.toHttpError(response);
    }

    const decoder = new SseDecoder();
    const textDecoder = new TextDecoder();
    // Mutated from the frame handler below; an object keeps TS from narrowing it.
    const state: { finishReason: string | null; usage?: Usage; model?: string } = {
      finishReason: null,
    };

    const handle = function* (data: string): Generator<ChatStreamChunk> {
      if (data === '[DONE]') return;
      let chunk: OpenRouterChunk;
      try {
        chunk = JSON.parse(data) as OpenRouterChunk;
      } catch {
        return; // tolerate a malformed keep-alive frame
      }
      if (chunk.error) {
        // Errors after the stream started arrive as a regular data frame.
        throw mapUpstreamError(Number(chunk.error.code) || 502, chunk.error.message);
      }
      if (chunk.model && chunk.model !== state.model) {
        state.model = chunk.model;
        yield { type: 'model', model: chunk.model };
      }
      const choice = chunk.choices?.[0];
      if (choice?.delta?.reasoning) yield { type: 'reasoning', text: choice.delta.reasoning };
      if (choice?.delta?.content) yield { type: 'content', text: choice.delta.content };
      if (choice?.finish_reason) state.finishReason = choice.finish_reason;
      if (chunk.usage) {
        state.usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    };

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const message of decoder.push(textDecoder.decode(value, { stream: true }))) {
          yield* handle(message.data);
        }
      }
      for (const message of decoder.push(textDecoder.decode()).concat(decoder.flush())) {
        yield* handle(message.data);
      }
    } finally {
      reader.releaseLock();
      if (!request.signal.aborted) response.body.cancel().catch(() => undefined);
    }

    yield {
      type: 'finish',
      reason: state.finishReason,
      ...(state.usage ? { usage: state.usage } : {}),
    };
  }

  private async toHttpError(response: Response): Promise<AppError> {
    let message: string | undefined;
    try {
      const json = (await response.json()) as { error?: { message?: string } };
      message = json.error?.message;
    } catch {
      // body was not JSON
    }
    this.options.logger.warn(
      { status: response.status, upstreamMessage: message },
      'OpenRouter request failed',
    );
    return mapUpstreamError(response.status, message);
  }
}

function mapUpstreamError(status: number, upstreamMessage?: string): AppError {
  const details = upstreamMessage ? { upstream: upstreamMessage } : undefined;
  switch (true) {
    case status === 400:
      return new AppError('upstream_error', upstreamMessage ?? 'The model rejected the request', {
        details,
        expose: true,
      });
    case status === 401 || status === 403:
      return new AppError('misconfigured', 'Model provider rejected the server credentials');
    case status === 402:
      return new AppError(
        'quota_exceeded',
        'The model provider quota is exhausted. Try again later.',
        {
          expose: true,
        },
      );
    case status === 408:
      return new AppError('timeout', 'The model took too long to respond', { expose: true });
    case status === 429:
      return new AppError(
        'upstream_rate_limited',
        'The free model is rate limited right now. Wait a moment or pick another model.',
        { details, expose: true },
      );
    default:
      return new AppError(
        'upstream_unavailable',
        'The model provider is unavailable. Please retry.',
        {
          details,
          expose: true,
        },
      );
  }
}
