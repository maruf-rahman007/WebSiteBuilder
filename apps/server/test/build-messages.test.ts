import { describe, expect, it } from 'vitest';
import { buildMessages } from '../src/generation/build-messages.js';

describe('buildMessages', () => {
  it('attaches project files to the latest user message only', () => {
    const messages = buildMessages(
      [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'done' },
        { role: 'user', content: 'second' },
      ],
      { 'src/App.tsx': 'app' },
    );
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[1]?.content).toBe('first');
    expect(messages[3]?.content).toContain('<file path="src/App.tsx">\napp\n</file>');
    expect(messages[3]?.content).toContain('<user_request>\nsecond\n</user_request>');
  });

  it('omits files beyond the budget and lists them by name', () => {
    const messages = buildMessages(
      [{ role: 'user', content: 'go' }],
      { 'package.json': 'x'.repeat(10), 'src/big.ts': 'y'.repeat(100), 'package-lock.json': '{}' },
      { maxFileChars: 50, maxHistoryMessages: 10 },
    );
    const content = messages.at(-1)!.content;
    expect(content).toContain('<file path="package.json">');
    expect(content).not.toContain('y'.repeat(100));
    expect(content).toMatch(/<omitted_files[^>]*>[\s\S]*src\/big\.ts/);
    expect(content).toMatch(/<omitted_files[^>]*>[\s\S]*package-lock\.json/);
  });

  it('trims history so it starts with a user turn', () => {
    const history = [
      { role: 'user' as const, content: 'u1' },
      { role: 'assistant' as const, content: 'a1' },
      { role: 'user' as const, content: 'u2' },
    ];
    const messages = buildMessages(history, {}, { maxFileChars: 10, maxHistoryMessages: 2 });
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
  });
});
