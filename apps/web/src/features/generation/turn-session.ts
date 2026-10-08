import type { StreamEvent } from '@wb/shared';
import { runtime } from '../../runtime/workbench-runtime';
import { useChatStore, type AssistantMessage, type Step } from '../../stores/chat-store';
import { useProjectStore } from '../../stores/project-store';
import { useUiStore } from '../../stores/ui-store';
import { ApiError } from '../../lib/api-client';

const DELTA_FLUSH_MS = 40;
const INSTALL_STEP = 'runtime:install';
const PREVIEW_STEP = 'runtime:preview';

interface TrackedAction {
  path: string;
  stepId: string;
}

/**
 * State machine for one assistant turn: maps stream events onto the chat,
 * the project files and the WebContainer, then installs dependencies and
 * starts/refreshes the preview once all file writes have landed.
 */
export class TurnSession {
  private readonly actions = new Map<string, TrackedAction>();
  /** Steps whose outcome is decided (completed or failed by the server). */
  private readonly settledSteps = new Set<string>();
  private readonly writes: Promise<void>[] = [];
  private pendingDeltas: Record<string, string> = {};
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private filesChanged = false;
  private hasArtifact = false;
  private error: AssistantMessage['error'] = null;
  private cancelled = false;

  constructor(private readonly messageId: string) {}

  handle(event: StreamEvent): void {
    const chat = useChatStore.getState();
    const project = useProjectStore.getState();

    switch (event.type) {
      case 'run.started':
        chat.updateAssistant(this.messageId, () => ({ model: event.model }));
        break;

      case 'reasoning.delta':
        chat.updateAssistant(this.messageId, (m) => ({ reasoning: m.reasoning + event.text }));
        break;

      case 'message.delta':
        chat.updateAssistant(this.messageId, (m) => ({ content: m.content + event.text }));
        break;

      case 'artifact.started':
        this.hasArtifact = true;
        chat.updateAssistant(this.messageId, () => ({ artifactTitle: event.title }));
        if (!project.title) project.setTitle(event.title);
        // Show the runtime steps up front so users see what is still to come.
        chat.upsertStep(this.messageId, {
          id: INSTALL_STEP,
          kind: 'install',
          label: 'Install dependencies',
          status: 'pending',
        });
        chat.upsertStep(this.messageId, {
          id: PREVIEW_STEP,
          kind: 'preview',
          label: 'Start preview',
          status: 'pending',
        });
        break;

      case 'action.started': {
        const stepId = `action:${event.actionId}`;
        this.actions.set(event.actionId, { path: event.path, stepId });
        const exists = event.path in project.files;
        const kind = event.kind === 'delete' ? 'delete' : exists ? 'edit' : 'create';
        const verb = kind === 'delete' ? 'Delete' : kind === 'edit' ? 'Update' : 'Create';
        this.insertStep({ id: stepId, kind, label: verb, path: event.path, status: 'running' });
        if (event.kind === 'file') project.beginStreaming(event.path);
        break;
      }

      case 'action.delta': {
        const action = this.actions.get(event.actionId);
        if (!action) break;
        this.pendingDeltas[action.path] = (this.pendingDeltas[action.path] ?? '') + event.text;
        this.flushTimer ??= setTimeout(() => this.flushDeltas(), DELTA_FLUSH_MS);
        break;
      }

      case 'action.completed': {
        const action = this.actions.get(event.actionId);
        if (!action) break;
        this.flushDeltas();
        this.filesChanged = true;
        this.settledSteps.add(action.stepId);

        let write: Promise<void>;
        if (event.kind === 'delete') {
          project.removeFile(event.path);
          write = runtime.deleteFile(event.path);
        } else {
          project.setFile(event.path, event.content);
          write = runtime.writeFile(event.path, event.content);
        }
        project.endStreaming(event.path);

        this.writes.push(
          write.then(
            () => chat.updateStep(this.messageId, action.stepId, { status: 'done' }),
            (error: unknown) =>
              chat.updateStep(this.messageId, action.stepId, {
                status: 'error',
                detail: describe(error),
              }),
          ),
        );
        break;
      }

      case 'action.failed': {
        const action = this.actions.get(event.actionId);
        this.flushDeltas();
        project.endStreaming(event.path);
        if (action) {
          this.settledSteps.add(action.stepId);
          chat.updateStep(this.messageId, action.stepId, { status: 'error', detail: event.reason });
        }
        break;
      }

      case 'artifact.completed':
        break;

      case 'run.warning':
        chat.updateAssistant(this.messageId, (m) => ({ warnings: [...m.warnings, event.message] }));
        break;

      case 'run.completed':
        break;

      case 'run.error':
        this.error = { code: event.code, message: event.message, retryable: event.retryable };
        break;
    }
  }

