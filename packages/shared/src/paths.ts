const FORBIDDEN_SEGMENTS = new Set(['node_modules', '.git']);
const MAX_PATH_LENGTH = 256;
const SAFE_SEGMENT = /^[\w@.+-][\w@.+ -]*$/;

/**
 * Normalizes a model- or user-supplied path into a safe project-relative path
 * (`src/App.tsx`). Returns `null` for anything that could escape the project
 * root or touch tooling directories.
 */
export function normalizeProjectPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.length > MAX_PATH_LENGTH) return null;

  const withoutPrefix = trimmed.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  const segments = withoutPrefix.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (segment === '..' || FORBIDDEN_SEGMENTS.has(segment) || !SAFE_SEGMENT.test(segment)) {
      return null;
    }
  }
  return segments.join('/');
}
