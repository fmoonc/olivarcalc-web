import type { ParamSet } from '../src/types.js';

/**
 * A parameter set for tests. Spec §5.2 forbids inventing official values in
 * the product, so the values here are placeholders chosen to make the
 * arithmetic easy to check by hand. `verified: true` keeps the unverified
 * warning out of the way; tests that care about it build their own set.
 */
export function paramSet(overrides: Record<string, string | { value: string; verified: boolean }> = {}): ParamSet {
  const defaults: Record<string, { value: string; verified: boolean }> = {
    'vat.reagp_compensation_pct': { value: '12', verified: true },
    'vat.olive_general_rate_pct': { value: '10', verified: true },
    'irpf.agricultural_withholding_pct': { value: '2', verified: true },
    'irpf.withholding_base_includes_vat': { value: 'false', verified: true },
    'oil.density_kg_per_l': { value: '0.916', verified: true },
    'labor.employer_cost_pct': { value: '30', verified: true },
    'wages.jaen.peon.daily_eur': { value: '60', verified: true },
    // Seed the cost-per-hectare form; the edited lines do the arithmetic.
    // One per system x irrigation combination the spec defines (spec §4.6).
    'presets.cost_per_ha.traditional.dry': { value: '{}', verified: true },
    'presets.cost_per_ha.traditional.irrigated': { value: '{}', verified: true },
    'presets.cost_per_ha.intensive.dry': { value: '{}', verified: true },
    'presets.cost_per_ha.intensive.irrigated': { value: '{}', verified: true },
    'presets.cost_per_ha.superintensive.dry': { value: '{}', verified: true },
    'presets.cost_per_ha.superintensive.irrigated': { value: '{}', verified: true },
  };

  const merged: Record<string, { value: string; verified: boolean }> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = typeof value === 'string' ? { value, verified: true } : value;
  }

  return {
    version: '2026-27.1',
    campaign: '2026-27',
    publishedAt: '2026-09-26T00:00:00+00:00',
    params: Object.fromEntries(
      Object.entries(merged).map(([key, { value, verified }]) => [
        key,
        { key, value, unit: '', verified, sourceLabel: 'test', sourceUrl: '' },
      ]),
    ),
  };
}

/** A settled-on decimal, so a tiny float wobble cannot fail a test. */
export function num(value: string | number | null | undefined): number {
  return value === null || value === undefined ? NaN : Number(value);
}
