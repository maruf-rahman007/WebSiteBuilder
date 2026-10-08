import { create } from 'zustand';

export type RuntimeStatus =
  'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'stopped' | 'error';

export interface PreviewIssue {
  id: string;
  kind: 'exception' | 'rejection' | 'console';
  message: string;
  stack?: string;
  at: number;
}

const MAX_ISSUES = 20;

interface RuntimeState {
  status: RuntimeStatus;
  error: string | null;
  previewUrl: string | null;
  /** Incremented to force the preview iframe to reload. */
  previewNonce: number;
  issues: PreviewIssue[];

  setStatus: (status: RuntimeStatus, error?: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  reloadPreview: () => void;
  addIssue: (issue: Omit<PreviewIssue, 'id' | 'at'>) => void;
  clearIssues: () => void;
}

export const useRuntimeStore = create<RuntimeState>()((set) => ({
  status: 'idle',
  error: null,
  previewUrl: null,
  previewNonce: 0,
  issues: [],

  setStatus: (status, error = null) => set({ status, error }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  reloadPreview: () => set((s) => ({ previewNonce: s.previewNonce + 1, issues: [] })),
  addIssue: (issue) =>
    set((s) => {
      // Collapse repeats of the same error (e.g. thrown on every render).
      if (s.issues.some((i) => i.message === issue.message)) return s;
      const next = [...s.issues, { ...issue, id: crypto.randomUUID(), at: Date.now() }];
      return { issues: next.slice(-MAX_ISSUES) };
    }),
  clearIssues: () => set({ issues: [] }),
}));
