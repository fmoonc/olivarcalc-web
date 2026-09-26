import { z } from 'zod';

import {
  applyPercent,
  kg,
  kgWithUnit,
  money,
  moneyWithUnit,
  toBig,
} from './decimal.js';
import { labels, warnings } from './labels.js';
import { ParamReader } from './params.js';
import type { BreakdownStep, CalcResult, ParamSet, Warning } from './types.js';

export const HARVEST_CREW_CALC_VERSION = '1.0.0';

/**
 * `wages.{province}.{category}.daily_eur` and `labor.employer_cost_pct` are
 * both templated; the province and category come from the user's form (spec §4.7).
 */
export const requiredParams = [
  'wages.{province}.{category}.daily_eur',
  'labor.employer_cost_pct',
] as const;

export function wageParamKey(province: string, category: string): string {
  return `wages.${province}.${category}.daily_eur`;
}

export const PARAM_EMPLOYER_COST_PCT = 'labor.employer_cost_pct';

const decimal = z.union([z.string(), z.number()]);

export const harvestCrewSchema = z.object({
  workers: decimal.refine((v) => toBig(v).gt(0), {
    message: 'Debe haber al menos un trabajador.',
  }),
  days: decimal.refine((v) => toBig(v).gt(0), {
    message: 'El número de días debe ser mayor que 0.',
  }),
  province: z.string().min(1, { message: 'Indica la provincia.' }),
  category: z.string().min(1, { message: 'Indica la categoría.' }),
  /** Overrides the convenio wage when the owner knows better. */
  dailyWageOverrideEur: decimal.optional(),
  kgPerWorkerPerDay: decimal.refine((v) => toBig(v).gt(0), {
    message: 'La estimación de kg por trabajador y día debe ser mayor que 0.',
  }),
  machineryCostPerDayEur: decimal.optional(),
  transportCostPerDayEur: decimal.optional(),
  employerCostMode: z.enum(['param', 'manual']),
  employerCostPctManual: decimal.optional(),
});

export type HarvestCrewInput = z.infer<typeof harvestCrewSchema>;

export type HarvestCrewResult = CalcResult & {
  dailyWage: string;
  wagesTotal: string;
  employerCost: string;
  opsTotal: string;
  total: string;
  kgHarvested: string;
  costPerKgOlive: string;
};

export function calculateHarvestCrew(
  rawInput: HarvestCrewInput,
  paramSet: ParamSet,
): HarvestCrewResult {
  const input = harvestCrewSchema.parse(rawInput);
  const reader = new ParamReader(paramSet);

  const workers = toBig(input.workers);
  const days = toBig(input.days);

  // An override means we do not read the wage parameter at all, so a stale
  // published wage cannot also drag the unverified warning in.
  const dailyWage = input.dailyWageOverrideEur !== undefined
    ? toBig(input.dailyWageOverrideEur)
    : reader.decimal(wageParamKey(input.province, input.category));

  const wagesTotal = workers.times(days).times(dailyWage);

  const employerCostPct = input.employerCostMode === 'param'
    ? reader.decimal(PARAM_EMPLOYER_COST_PCT)
    : toBig(input.employerCostPctManual ?? 0);
  const employerCost = applyPercent(wagesTotal, employerCostPct);

  const opsTotal = days.times(
    toBig(input.machineryCostPerDayEur ?? 0).add(toBig(input.transportCostPerDayEur ?? 0)),
  );

  const total = wagesTotal.add(employerCost).add(opsTotal);

  const kgHarvested = workers.times(days).times(toBig(input.kgPerWorkerPerDay));
  const costPerKgOlive = total.div(kgHarvested);

  const breakdown: BreakdownStep[] = [
    {
      label: labels.harvestCrew.dailyWage,
      value: `${money(dailyWage)} ${labels.units.eurosPerDay}`,
    },
    {
      label: labels.harvestCrew.wagesTotal,
      value: moneyWithUnit(wagesTotal),
      formula: `${workers.toFixed(0)} × ${days.toFixed(0)} × ${money(dailyWage)}`,
    },
    {
      label: labels.harvestCrew.employerCost,
      value: moneyWithUnit(employerCost),
    },
    {
      label: labels.harvestCrew.opsTotal,
      value: moneyWithUnit(opsTotal),
    },
    { label: labels.harvestCrew.total, value: moneyWithUnit(total) },
    { label: labels.harvestCrew.kgHarvested, value: kgWithUnit(kgHarvested) },
    {
      label: labels.harvestCrew.costPerKgOlive,
      value: `${money(costPerKgOlive)} €/kg`,
      formula: `${money(total)} / ${kg(kgHarvested)}`,
    },
  ];

  const calcWarnings: Warning[] = [
    { code: 'crew_estimate', message: warnings.crewEstimate },
  ];

  const unverifiedKeys = reader.unverifiedKeys;
  if (unverifiedKeys.length > 0) {
    calcWarnings.push({
      code: 'unverified_params',
      message: warnings.unverifiedParams,
      keys: unverifiedKeys,
    });
  }

  return {
    calcVersion: HARVEST_CREW_CALC_VERSION,
    paramSetVersion: paramSet.version,
    dailyWage: money(dailyWage),
    wagesTotal: money(wagesTotal),
    employerCost: money(employerCost),
    opsTotal: money(opsTotal),
    total: money(total),
    kgHarvested: kg(kgHarvested),
    costPerKgOlive: money(costPerKgOlive),
    breakdown,
    warnings: calcWarnings,
  };
}
