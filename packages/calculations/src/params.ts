import { toBig } from './decimal.js';
import type { ParamSet, ParamValue } from './types.js';

/**
 * Reads official parameters out of a ParamSet and keeps track of which ones
 * were unverified, so a calculator can surface the §4.3 warning.
 *
 * Parameters are owned by Laravel and versioned there. This package never
 * invents a fallback value: a missing parameter that a calculation actually
 * needs is a hard error, not a silent default.
 */
export class ParamReader {
  readonly #params: ParamSet;
  readonly #unverified = new Set<string>();

  constructor(params: ParamSet) {
    this.#params = params;
  }

  get version(): string {
    return this.#params.version;
  }

  get campaign(): string {
    return this.#params.campaign;
  }

  /** Parameter keys consumed so far whose value is not yet verified. */
  get unverifiedKeys(): string[] {
    return [...this.#unverified].sort();
  }

  #raw(key: string): ParamValue {
    const found = this.#params.params[key];
    if (found === undefined) {
      throw new Error(
        `Missing parameter "${key}" in set ${this.#params.version}. ` +
          'The API must publish every parameter a live calculator requires.',
      );
    }
    return found;
  }

  /** A decimal parameter, converted with big.js (spec §4.2). */
  decimal(key: string): ReturnType<typeof toBig> {
    const param = this.#raw(key);
    if (!param.verified) {
      this.#unverified.add(key);
    }
    return toBig(param.value);
  }

  /** A boolean parameter. Tolerates "true"/"1"/"yes" because it travels as text. */
  bool(key: string): boolean {
    const param = this.#raw(key);
    if (!param.verified) {
      this.#unverified.add(key);
    }
    const normalised = param.value.trim().toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí'].includes(normalised)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalised)) {
      return false;
    }
    throw new Error(`Parameter "${key}" is not a boolean: ${param.value}`);
  }

  /**
   * Record that a parameter backs this calculation without parsing its value.
   *
   * Needed where a parameter informs the form rather than the arithmetic: the
   * cost-per-hectare preset seeds `costLines`, but the user's edited figures do
   * the maths. The result still rests on unverified official data, so the
   * §4.3 warning has to fire.
   */
  touch(key: string): void {
    if (!this.#raw(key).verified) {
      this.#unverified.add(key);
    }
  }

  /** A string parameter such as `campaign.start_month_day`. */
  string(key: string): string {
    const param = this.#raw(key);
    if (!param.verified) {
      this.#unverified.add(key);
    }
    return param.value.trim();
  }
}