  /** Records a transport-level failure or a user cancellation. */
  fail(error: unknown, aborted: boolean): void {
    if (aborted) {
      this.cancelled = true;
      return;
    }
    this.error =
      error instanceof ApiError
        ? { code: error.code, message: error.message, retryable: error.retryable }
        : { code: 'internal', message: describe(error), retryable: true };
  }

  /** Called once the stream is over (successfully or not). Applies runtime steps. */
  async finish(): Promise<void> {
    const chat = useChatStore.getState();
    this.flushDeltas();
    this.closeDanglingActions();

    chat.updateAssistant(this.messageId, () => ({ status: 'applying' }));
    await Promise.all(this.writes);

    if (this.hasArtifact) await this.runRuntimeSteps();

    chat.updateAssistant(this.messageId, () => ({
      status: this.cancelled ? 'cancelled' : this.error ? 'error' : 'complete',
      error: this.error,
    }));
  }

  private async runRuntimeSteps(): Promise<void> {
    const chat = useChatStore.getState();
    if (!this.filesChanged) {
      chat.updateStep(this.messageId, INSTALL_STEP, {
        status: 'skipped',
        detail: 'No files changed',
      });
      chat.updateStep(this.messageId, PREVIEW_STEP, { status: 'skipped' });
      return;
    }

    chat.updateStep(this.messageId, INSTALL_STEP, { status: 'running' });
    try {
      const result = await runtime.ensureDependencies(
        useProjectStore.getState().files['package.json'],
      );
      chat.updateStep(this.messageId, INSTALL_STEP, {
        status: 'done',
        ...(result === 'unchanged' ? { detail: 'Already up to date' } : {}),
      });
    } catch (error) {
      chat.updateStep(this.messageId, INSTALL_STEP, { status: 'error', detail: describe(error) });
      chat.updateStep(this.messageId, PREVIEW_STEP, { status: 'skipped' });
      return;
    }

    chat.updateStep(this.messageId, PREVIEW_STEP, { status: 'running' });
    try {
      await runtime.ensureDevServer();
      chat.updateStep(this.messageId, PREVIEW_STEP, { status: 'done', label: 'Preview ready' });
      useUiStore.getState().setActiveTab('preview');
    } catch (error) {
      chat.updateStep(this.messageId, PREVIEW_STEP, { status: 'error', detail: describe(error) });
    }
  }

  /** File steps go before the runtime steps, in the order the model wrote them. */
  private insertStep(step: Step): void {
    const chat = useChatStore.getState();
    const message = chat.messages.find((m) => m.id === this.messageId);
    if (!message || message.role !== 'assistant') return;
    const runtimeIndex = message.steps.findIndex((s) => s.id === INSTALL_STEP);
    const steps =
      runtimeIndex === -1
        ? [...message.steps, step]
        : [...message.steps.slice(0, runtimeIndex), step, ...message.steps.slice(runtimeIndex)];
    chat.updateAssistant(this.messageId, () => ({ steps }));
  }

  private flushDeltas(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (Object.keys(this.pendingDeltas).length === 0) return;
    useProjectStore.getState().appendStreaming(this.pendingDeltas);
    this.pendingDeltas = {};
  }

  /** Steps still running after the stream ended were interrupted. */
  private closeDanglingActions(): void {
    const chat = useChatStore.getState();
    const project = useProjectStore.getState();
    const message = chat.messages.find((m) => m.id === this.messageId);
    if (!message || message.role !== 'assistant') return;

    for (const { path, stepId } of this.actions.values()) {
      const step = message.steps.find((s) => s.id === stepId);
      if (path in project.streaming) project.endStreaming(path);
      // Completed actions may still be writing; their own promise settles the step.
      if (step?.status === 'running' && !this.settledSteps.has(stepId)) {
        chat.updateStep(this.messageId, stepId, {
          status: 'error',
          detail: this.cancelled ? 'Cancelled' : 'Interrupted',
        });
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown error';
}
