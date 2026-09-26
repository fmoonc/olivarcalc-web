import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { calculateSettlement } from '../src/settlement.js';
import type { ParamSet } from '../src/types.js';
import { paramSet } from './helpers.js';

/**
 * Golden fixtures for the settlement calculator (spec §4.3, §4.1).
 *
 * The expected numbers in `fixtures/settlement.json` were derived by hand from
 * the spec's arithmetic, not captured from a run of this code. A formula
 * regression therefore fails here rather than quietly rewriting its own
 * baseline.
 */
type Case = {
  name: string;
  input: Parameters<typeof calculateSettlement>[0];
  params?: Record<string, string | { value: string; verified: boolean }>;
  expected: Record<string, unknown> & { warningCodes?: string[] };
};

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/settlement.json', import.meta.url)), 'utf8'),
) as { cases: Case[] };

function run(c: Case) {
  const set: ParamSet = paramSet(c.params ?? {});
  return calculateSettlement(c.input, set);
}

describe('settlement golden fixtures', () => {
  it('has at least 10 cases including the required edge cases (spec §14 Fase 1)', () => {
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(10);

    const names = fixtures.cases.map((c) => c.name).join(' | ').toLowerCase();
    expect(names).toContain('decimal comma');
    expect(names).toContain('zero oil');
    expect(names).toContain('exceeds the settlement');
  });

  for (const c of fixtures.cases) {
    it(c.name, () => {
      const result = run(c);
      const exp = c.expected;

      for (const [key, expected] of Object.entries(exp)) {
        if (key === 'warningCodes' || key === 'perDelivery') {
          continue;
        }
        expect(
          result[key as keyof typeof result],
          `${key} in "${c.name}"`,
        ).toBe(expected);
      }

      if (exp.warningCodes !== undefined) {
        expect(result.warnings.map((w) => w.code).sort()).toEqual(
          [...exp.warningCodes].sort(),
        );
      }

      if (exp.perDelivery !== undefined) {
        expect(result.perDelivery).toEqual(exp.perDelivery);
      }
    });
  }
});

describe('settlement result shape', () => {
  it('always returns a breakdown and a calc version, even when it warns', () => {
    const c = fixtures.cases[0]!;
    const result = run(c);

    expect(result.calcVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.paramSetVersion).toBe('2026-27.1');
    expect(result.breakdown.length).toBeGreaterThan(0);
    for (const step of result.breakdown) {
      expect(step.label.length).toBeGreaterThan(0);
      // A step value is normally a formatted decimal, but it can also be a
      // word: the harvest-type step reads "vuelo" / "suelo".
      expect(step.value.length).toBeGreaterThan(0);
    }

    const numericSteps = result.breakdown.filter((s) => /-?\d+[.,]\d+/.test(s.value));
    expect(numericSteps.length).toBeGreaterThan(5);
  });

  it('reports the exact unverified parameter keys', () => {
    const result = run(fixtures.cases.find((c) => c.name.includes('unverified'))!);
    const warning = result.warnings.find((w) => w.code === 'unverified_params');

    expect(warning?.keys).toEqual(['oil.density_kg_per_l']);
  });

  it('rejects an input with neither correction index nor industrial yield', () => {
    expect(() =>
      calculateSettlement(
        {
          deliveries: [{ kgOlives: '1000', fatYieldTotalPct: '18', harvestType: 'tree' }],
          pricingMode: 'oil_price',
          oilPriceEurKg: '3',
          coopCostsEurPerKgOlive: '0.06',
          vatRegime: 'none',
          applyIrpfWithholding: false,
        },
        paramSet(),
      ),
    ).toThrow();
  });

  it('rejects a fat yield above the physical 40% ceiling', () => {
    expect(() =>
      calculateSettlement(
        {
          deliveries: [{ kgOlives: '1000', fatYieldTotalPct: '55', harvestType: 'tree' }],
          correctionIndexPts: '3',
          pricingMode: 'oil_price',
          oilPriceEurKg: '3',
          coopCostsEurPerKgOlive: '0.06',
          vatRegime: 'none',
          applyIrpfWithholding: false,
        },
        paramSet(),
      ),
    ).toThrow();
  });

  it('rejects a negative coop cost', () => {
    expect(() =>
      calculateSettlement(
        {
          deliveries: [{ kgOlives: '1000', fatYieldTotalPct: '18', harvestType: 'tree' }],
          correctionIndexPts: '3',
          pricingMode: 'oil_price',
          oilPriceEurKg: '3',
          coopCostsEurPerKgOlive: '-0.06',
          vatRegime: 'none',
          applyIrpfWithholding: false,
        },
        paramSet(),
      ),
    ).toThrow();
  });
});

describe('settlement purity (spec §4.1, §15)', () => {
  it('does not mutate the caller\'s input', () => {
    const c = fixtures.cases[0]!;
    const input = structuredClone(c.input);
    const before = JSON.stringify(input);

    run(c);

    expect(JSON.stringify(c.input)).toBe(before);
    expect(input).toEqual(c.input);
  });

  it('is deterministic: same input, same output', () => {
    const c = fixtures.cases[1]!;
    expect(JSON.stringify(run(c))).toBe(JSON.stringify(run(c)));
  });
});
