import { z } from 'zod';

import {
  Big,
  applyPercent,
  kg,
  kgWithUnit,
  liters,
  litersWithUnit,
  max,
  money,
  moneyWithUnit,
  percent,
  percentWithUnit,
  sum,
  toBig,
} from './decimal.js';
import { labels, warnings } from './labels.js';
import { ParamReader } from './params.js';
import type { BreakdownStep, CalcResult, DecimalInput, HarvestType, Money, ParamSet, Warning } from './types.js';

export const SETTLEMENT_CALC_VERSION = '1.0.0';

/**
 * Spec §5.2. The publish rule in Filament blocks a set while any of these is
 * unverified, so this is the list the admin panel reasons about.
 */
export const settlementRequiredParams = [
  'vat.reagp_compensation_pct',
  'vat.olive_general_rate_pct',
  'irpf.agricultural_withholding_pct',
  'irpf.withholding_base_includes_vat',
  'oil.density_kg_per_l',
] as const;

export const PARAM_DENSITY = 'oil.density_kg_per_l';
export const PARAM_REAGP = 'vat.reagp_compensation_pct';
export const PARAM_VAT_GENERAL = 'vat.olive_general_rate_pct';
export const PARAM_IRPF_PCT = 'irpf.agricultural_withholding_pct';
export const PARAM_IRPF_BASE_INCLUDES_VAT = 'irpf.withholding_base_includes_vat';

/** A decimal that accepts "12", "12,5" or 12.5. */
const decimal = z.union([z.string(), z.number()]);

const harvestType = z.enum(['tree', 'ground']);

export const deliverySchema = z.object({
  kgOlives: decimal.refine((v) => toBig(v).gt(0), {
    message: 'Los kilos de aceituna deben ser mayores que 0.',
  }),
  /** Rendimiento graso total from the lab analysis, spec §16. */
  fatYieldTotalPct: decimal.refine((v) => {
    const n = toBig(v);
    return n.gte(0) && n.lte(40);
  }, 'El rendimiento graso total debe estar entre 0 y 40.'),
  harvestType,
});

export const oilWithdrawnSchema = z.object({
  kg: decimal.optional(),
  liters: decimal.optional(),
  priceEurKg: decimal,
});

export const settlementSchema = z
  .object({
    deliveries: z.array(deliverySchema).min(1, {
      message: 'Añade al menos una entrega.',
    }),
    /**
     * Índice corrector (spec §16). Either this or `industrialYieldPct` must be
     * present: the user can skip the index and type the industrial yield.
     */
    correctionIndexPts: decimal.optional(),
    industrialYieldPct: decimal.optional(),
    pricingMode: z.enum(['oil_price', 'olive_price']),
    oilPriceEurKg: decimal.optional(),
    oilPriceGroundEurKg: decimal.optional(),
    olivePriceEurKg: decimal.optional(),
    olivePriceGroundEurKg: decimal.optional(),
    coopCostsEurPerKgOlive: decimal.refine((v) => toBig(v).gte(0), {
      message: 'Los costes por kg no pueden ser negativos.',
    }),
    oilWithdrawn: oilWithdrawnSchema.optional(),
    vatRegime: z.enum(['reagp', 'general', 'none']),
    applyIrpfWithholding: z.boolean().default(true),
  })
  .refine(
    (v) => v.correctionIndexPts !== undefined || v.industrialYieldPct !== undefined,
    'Indica el índice corrector o el rendimiento industrial.',
  )
  .refine(
    (v) =>
      v.pricingMode === 'oil_price'
        ? v.oilPriceEurKg !== undefined
        : v.olivePriceEurKg !== undefined,
    'Falta el precio de referencia.',
  );

export type SettlementInput = z.infer<typeof settlementSchema>;
export type DeliveryInput = z.infer<typeof deliverySchema>;

export type PerDeliveryResult = {
  index: number;
  kgOlives: string;
  industrialYieldPct: string;
  kgOil: string;
  gross: Money;
  costs: Money;
};

