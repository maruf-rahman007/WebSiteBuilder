import { PreviewMessageType, WebContainer, type WebContainerProcess } from '@webcontainer/api';
import type { ProjectFiles } from '@wb/shared';
import { useRuntimeStore } from '../stores/runtime-store';
import { dependencySignature, toFileSystemTree } from './file-system-tree';
import { OutputBuffer } from './output-buffer';

const DEV_SERVER_TIMEOUT_MS = 120_000;
const INSTALL_ARGS = ['install', '--no-audit', '--no-fund', '--loglevel=error'];

export type DependencyResult = 'installed' | 'unchanged';

/**
 * Owns the single WebContainer for this tab: boots it, applies file changes
 * in order, installs dependencies when package.json changes and keeps the
 * Vite dev server running. UI state is mirrored into `useRuntimeStore`.
 *
 * A browser tab can only boot one WebContainer, so this is a singleton.
 */
export class WorkbenchRuntime {
  readonly output = new OutputBuffer();

  private container: Promise<WebContainer> | null = null;
  /** Serializes all file-system operations so writes land in model order. */
  private fsQueue: Promise<unknown> = Promise.resolve();
  private installedSignature: string | null = null;
  private install: { signature: string; promise: Promise<void> } | null = null;
  private devServer: WebContainerProcess | null = null;
  private devServerUrl: Promise<string> | null = null;
  private serverReadyWaiters = new Set<(url: string) => void>();

  get isSupported(): boolean {
    return typeof window !== 'undefined' && window.crossOriginIsolated;
  }

  /** Boots the container and mounts the initial project. Safe to call repeatedly. */
  boot(initialFiles: ProjectFiles): Promise<WebContainer> {
    this.container ??= this.doBoot(initialFiles).catch((error: unknown) => {
      this.container = null;
      useRuntimeStore
        .getState()
        .setStatus('error', errorMessage(error, 'Failed to start the in-browser runtime'));
      throw error;
    });
    return this.container;
  }

  writeFile(path: string, contents: string): Promise<void> {
    return this.enqueue(async (wc) => {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (dir) await wc.fs.mkdir(dir, { recursive: true });
      await wc.fs.writeFile(path, contents);
    });
  }

  deleteFile(path: string): Promise<void> {
    return this.enqueue(async (wc) => {
      await wc.fs.rm(path, { force: true, recursive: true });
    });
  }

  /** Waits for every queued file operation to land. */
  flush(): Promise<void> {
    return this.fsQueue.then(
      () => undefined,
      () => undefined,
    );
  }

  /** Runs `npm install` if the dependency set differs from what is installed. */
  async ensureDependencies(packageJson: string | undefined): Promise<DependencyResult> {
    const signature = dependencySignature(packageJson);
    if (signature === null) throw new Error('package.json is missing or is not valid JSON');

    while (this.install) {
      const inFlight = this.install;
      await inFlight.promise.catch(() => undefined);
      if (inFlight.signature === signature && this.installedSignature === signature)
        return 'installed';
    }
    if (this.installedSignature === signature) return 'unchanged';

    const promise = this.runInstall(signature);
    this.install = { signature, promise };
    try {
      await promise;
      return 'installed';
    } finally {
      this.install = null;
    }
  }

  /** Starts the dev server if needed and resolves with its preview URL. */
  ensureDevServer(): Promise<string> {
    this.devServerUrl ??= this.startDevServer().catch((error: unknown) => {
      this.devServerUrl = null;
      throw error;
    });
    return this.devServerUrl;
  }

  async restartDevServer(): Promise<string> {
    this.devServer?.kill();
    this.devServer = null;
    this.devServerUrl = null;
    useRuntimeStore.getState().setPreviewUrl(null);
    return this.ensureDevServer();
  }

  /** Replaces the whole project (used by "New project"). */
  async reset(files: ProjectFiles): Promise<void> {
    const wc = await this.boot(files);
    await this.enqueue(async () => {
      for (const entry of await wc.fs.readdir('.')) {
        if (entry !== 'node_modules') await wc.fs.rm(entry, { recursive: true, force: true });
      }
      await wc.mount(toFileSystemTree(files));
    });
    useRuntimeStore.getState().clearIssues();
  }

