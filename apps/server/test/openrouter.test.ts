import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.js';
import { OpenRouterProvider } from '../src/llm/openrouter.js';
import type { ChatStreamChunk } from '../src/llm/types.js';
import { createLogger } from '../src/logger.js';

const logger = createLogger({ env: 'test', logLevel: 'silent' });

function providerWith(response: Response) {
  const calls: RequestInit[] = [];
  const provider = new OpenRouterProvider({
    apiKey: 'k',
    baseUrl: 'https://example.test/api/v1',
    appUrl: 'http://localhost',
    appName: 'Test',
    fallbackModels: ['fallback/model'],
    reasoningEffort: 'low',
    logger,
    fetch: async (_url, init) => {
      calls.push(init!);
      return response;
    },
  });
  return { provider, calls };
}

function sseResponse(frames: string[]): Response {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function collect(iterable: AsyncIterable<ChatStreamChunk>) {
  const out: ChatStreamChunk[] = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}

const request = {
  model: 'm',
  messages: [],
  maxOutputTokens: 100,
  signal: new AbortController().signal,
};

describe('OpenRouterProvider', () => {
  it('maps streamed deltas, reasoning, usage and finish reason', async () => {
    const { provider, calls } = providerWith(
      sseResponse([
        ': OPENROUTER PROCESSING\n\n',
        'data: {"model":"m","choices":[{"delta":{"reasoning":"hmm"}}]}\n\n',
        'data: {"model":"m","choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    expect(await collect(provider.streamChat(request))).toEqual([
      { type: 'model', model: 'm' },
      { type: 'reasoning', text: 'hmm' },
      { type: 'content', text: 'Hel' },
      { type: 'content', text: 'lo' },
      {
        type: 'finish',
        reason: 'stop',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      },
    ]);
    const sent = JSON.parse(String(calls[0]!.body));
    expect(sent).toMatchObject({
      model: 'm',
      models: ['m', 'fallback/model'],
      stream: true,
      reasoning: { effort: 'low' },
    });
  });

  it('turns HTTP 429 into a retryable upstream_rate_limited error', async () => {
    const { provider } = providerWith(
      new Response(JSON.stringify({ error: { message: 'rate' } }), { status: 429 }),
    );
    const error = await collect(provider.streamChat(request)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('upstream_rate_limited');
    expect((error as AppError).retryable).toBe(true);
  });

  it('raises mid-stream error frames', async () => {
    const { provider } = providerWith(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
        'data: {"error":{"code":502,"message":"boom"}}\n\n',
      ]),
    );
    await expect(collect(provider.streamChat(request))).rejects.toMatchObject({
      code: 'upstream_unavailable',
    });
  });

  it('never exposes credential failures to users', async () => {
    const { provider } = providerWith(new Response('{}', { status: 401 }));
    const error = (await collect(provider.streamChat(request)).catch(
      (e: unknown) => e,
    )) as AppError;
    expect(error.code).toBe('misconfigured');
    expect(error.expose).toBe(false);
  });
});
