import type { ChatMessage, ProjectFiles } from '@wb/shared';
import type { LlmMessage } from '../llm/types.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

export interface ContextBudget {
  /** Rough character budget for project files embedded in the prompt. */
  maxFileChars: number;
  /** Number of most recent chat messages to keep. */
  maxHistoryMessages: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxFileChars: 240_000,
  maxHistoryMessages: 12,
};

/** Files the model never needs to see in full. */
const EXCLUDED = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i,
];

/**
 * Turns the stateless request (chat history + current files) into the message
 * list sent to the model. The current project is attached to the latest user
 * message so the model always sees the freshest state, including manual edits.
 */
export function buildMessages(
  history: ChatMessage[],
  files: ProjectFiles,
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): LlmMessage[] {
  const recent = history.slice(-budget.maxHistoryMessages);
  // A window that starts with an assistant turn confuses some models.
  while (recent.length > 1 && recent[0]!.role !== 'user') recent.shift();

  const messages: LlmMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  const last = recent.length - 1;
  recent.forEach((message, index) => {
    if (index === last && message.role === 'user') {
      messages.push({
        role: 'user',
        content: `${renderProjectFiles(files, budget)}\n\n<user_request>\n${message.content}\n</user_request>`,
      });
    } else {
      messages.push({ role: message.role, content: message.content });
    }
  });
  return messages;
}

export function renderProjectFiles(files: ProjectFiles, budget: ContextBudget): string {
  const paths = Object.keys(files).sort(compareForContext);
  const included: string[] = [];
  const omitted: string[] = [];
  let used = 0;

  for (const path of paths) {
    const content = files[path]!;
    if (EXCLUDED.some((re) => re.test(path)) || used + content.length > budget.maxFileChars) {
      omitted.push(path);
      continue;
    }
    used += content.length;
    included.push(`<file path="${path}">\n${content}\n</file>`);
  }

  const parts = ['<project_files>', ...included];
  if (omitted.length > 0) {
    parts.push(`<omitted_files reason="size">\n${omitted.join('\n')}\n</omitted_files>`);
  }
  parts.push('</project_files>');
  return parts.join('\n');
}

/** Config and entry files first, then source by depth: the model reads the important parts even if trimmed. */
function compareForContext(a: string, b: string): number {
  const rank = (p: string) =>
    p === 'package.json' ? 0 : !p.includes('/') ? 1 : p === 'src/App.tsx' ? 2 : 3;
  return rank(a) - rank(b) || a.localeCompare(b);
}
