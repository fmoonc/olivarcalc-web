/**
 * @olivar/calculations
 *
 * Pure calculation functions for OlivarCalc. Every formula in the product
 * lives here and nowhere else: the Laravel API validates and stores what the
 * user saw, it does not recompute (spec §4, §7.4).
 *
 * Constraints that must hold for this package (spec §4.1, §15):
 * - pure functions, no I/O
 * - no system clock: dates are always passed in
 * - no browser APIs, so React Native / Hermes can import it
 * - decimal arithmetic only, never a raw float accumulator
 */

export * from './types.js';
export * from './decimal.js';
export { ParamReader } from './params.js';
export { labels, warnings } from './labels.js';

export {
  SETTLEMENT_CALC_VERSION,
  settlementSchema,
  settlementRequiredParams,
  deliverySchema,
  calculateSettlement,
} from './settlement.js';
export type {
  SettlementInput,
  SettlementResult,
  DeliveryInput,
  PerDeliveryResult,
} from './settlement.js';

export {
  YIELD_CONVERTER_CALC_VERSION,
  yieldConverterSchema,
  calculateYieldConverter,
} from './yield-converter.js';
export type { YieldConverterInput, YieldConverterResult } from './yield-converter.js';

export {
  eurPerTonToEurPerKg,
  weeklyChangePct,
  campaignOf,
  summarizeCampaign,
  DEFAULT_CAMPAIGN_START,
} from './oil-price.js';
export type { WeeklyPrice, CampaignSummary } from './oil-price.js';

export {
  COST_PER_HECTARE_CALC_VERSION,
  costPerHectareSchema,
  costLineKeys,
  calculateCostPerHectare,
  presetKeyFor,
} from './cost-per-hectare.js';
export type {
  CostPerHectareInput,
  CostPerHectareResult,
  CostLineKey,
  CostLines,
} from './cost-per-hectare.js';

export {
  HARVEST_CREW_CALC_VERSION,
  harvestCrewSchema,
  calculateHarvestCrew,
  wageParamKey,
  PARAM_EMPLOYER_COST_PCT,
} from './harvest-crew.js';
export type { HarvestCrewInput, HarvestCrewResult } from './harvest-crew.js';
