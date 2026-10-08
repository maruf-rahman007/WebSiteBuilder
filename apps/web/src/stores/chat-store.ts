import type { ErrorCode } from '@wb/shared';
import { create } from 'zustand';

export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
export type StepKind = 'create' | 'edit' | 'delete' | 'install' | 'preview';

export interface Step {
  id: string;
  kind: StepKind;
  label: string;
  path?: string;
  status: StepStatus;
  detail?: string;
}

export interface UserMessage {
  id: string;
  role: 'user';
  content: string;
  createdAt: number;
}

export type AssistantStatus = 'streaming' | 'applying' | 'complete' | 'error' | 'cancelled';

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  content: string;
  reasoning: string;
  artifactTitle: string | null;
  steps: Step[];
  warnings: string[];
  status: AssistantStatus;
  error: { code: ErrorCode | 'network'; message: string; retryable: boolean } | null;
  model: string | null;
  createdAt: number;
}

export type Message = UserMessage | AssistantMessage;

interface ChatState {
  messages: Message[];
  isGenerating: boolean;

  addUserMessage: (content: string) => string;
  startAssistantMessage: (model: string) => string;
  updateAssistant: (
    id: string,
    update: (message: AssistantMessage) => Partial<AssistantMessage>,
  ) => void;
  upsertStep: (messageId: string, step: Step) => void;
  updateStep: (messageId: string, stepId: string, patch: Partial<Step>) => void;
  setGenerating: (value: boolean) => void;
  removeFrom: (messageId: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isGenerating: false,

  addUserMessage: (content) => {
    const id = crypto.randomUUID();
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', content, createdAt: Date.now() }],
    }));
    return id;
  },

  startAssistantMessage: (model) => {
    const id = crypto.randomUUID();
    const message: AssistantMessage = {
      id,
      role: 'assistant',
      content: '',
      reasoning: '',
      artifactTitle: null,
      steps: [],
      warnings: [],
      status: 'streaming',
      error: null,
      model,
      createdAt: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, message] }));
    return id;
  },

  updateAssistant: (id, update) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id && m.role === 'assistant' ? { ...m, ...update(m) } : m,
      ),
    })),

  upsertStep: (messageId, step) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || m.role !== 'assistant') return m;
        const exists = m.steps.some((x) => x.id === step.id);
        return {
          ...m,
          steps: exists ? m.steps.map((x) => (x.id === step.id ? step : x)) : [...m.steps, step],
        };
      }),
    })),

  updateStep: (messageId, stepId, patch) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId && m.role === 'assistant'
          ? { ...m, steps: m.steps.map((x) => (x.id === stepId ? { ...x, ...patch } : x)) }
          : m,
      ),
    })),

  setGenerating: (isGenerating) => set({ isGenerating }),

  /** Drops a message and everything after it (used by retry). */
  removeFrom: (messageId) =>
    set((s) => {
      const index = s.messages.findIndex((m) => m.id === messageId);
      return index === -1 ? s : { messages: s.messages.slice(0, index) };
    }),

  reset: () => set({ messages: [], isGenerating: false }),
}));
