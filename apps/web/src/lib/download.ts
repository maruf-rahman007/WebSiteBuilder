import type { ProjectFiles } from '@wb/shared';
import { slugify } from './utils';

/** Zips the project (sources only; node_modules never lives in the store) and downloads it. */
export async function downloadProject(files: ProjectFiles, title: string | null): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const name = slugify(title ?? 'my-app', 'my-app');
  const zip = new JSZip();
  const folder = zip.folder(name)!;
  for (const [path, content] of Object.entries(files)) folder.file(path, content);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
