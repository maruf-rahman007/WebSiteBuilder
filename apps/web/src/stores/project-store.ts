import type { ProjectFiles } from '@wb/shared';
import { create } from 'zustand';
import { TEMPLATE_FILES } from '../runtime/template';

interface ProjectState {
  /** Source of truth for the project. Mirrored into the WebContainer. */
  files: ProjectFiles;
  /** Files the model is currently writing: path -> partial contents. */
  streaming: Record<string, string>;
  selectedPath: string | null;
  title: string | null;

  setFile: (path: string, content: string) => void;
  removeFile: (path: string) => void;
  selectFile: (path: string | null) => void;
  setTitle: (title: string) => void;
  beginStreaming: (path: string) => void;
  appendStreaming: (chunks: Record<string, string>) => void;
  endStreaming: (path: string) => void;
  reset: () => void;
}

const initialState = () => ({
  files: { ...TEMPLATE_FILES },
  streaming: {},
  selectedPath: 'src/App.tsx',
  title: null,
});

export const useProjectStore = create<ProjectState>()((set) => ({
  ...initialState(),

  setFile: (path, content) => set((s) => ({ files: { ...s.files, [path]: content } })),
  removeFile: (path) =>
    set((s) => {
      const { [path]: _removed, ...files } = s.files;
      return { files, selectedPath: s.selectedPath === path ? null : s.selectedPath };
    }),
  selectFile: (selectedPath) => set({ selectedPath }),
  setTitle: (title) => set({ title }),
  beginStreaming: (path) =>
    set((s) => ({ streaming: { ...s.streaming, [path]: '' }, selectedPath: path })),
  appendStreaming: (chunks) =>
    set((s) => {
      const streaming = { ...s.streaming };
      for (const [path, text] of Object.entries(chunks)) {
        if (path in streaming) streaming[path] += text;
      }
      return { streaming };
    }),
  endStreaming: (path) =>
    set((s) => {
      const { [path]: _done, ...streaming } = s.streaming;
      return { streaming };
    }),
  reset: () => set(initialState()),
}));
