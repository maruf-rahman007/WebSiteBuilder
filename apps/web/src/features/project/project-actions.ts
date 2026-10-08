import { downloadProject } from '../../lib/download';
import { runtime } from '../../runtime/workbench-runtime';
import { useChatStore } from '../../stores/chat-store';
import { useProjectStore } from '../../stores/project-store';
import { useRuntimeStore } from '../../stores/runtime-store';
import { stopGeneration } from '../generation/controller';

const WRITE_DEBOUNCE_MS = 300;
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Applies a manual edit from the code editor. The store updates immediately;
 * the WebContainer write is debounced per file so Vite HMR isn't hammered
 * on every keystroke.
 */
export function editFile(path: string, content: string): void {
  useProjectStore.getState().setFile(path, content);
  const existing = pendingWrites.get(path);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    path,
    setTimeout(() => {
      pendingWrites.delete(path);
      void persist(path, content);
    }, WRITE_DEBOUNCE_MS),
  );
}

/** Writes any debounced edits right away (e.g. on Ctrl/Cmd+S). */
export function flushEdits(): void {
  for (const [path, timer] of pendingWrites) {
    clearTimeout(timer);
    pendingWrites.delete(path);
    const content = useProjectStore.getState().files[path];
    if (content !== undefined) void persist(path, content);
  }
}

async function persist(path: string, content: string): Promise<void> {
  try {
    await runtime.writeFile(path, content);
    // Hand-edited dependencies need an install too.
    if (path === 'package.json') await runtime.ensureDependencies(content);
  } catch {
    // Invalid package.json while typing is expected; other failures show in
    // the terminal / runtime status.
  }
}

export async function downloadCurrentProject(): Promise<void> {
  flushEdits();
  const { files, title } = useProjectStore.getState();
  await downloadProject(files, title);
}

export async function startNewProject(): Promise<void> {
  stopGeneration();
  for (const timer of pendingWrites.values()) clearTimeout(timer);
  pendingWrites.clear();
  useChatStore.getState().reset();
  useProjectStore.getState().reset();
  useRuntimeStore.getState().clearIssues();
  try {
    await runtime.reset(useProjectStore.getState().files);
  } catch {
    // Runtime may never have booted; nothing to reset.
  }
}
