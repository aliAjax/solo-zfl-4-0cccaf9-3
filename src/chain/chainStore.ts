import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChainAction, ChainState } from './chainTypes';
import { emptyChain, reduceChain } from './chainRules';
import { buildSeed } from './chainSeed';
import { generateId } from '../utils/helpers';

interface ChainStore {
  state: ChainState;
  initialized: boolean;
  initIfEmpty: () => void;
  resetDemo: () => void;
  /** 执行一次保管链操作；成功返回 {}，失败返回中文错误，重复 token 返回 idempotent */
  dispatch: (action: ChainAction) => { error?: string; idempotent?: boolean };
}

export const useChainStore = create<ChainStore>()(
  persist(
    (set, get) => ({
      state: emptyChain(),
      initialized: false,
      initIfEmpty: () => {
        const { state, initialized } = get();
        if (initialized) return;
        if (state.vials.length === 0 && state.timeline.length === 0) {
          set({ state: buildSeed(), initialized: true });
        } else {
          set({ initialized: true });
        }
      },
      resetDemo: () => set({ state: buildSeed(), initialized: true }),
      dispatch: (action) => {
        const result = reduceChain(get().state, action, {
          now: new Date().toISOString(),
          genId: generateId,
        });
        if (result.error) return { error: result.error };
        if (result.idempotent) return { idempotent: true };
        set({ state: result.state });
        return {};
      },
    }),
    {
      name: 'scent-chain-storage-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ state: s.state }),
    },
  ),
);
