/**
 * Shared types for OlivarCalc calculations.
 *
 * Everything here is a plain data shape: no I/O, no browser APIs, no system
 * clock (spec §4.1, §15). The package must stay importable from React Native.
 */

/**
 * A decimal as it crosses a boundary.
 *
 * Forms hand us strings (the Spanish user types "1234,56"), JSON gives numbers.
 * Either is accepted at the edge and converted to Big immediately, so a raw
 * float never takes part in arithmetic (spec §0.7).
 */
export type DecimalInput = string | number;

/**
 * A single official parameter, as served by `GET /v1/parameters/current`.
 *
 * Field names are snake_case because this shape IS the API wire format: the
 * Laravel API speaks snake_case throughout (spec §7.1) and there is no
 * transformer in front of it. See DECISIONS.md ADR-0007.
 */
export type ParamValue = {
  key: string;
  /** Decimal as a string. Converted with big.js; never parsed to float. */
  value: string;
  unit: string;
  /** false means "provisional, owner must confirm against the official source". */
  verified: boolean;
  source_label: string;
  source_url: string;
};

export type ParamSet = {
  version: string;
  campaign: string;
  published_at: string;
  params: Record<string, ParamValue>;
};

/** One step of the "how this was calculated" walkthrough (spec §4.1). */
export type BreakdownStep = {
  /** User-facing, therefore Spanish (spec §0.1). See labels.ts. */
  label: string;
  /** Already rounded for display, as a decimal string. */
  value: string;
  /** Optional: the arithmetic, in notation a farmer can follow. */
  formula?: string;
};

export type WarningCode =
  | 'low_fat_yield'
  | 'high_fat_yield'
  | 'high_correction_index'
  | 'negative_settlement'
  | 'unverified_params'
  | 'zero_industrial_yield'
  | 'crew_estimate';

/** A warning is never an error: the calculator still returns a result. */
export type Warning = {
  code: WarningCode;
  /** User-facing, therefore Spanish. */
  message: string;
  /** The parameter keys behind an `unverified_params` warning, if any. */
  keys?: string[];
};

/**
 * Shape shared by every calculator result (spec §4.1).
 *
 * These stay camelCase: they never cross the wire. The API stores a saved
 * calculation's results as an opaque JSON blob and does not parse it (spec
 * §7.4), so there is no contract to conform to here. Only the `ParamSet`
 * above, which the API really does serialise, follows snake_case.
 */
export type CalcResult = {
  /** Which formula version produced this, stored with saved calculations. */
  calcVersion: string;
  /** The parameter set these results were computed against. */
  paramSetVersion: string;
  breakdown: BreakdownStep[];
  warnings: Warning[];
};

/** Currency amounts are always decimal strings, never JSON numbers (spec §7.1). */
export type Money = string;

export type HarvestType = 'tree' | 'ground';
