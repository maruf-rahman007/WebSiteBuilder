import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type WorkbenchTab = 'code' | 'preview';
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

interface UiState {
  activeTab: WorkbenchTab;
  terminalOpen: boolean;
  previewDevice: PreviewDevice;
  /** Selected model id; null means "server default". */
  model: string | null;

  setActiveTab: (tab: WorkbenchTab) => void;
  toggleTerminal: () => void;
  setPreviewDevice: (device: PreviewDevice) => void;
  setModel: (model: string) => void;
}

/** localStorage may be unavailable (private mode, sandboxed iframes). */
const safeStorage = createJSONStorage(() => {
  try {
    const probe = '__wb_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
});

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeTab: 'code',
      terminalOpen: false,
      previewDevice: 'desktop',
      model: null,

      setActiveTab: (activeTab) => set({ activeTab }),
      toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
      setPreviewDevice: (previewDevice) => set({ previewDevice }),
      setModel: (model) => set({ model }),
    }),
    {
      name: 'wb-ui',
      storage: safeStorage,
      partialize: (s) => ({
        terminalOpen: s.terminalOpen,
        previewDevice: s.previewDevice,
        model: s.model,
      }),
    },
  ),
);
