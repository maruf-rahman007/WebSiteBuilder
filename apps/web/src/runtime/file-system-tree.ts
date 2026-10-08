import type { DirectoryNode, FileSystemTree } from '@webcontainer/api';
import type { ProjectFiles } from '@wb/shared';

/** Converts a flat `{ 'src/App.tsx': '...' }` map into WebContainer's nested mount format. */
export function toFileSystemTree(files: ProjectFiles): FileSystemTree {
  const root: FileSystemTree = {};
  for (const [path, contents] of Object.entries(files)) {
    const segments = path.split('/');
    const fileName = segments.pop()!;
    let dir = root;
    for (const segment of segments) {
      const existing = dir[segment];
      if (!existing || !('directory' in existing)) {
        const node: DirectoryNode = { directory: {} };
        dir[segment] = node;
        dir = node.directory;
      } else {
        dir = existing.directory;
      }
    }
    dir[fileName] = { file: { contents } };
  }
  return root;
}

/**
 * Stable fingerprint of the dependency sections of package.json. Used to
 * decide whether `npm install` must run again. Returns null for invalid JSON.
 */
export function dependencySignature(packageJson: string | undefined): string | null {
  if (!packageJson) return null;
  try {
    const parsed = JSON.parse(packageJson) as Record<string, unknown>;
    const pick = (key: string) => {
      const value = parsed[key];
      if (!value || typeof value !== 'object') return [];
      return Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      );
    };
    return JSON.stringify([pick('dependencies'), pick('devDependencies'), pick('overrides')]);
  } catch {
    return null;
  }
}
