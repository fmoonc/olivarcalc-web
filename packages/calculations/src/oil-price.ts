import { Big, percent, toBig } from './decimal.js';
import type { DecimalInput } from './types.js';

/**
 * Oil price utilities (spec §4.5). These are data helpers, not a calculator:
 * they never take a ParamSet and emit no breakdown.
 */

/** €/ton -> €/kg. */
export function eurPerTonToEurPerKg(price: DecimalInput): string {
  return toBig(price).div(1000).round(4, Big.roundHalfUp).toFixed(4);
}

/** Week-over-week change as a percentage. Negative means the price fell. */
export function weeklyChangePct(current: DecimalInput, previous: DecimalInput): string | null {
  const prev = toBig(previous);
  if (prev.eq(0)) {
    return null;
  }
  return percent(toBig(current).minus(prev).div(prev).times(100));
}

export const DEFAULT_CAMPAIGN_START = '10-01';

function parseMonthDay(value: string): { month: number; day: number } {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (match === null) {
    throw new Error(`campaign.start_month_day must be "MM-DD", got "${value}"`);
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`campaign.start_month_day out of range: "${value}"`);
  }
  return { month, day };
}

/**
 * The oil campaign a date falls into. The campaign starts on
 * `campaign.start_month_day` (default 1 October, spec §5.2) and runs a year.
 *
 * 2026-09-30 -> "2025-26"
 * 2026-10-01 -> "2026-27"
 *
 * Takes an explicit date rather than reading the clock, so results stay
 * deterministic and testable (spec §4.1).
 */
export function campaignOf(
  date: Date,
  startMonthDay: string = DEFAULT_CAMPAIGN_START,
): string {
  const { month: startMonth, day: startDay } = parseMonthDay(startMonthDay);

  const year = date.getFullYear();
  const isBeforeStart =
    date.getMonth() + 1 < startMonth ||
    (date.getMonth() + 1 === startMonth && date.getDate() < startDay);

  const campaignStartYear = isBeforeStart ? year - 1 : year;
  const endYear = (campaignStartYear + 1) % 100;
  return `${campaignStartYear}-${String(endYear).padStart(2, '0')}`;
}

export type WeeklyPrice = {
  weekStart: string;
  /** €/tonne as reported by the source. */
  avgPriceEurT: DecimalInput;
};

export type CampaignSummary = {
  campaign: string;
  meanEurT: string;
  maxEurT: string;
  minEurT: string;
  lastEurT: string;
  weeks: number;
};

const TWO_DP = 2;

/** Mean / max / min / last of a campaign's weekly prices, in €/tonne. */
export function summarizeCampaign(
  campaign: string,
  prices: readonly WeeklyPrice[],
): CampaignSummary | null {
  if (prices.length === 0) {
    return null;
  }

  const sorted = [...prices].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const values = sorted.map((p) => toBig(p.avgPriceEurT));

  const total = values.reduce((acc, v) => acc.add(v), new Big(0));
  const mean = total.div(values.length);
  const maxV = values.reduce((acc, v) => (v.gt(acc) ? v : acc), values[0]!);
  const minV = values.reduce((acc, v) => (v.lt(acc) ? v : acc), values[0]!);
  const lastV = values[values.length - 1]!;

  return {
    campaign,
    meanEurT: mean.round(TWO_DP, Big.roundHalfUp).toFixed(2),
    maxEurT: maxV.round(TWO_DP, Big.roundHalfUp).toFixed(2),
    minEurT: minV.round(TWO_DP, Big.roundHalfUp).toFixed(2),
    lastEurT: lastV.round(TWO_DP, Big.roundHalfUp).toFixed(2),
    weeks: values.length,
  };
}
