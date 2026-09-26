import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistedStorage } from '../lib/engine';
import type { CostLineKey } from '@olivar/calculations';

/**
 * Form state for the cost-per-hectare calculator (spec §4.6, §10.4).
 *
 * The eleven cost lines are a record rather than eleven separate fields: they
 * are summed, drawn as a pie, and each one needs the same treatment. Keeping
 * them keyed by the shared `CostLineKey` type means a line added to
 * `@olivar/calculations` shows up as a compile error here instead of silently
 * missing from the form.
 */
type CostState = {
  system: 'traditional' | 'intensive' | 'superintensive';
  irrigation: 'dry' | 'irrigated';
  hectares: string;
  yieldKgOlivesPerHa: string;
  industrialYieldPct: string;
  pricingMode: 'oil_price' | 'olive_price';
  oilPriceEurKg: string;
  olivePriceEurKg: string;
  costLines: Record<CostLineKey, string>;
  subsidiesEurPerHa: string;

  set: (patch: Partial<Omit<CostState, 'set'>>) => void;
  setCostLine: (key: CostLineKey, value: string) => void;
  reset: () => void;
};

/** Every line starts empty: a guess here would be an invented figure. */
const emptyLines = (): Record<CostLineKey, string> => ({
  pruning: '',
  fertilization: '',
  phytosanitary: '',
  irrigation: '',
  harvest: '',
  soilManagement: '',
  machinery: '',
  insurance: '',
  coopFees: '',
  other: '',
  depreciation: '',
});

const initialState = {
  system: 'intensive' as const,
  irrigation: 'irrigated' as const,
  hectares: '',
  yieldKgOlivesPerHa: '',
  industrialYieldPct: '',
  pricingMode: 'oil_price' as const,
  oilPriceEurKg: '',
  olivePriceEurKg: '',
  costLines: emptyLines(),
  subsidiesEurPerHa: '',
};

export const useCostPerHaStore = create<CostState>()(
  persist(
    (set) => ({
      ...initialState,
      set: (patch) => set(patch),
      setCostLine: (key, value) =>
        set((state) => ({ costLines: { ...state.costLines, [key]: value } })),
      reset: () => set({ ...initialState, costLines: emptyLines() }),
    }),
    {
      name: 'olivarcalc:cost-per-ha',
      version: 1,
      storage: persistedStorage(),
      migrate: (persisted) => persisted as CostState,
    },
  ),
);
