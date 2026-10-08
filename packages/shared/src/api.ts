import { z } from 'zod';
import { normalizeProjectPath } from './paths.js';

/**
 * Hard limits on what a client may send in one generation request. The server
 * enforces them; the client uses them to fail fast with a friendly message.
 */
export const REQUEST_LIMITS = {
  maxMessages: 40,
  maxMessageChars: 20_000,
  maxFiles: 300,
  maxFileChars: 200_000,
  maxTotalFileChars: 1_500_000,
} as const;

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(REQUEST_LIMITS.maxMessageChars),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Flat map of project-relative path -> file contents. */
export const projectFilesSchema = z
  .record(z.string(), z.string().max(REQUEST_LIMITS.maxFileChars))
  .superRefine((files, ctx) => {
    const paths = Object.keys(files);
    if (paths.length > REQUEST_LIMITS.maxFiles) {
      ctx.addIssue({ code: 'custom', message: `Too many files (max ${REQUEST_LIMITS.maxFiles})` });
    }
    let total = 0;
    for (const path of paths) {
      total += files[path]!.length;
      if (normalizeProjectPath(path) !== path) {
        ctx.addIssue({ code: 'custom', message: `Invalid file path: ${path}`, path: [path] });
      }
    }
    if (total > REQUEST_LIMITS.maxTotalFileChars) {
      ctx.addIssue({ code: 'custom', message: 'Project is too large to send' });
    }
  });
export type ProjectFiles = z.infer<typeof projectFilesSchema>;

export const generateRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(REQUEST_LIMITS.maxMessages)
    .refine((messages) => messages.at(-1)?.role === 'user', {
      message: 'The last message must come from the user',
    }),
  files: projectFilesSchema,
  model: z.string().min(1).max(200).optional(),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ModelsResponse {
  models: ModelInfo[];
  defaultModel: string;
}

export const ERROR_CODES = [
  'bad_request',
  'rate_limited',
  'too_many_streams',
  'upstream_rate_limited',
  'upstream_unavailable',
  'upstream_error',
  'quota_exceeded',
  'timeout',
  'misconfigured',
  'not_found',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}
