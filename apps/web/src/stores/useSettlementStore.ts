import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistedStorage } from '../lib/engine';

/**
 * Form state for the settlement calculator (spec §10.4).
 *
 * Persisted to localStorage with a version, so a farmer who loses signal in the
 * field does not lose the delivery figures they just typed. The `migrate`
 * hook is where a future schema change goes.
 */
export type Delivery = {
  id: string;
  kgOlives: string;
  fatYieldTotalPct: string;
  harvestType: 'tree' | 'ground';
};

type SettlementState = {
  deliveries: Delivery[];
  correctionIndexPts: string;
  useIndustrialYield: boolean;
  industrialYieldPct: string;
  pricingMode: 'oil_price' | 'olive_price';
  oilPriceEurKg: string;
  oilPriceGroundEurKg: string;
  olivePriceEurKg: string;
  olivePriceGroundEurKg: string;
  coopCostsEurPerKgOlive: string;
  vatRegime: 'reagp' | 'general' | 'none';
  applyIrpfWithholding: boolean;
  withdrawOil: boolean;
  withdrawnKg: string;
  withdrawnLiters: string;
  withdrawnPriceEurKg: string;

  addDelivery: () => void;
  removeDelivery: (id: string) => void;
  updateDelivery: (id: string, patch: Partial<Omit<Delivery, 'id'>>) => void;
  set: (patch: Partial<Omit<SettlementState, 'deliveries' | 'addDelivery' | 'removeDelivery' | 'updateDelivery' | 'set'>>) => void;
  reset: () => void;
};

let deliveryCounter = 0;
const newDelivery = (): Delivery => ({
  id: `d${++deliveryCounter}`,
  kgOlives: '',
  fatYieldTotalPct: '',
  harvestType: 'tree',
});

const initialState = {
  deliveries: [newDelivery()],
  correctionIndexPts: '3',
  useIndustrialYield: false,
  industrialYieldPct: '',
  pricingMode: 'oil_price' as const,
  oilPriceEurKg: '',
  oilPriceGroundEurKg: '',
  olivePriceEurKg: '',
  olivePriceGroundEurKg: '',
  coopCostsEurPerKgOlive: '',
  vatRegime: 'reagp' as const,
  applyIrpfWithholding: true,
  withdrawOil: false,
  withdrawnKg: '',
  withdrawnLiters: '',
  withdrawnPriceEurKg: '',
};

export const useSettlementStore = create<SettlementState>()(
  persist(
    (set) => ({
      ...initialState,

      addDelivery: () => set((state) => ({ deliveries: [...state.deliveries, newDelivery()] })),

      removeDelivery: (id) =>
        set((state) => ({
          // Never leave the form with zero deliveries: the schema requires at
          // least one, and an empty list is not a useful state to persist.
          deliveries:
            state.deliveries.length > 1
              ? state.deliveries.filter((d) => d.id !== id)
              : state.deliveries,
        })),

      updateDelivery: (id, patch) =>
        set((state) => ({
          deliveries: state.deliveries.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),

      set: (patch) => set(patch),

      reset: () => set({ ...initialState, deliveries: [newDelivery()] }),
    }),
    {
      name: 'olivarcalc:settlement',
      version: 1,
      // Inert on the server; see the note in engine.ts.
      storage: persistedStorage(),
      migrate: (persisted) => persisted as SettlementState,
    },
  ),
);
