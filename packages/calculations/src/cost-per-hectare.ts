import { z } from 'zod';

import {
  Big,
  kg,
  kgWithUnit,
  money,
  moneyWithUnit,
  percentWithUnit,
  sum,
  toBig,
} from './decimal.js';
import { labels, warnings } from './labels.js';
import { ParamReader } from './params.js';
import type { BreakdownStep, CalcResult, DecimalInput, ParamSet, Warning } from './types.js';

export const COST_PER_HECTARE_CALC_VERSION = '1.0.0';

/**
 * The preset key the admin panel loads, e.g.
 * `presets.cost_per_ha.intensive.irrigaated`. Kept as a template so the set of
 * published presets stays in Laravel (spec §4.6).
 */
export const requiredParams = [
  'presets.cost_per_ha.{system}.{irrigation}',
] as const;

export function presetKeyFor(system: string, irrigation: string): string {
  return `presets.cost_per_ha.${system}.${irrigation}`;
}

const decimal = z.union([z.string(), z.number()]);

export const costLineKeys = [
  'pruning',
  'fertilization',
  'phytosanitary',
  'irrigation',
  'harvest',
  'soilManagement',
  'machinery',
  'insurance',
  'coopFees',
  'other',
  'depreciation',
] as const;

export type CostLineKey = (typeof costLineKeys)[number];

export const costPerHectareSchema = z.object({
  system: z.enum(['traditional', 'intensive', 'superintensive']),
  irrigation: z.enum(['dry', 'irrigated']),
  hectares: decimal.refine((v) => toBig(v).gt(0), {
    message: 'Las hectáreas deben ser mayores que 0.',
  }),
  treesPerHa: decimal.optional(),
  yieldKgOlivesPerHa: decimal.refine((v) => toBig(v).gt(0), {
    message: 'La producción por hectárea debe ser mayor que 0.',
  }),
  industrialYieldPct: decimal.refine((v) => {
    const n = toBig(v);
    return n.gte(0) && n.lte(40);
  }, 'El rendimiento industrial debe estar entre 0 y 40.'),
  pricingMode: z.enum(['oil_price', 'olive_price']),
  oilPriceEurKg: decimal.optional(),
  olivePriceEurKg: decimal.optional(),
  costLines: z.object(
    Object.fromEntries(
      costLineKeys.map((key) => [
        key,
        decimal.refine((v) => toBig(v).gte(0), { message: 'Los costes no pueden ser negativos.' }),
      ]),
    ) as Record<CostLineKey, typeof decimal>,
  ),
  subsidiesEurPerHa: decimal.optional(),
});

export type CostPerHectareInput = z.infer<typeof costPerHectareSchema>;
export type CostLines = Record<CostLineKey, DecimalInput>;

export type CostPerHectareResult = CalcResult & {
  totalCostPerHa: string;
  totalCost: string;
  kgOilPerHa: string;
  revenuePerHa: string;
  marginPerHa: string;
  costPerKgOlive: string;
  costPerKgOil: string;
  breakEvenOilPrice: string;
  /** Cost split by line, for the pie chart (spec §4.6). */
  costBreakdown: Array<{ key: CostLineKey; label: string; value: string }>;
};

export function calculateCostPerHectare(
  rawInput: CostPerHectareInput,
  paramSet: ParamSet,
): CostPerHectareResult {
  const input = costPerHectareSchema.parse(rawInput);
  const reader = new ParamReader(paramSet);

  // The preset seeds the cost lines but the edited lines do the arithmetic, so
  // the value is not parsed here. It is still touched: an unverified preset
  // means the whole result rests on provisional figures (spec §4.6, §0.2).
  reader.touch(presetKeyFor(input.system, input.irrigation));

  const hectares = toBig(input.hectares);
  const yieldKgOlivesPerHa = toBig(input.yieldKgOlivesPerHa);
  const industrialYieldPct = toBig(input.industrialYieldPct);

  const totalCostPerHa = sum(
    costLineKeys.map((key) => toBig(input.costLines[key])),
  );
  const totalCost = totalCostPerHa.times(hectares);

  const kgOilPerHa = yieldKgOlivesPerHa.times(industrialYieldPct).div(100);

  const revenuePerHa = input.pricingMode === 'oil_price'
    ? kgOilPerHa.times(toBig(input.oilPriceEurKg ?? 0))
    : yieldKgOlivesPerHa.times(toBig(input.olivePriceEurKg ?? 0));

  const subsidies = input.subsidiesEurPerHa !== undefined
    ? toBig(input.subsidiesEurPerHa)
    : new Big(0);

  const marginPerHa = revenuePerHa.add(subsidies).minus(totalCostPerHa);

  const costPerKgOlive = totalCostPerHa.div(yieldKgOlivesPerHa);
  const costPerKgOil = kgOilPerHa.gt(0) ? totalCostPerHa.div(kgOilPerHa) : new Big(0);

  // Subsidies lower the price at which the grove breaks even.
  const breakEvenOilPrice = kgOilPerHa.gt(0)
    ? totalCostPerHa.minus(subsidies).div(kgOilPerHa)
    : new Big(0);

  const costBreakdown = costLineKeys
    .map((key) => ({
      key,
      label: labels.costLines[key],
      value: money(toBig(input.costLines[key])),
    }))
    .filter((line) => !toBig(line.value).eq(0));

  const breakdown: BreakdownStep[] = costBreakdown.map((line) => ({
    label: line.label,
    value: moneyWithUnit(toBig(input.costLines[line.key])),
  }));

  breakdown.push(
    { label: labels.costPerHectare.totalCostPerHa, value: moneyWithUnit(totalCostPerHa) },
    { label: labels.costPerHectare.totalCost, value: moneyWithUnit(totalCost) },
    {
      label: labels.costPerHectare.kgOilPerHa,
      value: kgWithUnit(kgOilPerHa),
      formula: `${kg(yieldKgOlivesPerHa)} × ${percentWithUnit(industrialYieldPct)} / 100`,
    },
    { label: labels.costPerHectare.revenuePerHa, value: moneyWithUnit(revenuePerHa) },
    { label: labels.costPerHectare.subsidies, value: moneyWithUnit(subsidies) },
    { label: labels.costPerHectare.marginPerHa, value: moneyWithUnit(marginPerHa) },
    { label: labels.costPerHectare.costPerKgOlive, value: `${money(costPerKgOlive)} €/kg` },
    { label: labels.costPerHectare.costPerKgOil, value: `${money(costPerKgOil)} €/kg` },
    { label: labels.costPerHectare.breakEven, value: `${money(breakEvenOilPrice)} €/kg` },
  );

  const unverifiedKeys = reader.unverifiedKeys;
  const calcWarnings: Warning[] = unverifiedKeys.length > 0
    ? [{
        code: 'unverified_params',
        message: warnings.unverifiedParams,
        keys: unverifiedKeys,
      }]
    : [];

  return {
    calcVersion: COST_PER_HECTARE_CALC_VERSION,
    paramSetVersion: paramSet.version,
    totalCostPerHa: money(totalCostPerHa),
    totalCost: money(totalCost),
    kgOilPerHa: kg(kgOilPerHa),
    revenuePerHa: money(revenuePerHa),
    marginPerHa: money(marginPerHa),
    costPerKgOlive: money(costPerKgOlive),
    costPerKgOil: money(costPerKgOil),
    breakEvenOilPrice: money(breakEvenOilPrice),
    costBreakdown,
    breakdown,
    warnings: calcWarnings,
  };
}
