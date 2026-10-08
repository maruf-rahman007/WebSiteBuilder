import { describe, expect, it } from 'vitest';
import { normalizeProjectPath } from '../src/paths.js';

describe('normalizeProjectPath', () => {
  it.each([
    ['src/App.tsx', 'src/App.tsx'],
    ['./src/App.tsx', 'src/App.tsx'],
    ['/src//components/./Button.tsx', 'src/components/Button.tsx'],
    ['src\\main.tsx', 'src/main.tsx'],
    ['  index.html ', 'index.html'],
    ['src/@types/global.d.ts', 'src/@types/global.d.ts'],
  ])('normalizes %j -> %j', (input, expected) => {
    expect(normalizeProjectPath(input)).toBe(expected);
  });

  it.each([
    '',
    '../etc/passwd',
    'src/../../x',
    'node_modules/react/index.js',
    '.git/config',
    'a/<b>.ts',
    '/',
  ])('rejects %j', (input) => {
    expect(normalizeProjectPath(input)).toBeNull();
  });
});
