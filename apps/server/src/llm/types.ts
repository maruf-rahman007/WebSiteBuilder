import type { Usage } from '@wb/shared';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatStreamRequest {
  model: string;
  messages: LlmMessage[];
  maxOutputTokens: number;
  temperature?: number;
  signal: AbortSignal;
}

export type ChatStreamChunk =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  /** The upstream router picked a different model than requested (fallback). */
  | { type: 'model'; model: string }
  | { type: 'finish'; reason: string | null; usage?: Usage };

/**
 * Anything that can stream a chat completion. OpenRouter today; a direct
 * Anthropic/OpenAI client or a test double can implement the same interface.
 * Implementations throw `AppError` for failures with a meaningful code.
 */
export interface LlmProvider {
  readonly name: string;
  streamChat(request: ChatStreamRequest): AsyncIterable<ChatStreamChunk>;
}
