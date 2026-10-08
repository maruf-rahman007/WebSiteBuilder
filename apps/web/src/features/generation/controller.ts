import { streamGeneration } from '../../lib/api-client';
import { runtime } from '../../runtime/workbench-runtime';
import { useChatStore } from '../../stores/chat-store';
import { useProjectStore } from '../../stores/project-store';
import { useUiStore } from '../../stores/ui-store';
import { toApiHistory } from './history';
import { TurnSession } from './turn-session';

let activeRun: AbortController | null = null;

/**
 * Boots the WebContainer and pre-installs the template's dependencies in the
 * background, so the first preview is ready soon after generation finishes.
 */
export function warmUpRuntime(): void {
  const { files } = useProjectStore.getState();
  void runtime
    .boot(files)
    .then(() => runtime.ensureDependencies(files['package.json']))
    .catch(() => undefined); // surfaced through the runtime store
}

export async function sendPrompt(prompt: string): Promise<void> {
  const text = prompt.trim();
  if (!text || useChatStore.getState().isGenerating) return;
  useChatStore.getState().addUserMessage(text);
  await runTurn();
}

/** Re-runs the turn that produced `assistantMessageId`. */
export async function retryTurn(assistantMessageId: string): Promise<void> {
  if (useChatStore.getState().isGenerating) return;
  useChatStore.getState().removeFrom(assistantMessageId);
  await runTurn();
}

export function stopGeneration(): void {
  activeRun?.abort();
}

async function runTurn(): Promise<void> {
  const chat = useChatStore.getState();
  const model = useUiStore.getState().model;
  const messageId = chat.startAssistantMessage(model ?? 'default');
  const session = new TurnSession(messageId);
  const controller = new AbortController();
  activeRun = controller;
  chat.setGenerating(true);
  useUiStore.getState().setActiveTab('code');
  warmUpRuntime();

  try {
    const stream = streamGeneration(
      {
        messages: toApiHistory(useChatStore.getState().messages),
        files: useProjectStore.getState().files,
        ...(model ? { model } : {}),
      },
      controller.signal,
    );
    for await (const event of stream) session.handle(event);
  } catch (error) {
    session.fail(error, controller.signal.aborted);
  } finally {
    if (activeRun === controller) activeRun = null;
  }

  try {
    await session.finish();
  } finally {
    useChatStore.getState().setGenerating(false);
  }
}