export type SettlementResult = CalcResult & {
  totalKgOlives: string;
  totalKgOil: string;
  litersOil: string;
  avgIndustrialYieldPct: string;
  taxableBase: Money;
  vatAmount: Money;
  withholding: Money;
  withdrawnAmount: Money;
  netToReceive: Money;
  effectivePricePerKgOlive: Money;
  perDelivery: PerDeliveryResult[];
};

function priceFor(
  harvestType: HarvestType,
  main: DecimalInput | undefined,
  ground: DecimalInput | undefined,
): Big {
  if (harvestType === 'ground' && ground !== undefined) {
    return toBig(ground);
  }
  if (main === undefined) {
    throw new Error('Missing price for the selected pricing mode.');
  }
  return toBig(main);
}

export function calculateSettlement(
  rawInput: SettlementInput,
  paramSet: ParamSet,
): SettlementResult {
  const input = settlementSchema.parse(rawInput);
  const reader = new ParamReader(paramSet);

  const density = reader.decimal(PARAM_DENSITY);
  const breakdown: BreakdownStep[] = [];
  const calcWarnings: Warning[] = [];

  const usesCorrectionIndex = input.correctionIndexPts !== undefined;
  const correctionIndex = input.correctionIndexPts !== undefined
    ? toBig(input.correctionIndexPts)
    : new Big(0);

  const perDelivery: PerDeliveryResult[] = [];
  const kgOlivesList: Big[] = [];
  const kgOilList: Big[] = [];
  const grossList: Big[] = [];
  const costList: Big[] = [];

  input.deliveries.forEach((delivery, position) => {
    const kgOlives = toBig(delivery.kgOlives);

    // industrialYield = max(fatYield - correctionIndex, 0), or the typed value.
    const industrialYieldPct = input.industrialYieldPct !== undefined
      ? toBig(input.industrialYieldPct)
      : max(toBig(delivery.fatYieldTotalPct).minus(correctionIndex), new Big(0));

    const kgOil = kgOlives.times(industrialYieldPct).div(100);

    const unitPrice = input.pricingMode === 'oil_price'
      ? priceFor(
          delivery.harvestType,
          input.oilPriceEurKg,
          input.oilPriceGroundEurKg,
        )
      : priceFor(
          delivery.harvestType,
          input.olivePriceEurKg,
          input.olivePriceGroundEurKg,
        );

    // Oil is paid on oil; olives are paid on olives.
    const gross = input.pricingMode === 'oil_price'
      ? kgOil.times(unitPrice)
      : kgOlives.times(unitPrice);

    const costs = kgOlives.times(toBig(input.coopCostsEurPerKgOlive));

    perDelivery.push({
      index: position,
      kgOlives: kg(kgOlives),
      industrialYieldPct: percent(industrialYieldPct),
      kgOil: kg(kgOil),
      gross: money(gross),
      costs: money(costs),
    });
    breakdown.push(
      {
        label: labels.settlements.perDelivery(position + 1),
        value: labels.harvestType[delivery.harvestType],
      },
      {
        label: labels.settlements.kgOlives,
        value: kgWithUnit(kgOlives),
      },
      {
        label: labels.settlements.industrialYield,
        value: percentWithUnit(industrialYieldPct),
        formula: usesCorrectionIndex
          ? `máx(${percent(toBig(delivery.fatYieldTotalPct))} − ${percent(correctionIndex)}, 0)`
          : undefined,
      },
      {
        label: labels.settlements.kgOil,
        value: kgWithUnit(kgOil),
        formula: `${kg(kgOlives)} × ${percent(industrialYieldPct)} / 100`,
      },
      {
        label: labels.settlements.gross,
        value: moneyWithUnit(gross),
      },
      {
        label: labels.settlements.costs,
        value: moneyWithUnit(costs),
      },
    );

    kgOlivesList.push(kgOlives);
    kgOilList.push(kgOil);
    grossList.push(gross);
    costList.push(costs);

    if (toBig(delivery.fatYieldTotalPct).lt(10)) {
      calcWarnings.push({ code: 'low_fat_yield', message: warnings.lowFatYield });
    }
    if (toBig(delivery.fatYieldTotalPct).gt(30)) {
      calcWarnings.push({ code: 'high_fat_yield', message: warnings.highFatYield });
    }
  });

  if (usesCorrectionIndex && correctionIndex.gt(6)) {
    calcWarnings.push({
      code: 'high_correction_index',
      message: warnings.highCorrectionIndex,
    });
  }

  const totalKgOlives = sum(kgOlivesList);
  const totalKgOil = sum(kgOilList);
  const litersOil = totalKgOil.div(density);
  const avgIndustrialYieldPct = totalKgOil.div(totalKgOlives).times(100);

  const taxableBase = sum(grossList).minus(sum(costList));

  // REAGP is a compensation of the taxable base; general regime is real VAT.
  let vatAmount = new Big(0);
  let vatLabel: string = labels.settlements.vatNone;
  if (input.vatRegime === 'reagp') {
    vatAmount = applyPercent(taxableBase, reader.decimal(PARAM_REAGP));
    vatLabel = labels.settlements.vatReagp;
  } else if (input.vatRegime === 'general') {
    vatAmount = applyPercent(taxableBase, reader.decimal(PARAM_VAT_GENERAL));
    vatLabel = labels.settlements.vatGeneral;
  }

  const baseIncludesVat = reader.bool(PARAM_IRPF_BASE_INCLUDES_VAT);
  const withholdingBase = baseIncludesVat ? taxableBase.add(vatAmount) : taxableBase;

  const withholding = input.applyIrpfWithholding
    ? applyPercent(withholdingBase, reader.decimal(PARAM_IRPF_PCT))
    : new Big(0);

  let withdrawnAmount = new Big(0);
  if (input.oilWithdrawn !== undefined) {
    const withdrawn = input.oilWithdrawn;
    const withdrawnKg = withdrawn.kg !== undefined
      ? toBig(withdrawn.kg)
      : toBig(withdrawn.liters ?? 0).times(density);
    withdrawnAmount = withdrawnKg.times(toBig(withdrawn.priceEurKg));
  }

  const netToReceive = taxableBase
    .add(vatAmount)
    .minus(withholding)
    .minus(withdrawnAmount);

  const effectivePricePerKgOlive = netToReceive.div(totalKgOlives);

  breakdown.push(
    { label: labels.settlements.totalKgOlives, value: kgWithUnit(totalKgOlives) },
    { label: labels.settlements.totalKgOil, value: kgWithUnit(totalKgOil) },
    {
      label: labels.settlements.litersOilTotal,
      value: litersWithUnit(litersOil),
      formula: `${kg(totalKgOil)} / ${percent(density)}`,
    },
    {
      label: labels.settlements.avgYield,
      value: percentWithUnit(avgIndustrialYieldPct),
    },
    {
      label: labels.settlements.taxableBase,
      value: moneyWithUnit(taxableBase),
    },
    {
      label: vatLabel,
      value: moneyWithUnit(vatAmount),
    },
    {
      label: labels.settlements.withholdingBase,
      value: moneyWithUnit(withholdingBase),
    },
    {
      label: labels.settlements.withholding,
      value: moneyWithUnit(withholding),
    },
    {
      label: labels.settlements.withdrawn,
      value: moneyWithUnit(withdrawnAmount),
    },
    {
      label: labels.settlements.netToReceive,
      value: moneyWithUnit(netToReceive),
    },
    {
      label: labels.settlements.effectivePrice,
      value: moneyWithUnit(effectivePricePerKgOlive),
    },
  );

  if (netToReceive.lt(0)) {
    calcWarnings.push({ code: 'negative_settlement', message: warnings.negativeSettlement });
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
    calcVersion: SETTLEMENT_CALC_VERSION,
    paramSetVersion: paramSet.version,
    totalKgOlives: kg(totalKgOlives),
    totalKgOil: kg(totalKgOil),
    litersOil: liters(litersOil),
    avgIndustrialYieldPct: percent(avgIndustrialYieldPct),
    taxableBase: money(taxableBase),
    vatAmount: money(vatAmount),
    withholding: money(withholding),
    withdrawnAmount: money(withdrawnAmount),
    netToReceive: money(netToReceive),
    effectivePricePerKgOlive: money(effectivePricePerKgOlive),
    perDelivery,
    breakdown,
    warnings: calcWarnings,
  };
}
