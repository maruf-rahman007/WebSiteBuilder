import { z } from 'zod';
import { ERROR_CODES } from './api.js';

/**
 * Events streamed from `POST /api/generate` as Server-Sent Events. Each SSE
 * `data:` frame holds one JSON-encoded event. Bump the version on any
 * breaking change so old clients can detect a mismatch.
 */
export const STREAM_PROTOCOL_VERSION = 1;

export const actionKindSchema = z.enum(['file', 'delete']);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const usageSchema = z.object({
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});
export type Usage = z.infer<typeof usageSchema>;

export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.started'),
    runId: z.string(),
    model: z.string(),
    protocolVersion: z.number(),
  }),
  /** Model's "thinking" tokens, for models that expose them. */
  z.object({ type: z.literal('reasoning.delta'), text: z.string() }),
  /** Prose outside the artifact: explanation shown in the chat. */
  z.object({ type: z.literal('message.delta'), text: z.string() }),
  z.object({ type: z.literal('artifact.started'), title: z.string() }),
  z.object({
    type: z.literal('action.started'),
    actionId: z.string(),
    kind: actionKindSchema,
    path: z.string(),
  }),
  /** Partial file contents while the model is still writing the file. */
  z.object({ type: z.literal('action.delta'), actionId: z.string(), text: z.string() }),
  /** Authoritative final contents. Replaces anything built from deltas. */
  z.object({
    type: z.literal('action.completed'),
    actionId: z.string(),
    kind: actionKindSchema,
    path: z.string(),
    content: z.string(),
  }),
  z.object({
    type: z.literal('action.failed'),
    actionId: z.string(),
    path: z.string(),
    reason: z.string(),
  }),
  z.object({ type: z.literal('artifact.completed') }),
  z.object({ type: z.literal('run.warning'), message: z.string() }),
  z.object({
    type: z.literal('run.completed'),
    finishReason: z.string().nullable(),
    usage: usageSchema.optional(),
  }),
  z.object({
    type: z.literal('run.error'),
    code: z.enum(ERROR_CODES),
    message: z.string(),
    retryable: z.boolean(),
  }),
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;
export type StreamEventType = StreamEvent['type'];
export type StreamEventOf<T extends StreamEventType> = Extract<StreamEvent, { type: T }>;
