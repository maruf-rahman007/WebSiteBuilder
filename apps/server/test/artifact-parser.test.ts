import { describe, expect, it } from 'vitest';
import {
  ArtifactParser,
  partialSuffixLength,
  type ParserEvent,
} from '../src/generation/artifact-parser.js';

/** Runs the parser with a fixed chunk size and merges adjacent text/delta events. */
function parse(input: string, chunkSize = input.length): ParserEvent[] {
  const parser = new ArtifactParser();
  const raw: ParserEvent[] = [];
  for (let i = 0; i < input.length; i += chunkSize)
    raw.push(...parser.push(input.slice(i, i + chunkSize)));
  raw.push(...parser.end());

  const merged: ParserEvent[] = [];
  for (const event of raw) {
    const prev = merged.at(-1);
    if (prev?.type === 'text' && event.type === 'text') prev.text += event.text;
    else if (prev?.type === 'actionDelta' && event.type === 'actionDelta' && prev.id === event.id)
      prev.text += event.text;
    else merged.push({ ...event });
  }
  return merged;
}

/** Asserts the parse result is identical for every chunk size. */
function parseAllChunkings(input: string): ParserEvent[] {
  const expected = parse(input);
  for (let size = 1; size < Math.min(input.length, 40); size++) {
    expect(parse(input, size), `chunk size ${size}`).toEqual(expected);
  }
  return expected;
}

const closed = (events: ParserEvent[]) =>
  events.filter(
    (e): e is Extract<ParserEvent, { type: 'actionClose' }> => e.type === 'actionClose',
  );

describe('ArtifactParser', () => {
  it('parses prose, artifact and file actions', () => {
    const input = [
      "I'll build it.\n\n",
      '<artifact title="Todo app">\n',
      '<action type="file" path="src/App.tsx">\nexport default function App() {\n  return <div className="p-4">Hi</div>;\n}\n</action>\n',
      '<action type="delete" path="src/Old.tsx" />\n',
      '</artifact>\n\nDone!',
    ].join('');

    const events = parseAllChunkings(input);
    expect(events).toEqual([
      { type: 'text', text: "I'll build it.\n\n" },
      { type: 'artifactOpen', title: 'Todo app' },
      { type: 'actionOpen', id: 'action-1', kind: 'file', path: 'src/App.tsx' },
      {
        type: 'actionDelta',
        id: 'action-1',
        text: 'export default function App() {\n  return <div className="p-4">Hi</div>;\n}\n',
      },
      {
        type: 'actionClose',
        id: 'action-1',
        kind: 'file',
        path: 'src/App.tsx',
        content: 'export default function App() {\n  return <div className="p-4">Hi</div>;\n}\n',
      },
      { type: 'actionOpen', id: 'action-2', kind: 'delete', path: 'src/Old.tsx' },
      { type: 'actionClose', id: 'action-2', kind: 'delete', path: 'src/Old.tsx', content: '' },
      { type: 'artifactClose' },
      { type: 'text', text: '\n\nDone!' },
    ]);
  });

  it('strips markdown fences inside file contents', () => {
    const input =
      '<artifact title="x"><action type="file" path="a.ts">\n```ts\nconst a = 1;\n```\n</action></artifact>';
    expect(closed(parseAllChunkings(input))[0]?.content).toBe('const a = 1;\n');
  });

  it('keeps backticks that are real content', () => {
    const input =
      '<artifact title="x"><action type="file" path="a.ts">`template ${x}`;\n</action></artifact>';
    expect(closed(parseAllChunkings(input))[0]?.content).toBe('`template ${x}`;\n');
  });

  it('drops a code fence wrapped around the whole artifact', () => {
    const input =
      'Here you go:\n```xml\n<artifact title="x"><action type="file" path="a.ts">a</action></artifact>\n```\nEnjoy.';
    const text = parseAllChunkings(input)
      .filter((e) => e.type === 'text')
      .map((e) => (e as { text: string }).text)
      .join('');
    expect(text).not.toContain('```');
    expect(text).toContain('Here you go:');
    expect(text).toContain('Enjoy.');
  });

  it('keeps fenced code blocks in prose that are not around an artifact', () => {
    const input = 'Use this:\n```\nnpm i\n```\nok';
    const events = parseAllChunkings(input);
    expect(events).toEqual([{ type: 'text', text: input }]);
  });

  it('handles > inside attribute values', () => {
    const events = parseAllChunkings('<artifact title="A > B"></artifact>');
    expect(events[0]).toEqual({ type: 'artifactOpen', title: 'A > B' });
  });

  it('rejects unsafe paths and skips their content', () => {
    const input =
      '<artifact title="x"><action type="file" path="../evil.sh">rm -rf /</action><action type="file" path="ok.ts">ok</action></artifact>';
    const events = parseAllChunkings(input);
    expect(events).toContainEqual({
      type: 'actionInvalid',
      id: null,
      path: '../evil.sh',
      reason: 'Invalid or unsafe file path',
    });
    expect(closed(events).map((e) => e.path)).toEqual(['ok.ts']);
  });

  it('ignores unsupported action types', () => {
    const input =
      '<artifact title="x"><action type="shell">npm install</action><action type="file" path="a.ts">a</action></artifact>';
    const events = parseAllChunkings(input);
    expect(events).toContainEqual({
      type: 'warning',
      message: 'Ignored unsupported action type "shell"',
    });
    expect(closed(events)).toHaveLength(1);
  });

  it('reports a truncated file instead of completing it', () => {
    const events = parseAllChunkings(
      '<artifact title="x"><action type="file" path="a.ts">const a =',
    );
    expect(closed(events)).toHaveLength(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'actionInvalid', id: 'action-1', path: 'a.ts' }),
    );
    expect(events.at(-2)).toEqual({ type: 'artifactClose' });
  });

  it('treats lookalike tags as text', () => {
    expect(parseAllChunkings('see <artifacts> here')).toEqual([
      { type: 'text', text: 'see <artifacts> here' },
    ]);
  });

  it('supports filePath as an alias and normalizes the path', () => {
    const events = parseAllChunkings(
      '<artifact title="x"><action type="file" filePath="./src//a.ts">a</action></artifact>',
    );
    expect(closed(events)[0]?.path).toBe('src/a.ts');
  });

  it('does not emit a partial closing tag as file content', () => {
    const parser = new ArtifactParser();
    parser.push('<artifact title="x"><action type="file" path="a.ts">\nhello');
    const events = parser.push('</act');
    expect(
      events
        .filter((e) => e.type === 'actionDelta')
        .map((e) => (e as { text: string }).text)
        .join(''),
    ).not.toContain('<');
  });
});

describe('partialSuffixLength', () => {
  it('finds the longest proper prefix at the end', () => {
    expect(partialSuffixLength('abc <art', '<artifact')).toBe(4);
    expect(partialSuffixLength('abc', '<artifact')).toBe(0);
    expect(partialSuffixLength('<', '<artifact')).toBe(1);
  });
});
