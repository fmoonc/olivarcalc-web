import { z } from 'zod';

import { Big, kg, kgWithUnit, liters, litersWithUnit, max, percent, percentWithUnit, toBig } from './decimal.js';
import { labels, warnings } from './labels.js';
import { ParamReader } from './params.js';
import type { CalcResult, ParamSet, Warning } from './types.js';

export const YIELD_CONVERTER_CALC_VERSION = '1.0.0';
export const requiredParams = ['oil.density_kg_per_l'] as const;

const decimal = z.union([z.string(), z.number()]);

export const yieldConverterSchema = z.object({
  fatYieldTotalPct: decimal.refine((v) => {
    const n = toBig(v);
    return n.gte(0) && n.lte(40);
  }, 'El rendimiento graso total debe estar entre 0 y 40.'),
  moisturePct: decimal.optional(),
  correctionIndexPts: decimal.optional(),
  kgOlives: decimal.optional(),
  /** Inverse mode: "how many kg do I need for X litres?". */
  targetLiters: decimal.optional(),
});

export type YieldConverterInput = z.infer<typeof yieldConverterSchema>;

export type YieldConverterResult = CalcResult & {
  industrialYieldPct: string;
  fatYieldDryPct: string | null;
  kgOil: string | null;
  litersOil: string | null;
  kgOlivesPerKgOil: string | null;
  kgOlivesPerLiter: string | null;
  /** Inverse mode only. */
  kgOlivesNeeded: string | null;
  litersForTarget: string | null;
};

export function calculateYieldConverter(
  rawInput: YieldConverterInput,
  paramSet: ParamSet,
): YieldConverterResult {
  const input = yieldConverterSchema.parse(rawInput);
  const reader = new ParamReader(paramSet);
  const density = reader.decimal('oil.density_kg_per_l');

  const fatYieldTotalPct = toBig(input.fatYieldTotalPct);
  const correctionIndex = input.correctionIndexPts !== undefined
    ? toBig(input.correctionIndexPts)
    : new Big(0);

  // max(..., 0): a correction index above the fat yield yields no oil, not negative oil.
  const industrialYieldPct = max(fatYieldTotalPct.minus(correctionIndex), new Big(0));

  const breakdown = [];
  const calcWarnings: Warning[] = [];

  // Rendimiento graso sobre seco: the figure referred to moisture-free olives.
  const fatYieldDryPct = input.moisturePct !== undefined
    ? fatYieldTotalPct.times(100).div(new Big(100).minus(toBig(input.moisturePct)))
    : null;

  const kgOil = input.kgOlives !== undefined
    ? toBig(input.kgOlives).times(industrialYieldPct).div(100)
    : null;

  const litersOil = kgOil !== null ? kgOil.div(density) : null;

  // Undefined at zero industrial yield: "kg of olives per kg of oil" is infinite.
  const hasYield = industrialYieldPct.gt(0);
  const kgOlivesPerKgOil = hasYield ? new Big(100).div(industrialYieldPct) : null;
  const kgOlivesPerLiter = kgOlivesPerKgOil !== null ? kgOlivesPerKgOil.times(density) : null;

  // Inverse mode: given a target volume, how many kg of olives are needed?
  const litersForTarget = input.targetLiters !== undefined
    ? toBig(input.targetLiters)
    : null;
  const kgOlivesNeeded = litersForTarget !== null && kgOlivesPerKgOil !== null
    ? litersForTarget.times(density).times(kgOlivesPerKgOil)
    : null;

  breakdown.push(
    {
      label: labels.yieldConverter.industrialYield,
      value: percentWithUnit(industrialYieldPct),
      formula:
        input.correctionIndexPts !== undefined
          ? `máx(${percent(fatYieldTotalPct)} − ${percent(correctionIndex)}, 0)`
          : undefined,
    },
  );

  if (fatYieldDryPct !== null) {
    breakdown.push({
      label: labels.yieldConverter.fatYieldDry,
      value: percentWithUnit(fatYieldDryPct),
      formula: `${percent(fatYieldTotalPct)} × 100 / (100 − ${percent(toBig(input.moisturePct ?? 0))})`,
    });
  }

  if (kgOil !== null) {
    breakdown.push(
      {
        label: labels.yieldConverter.kgOil,
        value: kgWithUnit(kgOil),
        formula: `${kg(toBig(input.kgOlives ?? 0))} × ${percent(industrialYieldPct)} / 100`,
      },
      {
        label: labels.yieldConverter.litersOil,
        value: litersWithUnit(litersOil ?? new Big(0)),
      },
    );
  }

  if (kgOlivesPerKgOil !== null && kgOlivesPerLiter !== null) {
    breakdown.push(
      { label: labels.yieldConverter.kgOlivesPerKgOil, value: `${kg(kgOlivesPerKgOil)} kg` },
      { label: labels.yieldConverter.kgOlivesPerLiter, value: `${kg(kgOlivesPerLiter)} kg` },
    );
  }

  if (litersForTarget !== null) {
    breakdown.push({
      label: labels.yieldConverter.inverseLiters,
      value: litersWithUnit(litersForTarget),
    });
  }
  if (kgOlivesNeeded !== null) {
    breakdown.push({
      label: labels.yieldConverter.inverseKgOlives,
      value: kgWithUnit(kgOlivesNeeded),
    });
  }

  if (!hasYield) {
    calcWarnings.push({
      code: 'zero_industrial_yield',
      message: warnings.zeroIndustrialYield,
    });
  }

  if (fatYieldTotalPct.lt(10)) {
    calcWarnings.push({ code: 'low_fat_yield', message: warnings.lowFatYield });
  }
  if (fatYieldTotalPct.gt(30)) {
    calcWarnings.push({ code: 'high_fat_yield', message: warnings.highFatYield });
  }

  const unverifiedKeys = reader.unverifiedKeys;
  if (unverifiedKeys.length > 0) {
    calcWarnings.push({
      code: 'unverified_params',
      message: warnings.unverifiedParams,
      keys: unverifiedKeys,
    });
  }

  return {
    calcVersion: YIELD_CONVERTER_CALC_VERSION,
    paramSetVersion: paramSet.version,
    industrialYieldPct: percent(industrialYieldPct),
    fatYieldDryPct: fatYieldDryPct === null ? null : percent(fatYieldDryPct),
    kgOil: kgOil === null ? null : kg(kgOil),
    litersOil: litersOil === null ? null : liters(litersOil),
    kgOlivesPerKgOil: kgOlivesPerKgOil === null ? null : kg(kgOlivesPerKgOil),
    kgOlivesPerLiter: kgOlivesPerLiter === null ? null : kg(kgOlivesPerLiter),
    kgOlivesNeeded: kgOlivesNeeded === null ? null : kg(kgOlivesNeeded),
    litersForTarget: litersForTarget === null ? null : liters(litersForTarget),
    breakdown,
    warnings: calcWarnings,
  };
}
