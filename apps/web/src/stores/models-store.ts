import type { ModelInfo } from '@wb/shared';
import { create } from 'zustand';
import { fetchModels } from '../lib/api-client';
import { useUiStore } from './ui-store';

interface ModelsState {
  models: ModelInfo[];
  defaultModel: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  load: () => Promise<void>;
}

export const useModelsStore = create<ModelsState>()((set, get) => ({
  models: [],
  defaultModel: null,
  status: 'idle',

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading' });
    try {
      const { models, defaultModel } = await fetchModels();
      set({ models, defaultModel, status: 'ready' });
      // Drop a remembered model that the server no longer offers.
      const ui = useUiStore.getState();
      if (!ui.model || !models.some((m) => m.id === ui.model)) ui.setModel(defaultModel);
    } catch {
      set({ status: 'error' });
    }
  },
}));
