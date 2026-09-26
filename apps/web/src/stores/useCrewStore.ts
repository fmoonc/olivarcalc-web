import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistedStorage } from '../lib/engine';

/**
 * Form state for the harvest crew calculator (spec §4.7, §10.4).
 */
type CrewState = {
  workers: string;
  days: string;
  province: string;
  category: string;
  dailyWageOverrideEur: string;
  kgPerWorkerPerDay: string;
  machineryCostPerDayEur: string;
  transportCostPerDayEur: string;
  employerCostMode: 'param' | 'manual';
  employerCostPctManual: string;

  set: (patch: Partial<Omit<CrewState, 'set'>>) => void;
  reset: () => void;
};

const initialState = {
  workers: '',
  days: '',
  // Spec §5.2 seeds these provinces with a wage row; the catalog lives in
  // Laravel, so this list only offers what is actually published.
  province: 'jaen',
  category: 'peon',
  dailyWageOverrideEur: '',
  kgPerWorkerPerDay: '',
  machineryCostPerDayEur: '',
  transportCostPerDayEur: '',
  employerCostMode: 'param' as const,
  employerCostPctManual: '',
};

export const useCrewStore = create<CrewState>()(
  persist(
    (set) => ({
      ...initialState,
      set: (patch) => set(patch),
      reset: () => set(initialState),
    }),
    {
      name: 'olivarcalc:crew',
      version: 1,
      storage: persistedStorage(),
      migrate: (persisted) => persisted as CrewState,
    },
  ),
);

/** The provinces seeded in spec §5.2. Display names for the form. */
export const provinces: Array<[string, string]> = [
  ['jaen', 'Jaén'],
  ['cordoba', 'Córdoba'],
  ['granada', 'Granada'],
  ['sevilla', 'Sevilla'],
  ['malaga', 'Málaga'],
  ['badajoz', 'Badajoz'],
  ['ciudad_real', 'Ciudad Real'],
  ['toledo', 'Toledo'],
];
