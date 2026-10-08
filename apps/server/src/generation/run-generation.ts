import { randomUUID } from 'node:crypto';
import { STREAM_PROTOCOL_VERSION, type GenerateRequest, type StreamEvent } from '@wb/shared';
import { AppError, toAppError } from '../errors.js';
import type { Logger } from '../logger.js';
import type { LlmProvider } from '../llm/types.js';
import { ArtifactParser, type ParserEvent } from './artifact-parser.js';
import { buildMessages } from './build-messages.js';

export interface RunGenerationOptions {
  provider: LlmProvider;
  request: GenerateRequest;
  model: string;
  maxOutputTokens: number;
  /** Aborted when the client disconnects or the server shuts down. */
  signal: AbortSignal;
  totalTimeoutMs: number;
  idleTimeoutMs: number;
  emit: (event: StreamEvent) => Promise<void>;
  logger: Logger;
}

/**
 * Runs one generation: builds the prompt, streams the model's output through
 * the artifact parser and emits protocol events. Never throws; failures are
 * reported to the client as a `run.error` event.
 */
export async function runGeneration(options: RunGenerationOptions): Promise<void> {
  const { emit, logger } = options;
  const runId = randomUUID();
  const log = logger.child({ runId, model: options.model });
  const startedAt = Date.now();

  const watchdog = new AbortController();
  const signal = AbortSignal.any([
    options.signal,
    watchdog.signal,
    AbortSignal.timeout(options.totalTimeoutMs),
  ]);
  let idleTimer: NodeJS.Timeout | undefined;
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () =>
        watchdog.abort(new AppError('timeout', 'The model stopped responding', { expose: true })),
      options.idleTimeoutMs,
    );
  };

  const parser = new ArtifactParser();
  const emitParsed = async (events: ParserEvent[]) => {
    for (const event of events) {
      const mapped = toStreamEvent(event);
      if (mapped) await emit(mapped);
    }
  };

  let completionChars = 0;
  try {
    await emit({
      type: 'run.started',
      runId,
      model: options.model,
      protocolVersion: STREAM_PROTOCOL_VERSION,
    });
    touch();

    const stream = options.provider.streamChat({
      model: options.model,
      messages: buildMessages(options.request.messages, options.request.files),
      maxOutputTokens: options.maxOutputTokens,
      signal,
    });

    for await (const chunk of stream) {
      touch();
      switch (chunk.type) {
        case 'content':
          completionChars += chunk.text.length;
          await emitParsed(parser.push(chunk.text));
          break;
        case 'reasoning':
          await emit({ type: 'reasoning.delta', text: chunk.text });
          break;
        case 'model':
          if (baseModelId(chunk.model) !== baseModelId(options.model)) {
            log.info({ servedBy: chunk.model }, 'served by fallback model');
            await emit({
              type: 'run.warning',
              message: `${options.model} was busy, so ${chunk.model} answered instead.`,
            });
          }
          break;
        case 'finish': {
          await emitParsed(parser.end());
          if (chunk.reason === 'length') {
            await emit({
              type: 'run.warning',
              message: 'The response hit the output token limit and may be incomplete.',
            });
          }
          await emit({
            type: 'run.completed',
            finishReason: chunk.reason,
            ...(chunk.usage ? { usage: chunk.usage } : {}),
          });
          log.info(
            {
              durationMs: Date.now() - startedAt,
              finishReason: chunk.reason,
              usage: chunk.usage,
              completionChars,
            },
            'generation completed',
          );
          return;
        }
      }
    }
    // Stream ended without a finish frame.
    await emitParsed(parser.end());
    await emit({ type: 'run.completed', finishReason: null });
  } catch (error) {
    if (options.signal.aborted) {
      log.info({ durationMs: Date.now() - startedAt }, 'generation cancelled by client');
      return;
    }
    const reason: unknown = watchdog.signal.aborted ? watchdog.signal.reason : error;
    const appError =
      signal.aborted && !(reason instanceof AppError)
        ? new AppError('timeout', 'The generation took too long and was stopped', { expose: true })
        : toAppError(reason);
    // Upstream hiccups (rate limits, outages) are expected with free models;
    // only our own faults deserve error-level logs with stacks.
    if (appError.code === 'internal' || appError.code === 'misconfigured') {
      log.error({ err: error }, 'generation failed');
    } else {
      log.warn({ code: appError.code, msg: appError.message }, 'generation failed');
    }
    // Close any half-written action so the client doesn't apply a partial file.
    await emitParsed(parser.end()).catch(() => undefined);
    await emit({
      type: 'run.error',
      code: appError.code,
      message: appError.publicMessage,
      retryable: appError.retryable,
    }).catch(() => undefined);
  } finally {
    clearTimeout(idleTimer);
  }
}

/** OpenRouter may report `vendor/model` for a request made as `vendor/model:free`. */
function baseModelId(id: string): string {
  return id.split(':')[0]!;
}

function toStreamEvent(event: ParserEvent): StreamEvent | null {
  switch (event.type) {
    case 'text':
      return { type: 'message.delta', text: event.text };
    case 'artifactOpen':
      return { type: 'artifact.started', title: event.title };
    case 'artifactClose':
      return { type: 'artifact.completed' };
    case 'actionOpen':
      return { type: 'action.started', actionId: event.id, kind: event.kind, path: event.path };
    case 'actionDelta':
      return { type: 'action.delta', actionId: event.id, text: event.text };
    case 'actionClose':
      return {
        type: 'action.completed',
        actionId: event.id,
        kind: event.kind,
        path: event.path,
        content: event.content,
      };
    case 'actionInvalid':
      return event.id
        ? { type: 'action.failed', actionId: event.id, path: event.path, reason: event.reason }
        : { type: 'run.warning', message: `Skipped "${event.path}": ${event.reason}` };
    case 'warning':
      return { type: 'run.warning', message: event.message };
  }
}
