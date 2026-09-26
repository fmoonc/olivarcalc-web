import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { calculateCostPerHectare } from '../src/cost-per-hectare.js';
import { calculateHarvestCrew } from '../src/harvest-crew.js';
import { calculateYieldConverter } from '../src/yield-converter.js';
import { paramSet } from './helpers.js';

/**
 * Golden fixture runner shared by the three calculators whose fixtures share the
 * `{ calculator, cases }` shape. Settlement has its own file because it also
 * asserts per-delivery detail.
 *
 * As with the settlement fixtures, the expected numbers are hand-derived from
 * the spec's arithmetic rather than captured from a run of this code.
 */
type CalculatorName =
  | 'calculateYieldConverter'
  | 'calculateHarvestCrew'
  | 'calculateCostPerHectare';

type PlainCase = {
  name: string;
  input: Record<string, unknown>;
  params?: Record<string, string | { value: string; verified: boolean }>;
  expected: Record<string, unknown>;
};

function load(file: string): { calculator: CalculatorName; cases: PlainCase[] } {
  const raw: unknown = JSON.parse(
    readFileSync(fileURLToPath(new URL(`../fixtures/${file}`, import.meta.url)), 'utf8'),
  );
  return raw as { calculator: CalculatorName; cases: PlainCase[] };
}

function assertKeys(
  result: Record<string, unknown>,
  expected: Record<string, unknown>,
  caseName: string,
): void {
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'warningCodes') {
      continue;
    }
    expect(result[key], `${key} in "${caseName}"`).toEqual(value);
  }
}

function assertWarnings(
  result: { warnings: Array<{ code: string }> },
  expected: Record<string, unknown>,
): void {
  if (expected.warningCodes === undefined) {
    return;
  }
  expect(result.warnings.map((w) => w.code).sort()).toEqual(
    [...(expected.warningCodes as string[])].sort(),
  );
}

// --- yield converter ---------------------------------------------------------

const yieldFixtures = load('yield-converter.json');

describe('yield-converter golden fixtures', () => {
  it('has at least 10 cases', () => {
    expect(yieldFixtures.cases.length).toBeGreaterThanOrEqual(10);
  });

  for (const c of yieldFixtures.cases) {
    it(c.name, () => {
      const result = calculateYieldConverter(
        c.input as never,
        paramSet(c.params ?? {}),
      ) as unknown as Record<string, unknown>;

      assertKeys(result, c.expected, c.name);
      assertWarnings(result as never, c.expected);
    });
  }
});

// --- harvest crew ------------------------------------------------------------

const crewFixtures = load('harvest-crew.json');

describe('harvest-crew golden fixtures', () => {
  it('has at least 10 cases', () => {
    expect(crewFixtures.cases.length).toBeGreaterThanOrEqual(10);
  });

  for (const c of crewFixtures.cases) {
    it(c.name, () => {
      const result = calculateHarvestCrew(
        c.input as never,
        paramSet(c.params ?? {}),
      ) as unknown as Record<string, unknown>;

      assertKeys(result, c.expected, c.name);
      // The fixed disclaimer is required on every crew result (spec §4.7).
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'crew_estimate' })]),
      );
      assertWarnings(result as never, c.expected);
    });
  }
});

// --- cost per hectare --------------------------------------------------------

type CostFixtureFile = {
  calculator: CalculatorName;
  baseInput: Record<string, unknown>;
  baseCostLines: Record<string, unknown>;
  cases: PlainCase[];
};

const costFixture = load('cost-per-hectare.json') as unknown as CostFixtureFile;

/** A cost case only states what it changes; the rest comes from the file base. */
function costInput(c: PlainCase): Record<string, unknown> {
  const { costLines: overrides, ...rest } = c.input;
  return {
    ...costFixture.baseInput,
    costLines: { ...costFixture.baseCostLines, ...(overrides as object) },
    ...rest,
  };
}

describe('cost-per-hectare golden fixtures', () => {
  it('has at least 10 cases', () => {
    expect(costFixture.cases.length).toBeGreaterThanOrEqual(10);
  });

  for (const c of costFixture.cases) {
    it(c.name, () => {
      const result = calculateCostPerHectare(
        costInput(c) as never,
        paramSet(c.params ?? {}),
      ) as unknown as Record<string, unknown>;

      assertKeys(result, c.expected, c.name);
      assertWarnings(result as never, c.expected);
    });
  }

  it('breaks the cost down by line, dropping the zero lines', () => {
    const result = calculateCostPerHectare(costInput(costFixture.cases[0]!) as never, paramSet());

    // The base set has no zero lines except none; irrigated includes irrigation.
    expect(result.costBreakdown.length).toBe(11);
    expect(result.costBreakdown.reduce((acc, l) => acc + Number(l.value), 0)).toBe(1400);
  });
});