  private async doBoot(initialFiles: ProjectFiles): Promise<WebContainer> {
    const store = useRuntimeStore.getState();
    if (!this.isSupported) {
      throw new Error(
        'This page is not cross-origin isolated, so the in-browser runtime cannot start.',
      );
    }
    store.setStatus('booting');
    this.output.write('\x1b[2m$ booting WebContainer…\x1b[0m\r\n');

    const wc = await WebContainer.boot({
      coep: 'require-corp',
      workdirName: 'project',
      forwardPreviewErrors: 'exceptions-only',
    });

    wc.on('server-ready', (_port, url) => {
      useRuntimeStore.getState().setPreviewUrl(url);
      for (const resolve of this.serverReadyWaiters) resolve(url);
      this.serverReadyWaiters.clear();
    });
    wc.on('port', (_port, type) => {
      if (type === 'close') useRuntimeStore.getState().setPreviewUrl(null);
    });
    wc.on('preview-message', (message) => {
      const kind =
        message.type === PreviewMessageType.UncaughtException
          ? 'exception'
          : message.type === PreviewMessageType.UnhandledRejection
            ? 'rejection'
            : 'console';
      useRuntimeStore.getState().addIssue({
        kind,
        message: 'message' in message ? String(message.message) : 'Unknown error',
        ...('stack' in message && message.stack ? { stack: message.stack } : {}),
      });
    });
    wc.on('error', (error) => {
      useRuntimeStore.getState().setStatus('error', error.message);
    });

    await wc.mount(toFileSystemTree(initialFiles));
    store.setStatus('idle');
    return wc;
  }

  private enqueue<T>(operation: (wc: WebContainer) => Promise<T>): Promise<T> {
    const run = async () => {
      if (!this.container) throw new Error('Runtime has not been booted');
      return operation(await this.container);
    };
    const result = this.fsQueue.then(run, run);
    this.fsQueue = result.catch(() => undefined);
    return result;
  }

  private async runInstall(signature: string): Promise<void> {
    const store = useRuntimeStore.getState();
    await this.flush();
    const wc = await this.requireContainer();
    store.setStatus('installing');
    this.output.write(`\r\n\x1b[36m$ npm ${INSTALL_ARGS.join(' ')}\x1b[0m\r\n`);

    const process = await wc.spawn('npm', INSTALL_ARGS);
    this.pipe(process);
    const exitCode = await process.exit;
    if (exitCode !== 0) {
      store.setStatus(
        'error',
        `npm install failed (exit code ${exitCode}). See the terminal for details.`,
      );
      throw new Error(`npm install failed with exit code ${exitCode}`);
    }
    this.installedSignature = signature;
    store.setStatus(this.devServer ? 'ready' : 'idle');
  }

  private async startDevServer(): Promise<string> {
    const store = useRuntimeStore.getState();
    const wc = await this.requireContainer();
    store.setStatus('starting');
    this.output.write('\r\n\x1b[36m$ npm run dev\x1b[0m\r\n');

    const ready = new Promise<string>((resolve) => this.serverReadyWaiters.add(resolve));
    const process = await wc.spawn('npm', ['run', 'dev']);
    this.devServer = process;
    this.pipe(process);

    const exited = process.exit.then((code) => {
      if (this.devServer === process) {
        this.devServer = null;
        this.devServerUrl = null;
        useRuntimeStore.getState().setPreviewUrl(null);
        useRuntimeStore.getState().setStatus('stopped', `Dev server exited (code ${code})`);
      }
      throw new Error(`Dev server exited with code ${code} before it was ready`);
    });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Dev server did not start in time')),
        DEV_SERVER_TIMEOUT_MS,
      );
    });

    try {
      const url = await Promise.race([ready, exited, timedOut]);
      store.setStatus('ready');
      return url;
    } catch (error) {
      if (this.devServer === process) process.kill();
      store.setStatus('error', errorMessage(error, 'Dev server failed to start'));
      throw error;
    } finally {
      clearTimeout(timeout);
      exited.catch(() => undefined);
    }
  }

  private async requireContainer(): Promise<WebContainer> {
    if (!this.container) throw new Error('Runtime has not been booted');
    return this.container;
  }

  private pipe(process: WebContainerProcess): void {
    process.output
      .pipeTo(new WritableStream({ write: (chunk) => this.output.write(chunk) }))
      .catch(() => undefined);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const runtime = new WorkbenchRuntime();
