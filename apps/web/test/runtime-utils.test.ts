import { describe, expect, it } from 'vitest';
import { buildFileTree } from '../src/lib/file-tree';
import { dependencySignature, toFileSystemTree } from '../src/runtime/file-system-tree';
import { TEMPLATE_FILES } from '../src/runtime/template';

describe('toFileSystemTree', () => {
  it('nests flat paths into directory nodes', () => {
    expect(toFileSystemTree({ 'a.txt': '1', 'src/b.ts': '2', 'src/c/d.ts': '3' })).toEqual({
      'a.txt': { file: { contents: '1' } },
      src: {
        directory: {
          'b.ts': { file: { contents: '2' } },
          c: { directory: { 'd.ts': { file: { contents: '3' } } } },
        },
      },
    });
  });
});

describe('dependencySignature', () => {
  it('ignores key order and non-dependency fields', () => {
    const a = JSON.stringify({ name: 'a', dependencies: { react: '1', zod: '2' } });
    const b = JSON.stringify({
      name: 'b',
      scripts: { dev: 'vite' },
      dependencies: { zod: '2', react: '1' },
    });
    expect(dependencySignature(a)).toBe(dependencySignature(b));
  });

  it('changes when a dependency is added', () => {
    const before = JSON.stringify({ dependencies: { react: '1' } });
    const after = JSON.stringify({ dependencies: { react: '1', zod: '2' } });
    expect(dependencySignature(before)).not.toBe(dependencySignature(after));
  });

  it('returns null for invalid JSON', () => {
    expect(dependencySignature('{ nope')).toBeNull();
    expect(dependencySignature(undefined)).toBeNull();
  });

  it('accepts the template package.json', () => {
    expect(dependencySignature(TEMPLATE_FILES['package.json'])).not.toBeNull();
  });
});

describe('buildFileTree', () => {
  it('sorts folders before files alphabetically', () => {
    const tree = buildFileTree([
      'src/b.ts',
      'index.html',
      'src/a.ts',
      'src/components/X.tsx',
      'README.md',
    ]);
    expect(tree.map((n) => n.name)).toEqual(['src', 'index.html', 'README.md']);
    const src = tree[0]!;
    expect(src.type === 'folder' && src.children.map((n) => n.name)).toEqual([
      'components',
      'a.ts',
      'b.ts',
    ]);
  });
});
