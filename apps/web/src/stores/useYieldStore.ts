import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistedStorage } from '../lib/engine';

/**
 * Form state for the yield converter (spec §4.4, §10.4).
 *
 * Two modes share the form: convert fat yield to industrial yield, or work out
 * how many kilos of olives a target volume of oil needs. The mode is a stored
 * value so switching back and forth does not lose what was typed.
 */
type YieldState = {
  fatYieldTotalPct: string;
  correctionIndexPts: string;
  moisturePct: string;
  kgOlives: string;
  mode: 'forward' | 'inverse';
  targetLiters: string;

  set: (patch: Partial<Omit<YieldState, 'set'>>) => void;
  reset: () => void;
};

const initialState = {
  fatYieldTotalPct: '',
  correctionIndexPts: '3',
  moisturePct: '',
  kgOlives: '',
  mode: 'forward' as const,
  targetLiters: '',
};

export const useYieldStore = create<YieldState>()(
  persist(
    (set) => ({
      ...initialState,
      set: (patch) => set(patch),
      reset: () => set(initialState),
    }),
    {
      name: 'olivarcalc:yield',
      version: 1,
      storage: persistedStorage(),
      migrate: (persisted) => persisted as YieldState,
    },
  ),
);
