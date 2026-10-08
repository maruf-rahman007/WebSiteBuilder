import { SseDecoder, streamEventSchema, type StreamEvent } from '@wb/shared';
import { loadConfig, type AppConfig } from '../src/config.js';
import type { ChatStreamChunk, ChatStreamRequest, LlmProvider } from '../src/llm/types.js';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODELS: 'test/model-a:free,test/model-b:free',
    ...overrides,
  });
}

/** Provider that replays scripted chunks and records what it was asked. */
export class FakeProvider implements LlmProvider {
  readonly name = 'fake';
  readonly requests: ChatStreamRequest[] = [];

  constructor(
    private readonly script: (request: ChatStreamRequest) => AsyncIterable<ChatStreamChunk>,
  ) {}

  streamChat(request: ChatStreamRequest): AsyncIterable<ChatStreamChunk> {
    this.requests.push(request);
    return this.script(request);
  }
}

export function scripted(chunks: ChatStreamChunk[]) {
  return async function* () {
    for (const chunk of chunks) yield chunk;
  };
}

export function parseSseEvents(body: string): StreamEvent[] {
  const decoder = new SseDecoder();
  return [...decoder.push(body), ...decoder.flush()].map((m) =>
    streamEventSchema.parse(JSON.parse(m.data)),
  );
}
