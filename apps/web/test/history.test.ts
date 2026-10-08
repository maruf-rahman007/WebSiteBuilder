import { describe, expect, it } from 'vitest';
import { toApiHistory } from '../src/features/generation/history';
import type { AssistantMessage, Message } from '../src/stores/chat-store';

const assistant = (overrides: Partial<AssistantMessage>): AssistantMessage => ({
  id: 'a',
  role: 'assistant',
  content: '',
  reasoning: '',
  artifactTitle: null,
  steps: [],
  warnings: [],
  status: 'complete',
  error: null,
  model: null,
  createdAt: 0,
  ...overrides,
});

describe('toApiHistory', () => {
  it('summarizes assistant turns with the files they changed', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'build it', createdAt: 0 },
      assistant({
        content: 'Done.',
        reasoning: 'secret thoughts',
        steps: [
          { id: '1', kind: 'create', label: 'Create', path: 'src/A.tsx', status: 'done' },
          { id: '2', kind: 'edit', label: 'Update', path: 'src/App.tsx', status: 'error' },
          { id: '3', kind: 'install', label: 'Install', status: 'done' },
        ],
      }),
      { id: 'u2', role: 'user', content: 'now blue', createdAt: 0 },
    ];
    expect(toApiHistory(messages)).toEqual([
      { role: 'user', content: 'build it' },
      { role: 'assistant', content: 'Done.\n\n[Changes applied: created src/A.tsx]' },
      { role: 'user', content: 'now blue' },
    ]);
  });

  it('drops empty assistant turns (e.g. failed requests)', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'hi', createdAt: 0 },
      assistant({ status: 'error' }),
      { id: 'u2', role: 'user', content: 'again', createdAt: 0 },
    ];
    expect(toApiHistory(messages).map((m) => m.role)).toEqual(['user', 'user']);
  });
});
