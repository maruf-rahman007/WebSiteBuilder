import { REQUEST_LIMITS, type ChatMessage } from '@wb/shared';
import type { Message } from '../../stores/chat-store';

/**
 * Converts the chat into the compact history the server expects. Assistant
 * turns are summarized as prose plus the list of files they touched; the
 * files themselves are sent separately as the current project state.
 */
export function toApiHistory(messages: Message[]): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      history.push({ role: 'user', content: clip(message.content) });
      continue;
    }
    const changed = message.steps
      .filter((s) => s.path && s.status === 'done')
      .map(
        (s) =>
          `${s.kind === 'delete' ? 'deleted' : s.kind === 'create' ? 'created' : 'updated'} ${s.path}`,
      );
    const parts = [message.content.trim()];
    if (changed.length > 0) parts.push(`[Changes applied: ${changed.join(', ')}]`);
    const content = parts.filter(Boolean).join('\n\n');
    if (content) history.push({ role: 'assistant', content: clip(content) });
  }
  return history.slice(-REQUEST_LIMITS.maxMessages);
}

function clip(text: string): string {
  return text.length > REQUEST_LIMITS.maxMessageChars
    ? text.slice(0, REQUEST_LIMITS.maxMessageChars)
    : text;
}
