import Big from 'big.js';

import type { DecimalInput } from './types.js';

/**
 * Decimal arithmetic helpers.
 *
 * big.js 7 renamed the chainable operations: `plus`/`minus`/`times` are now
 * `add`/`sub`/`mul`. All arithmetic in this package goes through Big, and
 * rounding happens only on the way out (spec §4.1).
 */

/**
 * Convert a boundary value to Big.
 *
 * Accepts "1234.56" and 1234.56. A decimal comma is normalised first, because
 * the target user types "1234,56" (spec §10.5).
 */
export function toBig(value: DecimalInput): Big {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Not a finite decimal: ${String(value)}`);
    }
    return new Big(value);
  }

  const normalised = value.trim().replace(',', '.');
  if (normalised === '') {
    throw new TypeError('Empty decimal');
  }
  return new Big(normalised);
}

/** Sum a list of Bigs without ever touching a float accumulator. */
export function sum(values: readonly Big[]): Big {
  return values.reduce((acc, v) => acc.add(v), new Big(0));
}

/** Greater of two values, as Bigs. */
export function max(a: Big, b: Big): Big {
  return a.gt(b) ? a : b;
}

function roundTo(value: Big, dp: number): Big {
  return value.round(dp, Big.roundHalfUp);
}

/** Money: 2 decimals, half-up (spec §4.1). */
export function money(value: Big): string {
  return roundTo(value, 2).toFixed(2);
}

/** Percentages: 2 decimals, half-up (spec §4.1). */
export function percent(value: Big): string {
  return roundTo(value, 2).toFixed(2);
}

/** Kilograms: 2 decimals, half-up (spec §4.1). */
export function kg(value: Big): string {
  return roundTo(value, 2).toFixed(2);
}

/** Litres: 1 decimal, half-up (spec §4.1). */
export function liters(value: Big): string {
  return roundTo(value, 1).toFixed(1);
}

/** Volume as "1234.56 L". For breakdown lines. */
export function litersWithUnit(value: Big): string {
  return `${liters(value)} L`;
}

/** Money with the euro sign, for breakdown lines. */
export function moneyWithUnit(value: Big): string {
  return `${money(value)} €`;
}

/** Kilograms with the unit, for breakdown lines. */
export function kgWithUnit(value: Big): string {
  return `${kg(value)} kg`;
}

/** Percentage with the sign, for breakdown lines. */
export function percentWithUnit(value: Big): string {
  return `${percent(value)} %`;
}

/** Multiply by a percentage given as its own decimal string ("12" -> 12%). */
export function applyPercent(base: Big, pct: Big): Big {
  return base.times(pct).div(100);
}

export { Big };
