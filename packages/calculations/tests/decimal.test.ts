import { describe, expect, it } from 'vitest';

import {
  applyPercent,
  kg,
  liters,
  max,
  money,
  percent,
  sum,
  toBig,
} from '../src/decimal.js';
import { ParamReader } from '../src/params.js';

describe('toBig', () => {
  it('accepts strings, numbers and a decimal comma', () => {
    expect(toBig('1234.56').toFixed(2)).toBe('1234.56');
    expect(toBig(1234.56).toFixed(2)).toBe('1234.56');
    expect(toBig('1234,56').toFixed(2)).toBe('1234.56');
  });

  it('rejects values that would silently become NaN or Infinity', () => {
    expect(() => toBig('')).toThrow();
    expect(() => toBig('abc')).toThrow();
    expect(() => toBig(Number.NaN)).toThrow();
    expect(() => toBig(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('rounding rules (spec §4.1)', () => {
  it('rounds money to 2 decimals, half up', () => {
    expect(money(toBig('1234.565'))).toBe('1234.57');
    expect(money(toBig('1234.564'))).toBe('1234.56');
  });

  it('rounds percentages to 2 decimals', () => {
    expect(percent(toBig('15.005'))).toBe('15.01');
  });

  it('rounds kilograms to 2 decimals', () => {
    expect(kg(toBig('852.567'))).toBe('852.57');
  });

  it('rounds litres to 1 decimal', () => {
    expect(liters(toBig('1692.1397'))).toBe('1692.1');
  });

  it('rounds a true .5 up, not to even (spec §4.1 says half-up)', () => {
    // 0.125 is where half-up and banker's rounding disagree: half-up gives
    // 0.13, half-even would give 0.12.
    expect(money(toBig('0.125'))).toBe('0.13');
    // 0.195 rounds up, not down to 0.19.
    expect(money(toBig('5616').div(toBig('28800')))).toBe('0.20');
  });

  it('keeps money as a string, never a JS float (spec §7.1)', () => {
    const result = money(toBig('100'));

    expect(typeof result).toBe('string');
    expect(result).toBe('100.00');
  });
});

describe('sum', () => {
  it('accumulates without a float, so long sums stay exact', () => {
    // 0.1 + 0.2 in binary floating point is 0.30000000000000004.
    const total = sum([toBig('0.1'), toBig('0.2')]);

    expect(total.toFixed(2)).toBe('0.30');
    expect(sum([toBig('0.1'), toBig('0.2')]).toFixed(17)).not.toContain('0000004');
  });

  it('returns zero for an empty list', () => {
    expect(sum([]).toFixed(2)).toBe('0.00');
  });
});

describe('applyPercent', () => {
  it('multiplies by a percentage given as a decimal', () => {
    expect(applyPercent(toBig('4360'), toBig('12')).toFixed(2)).toBe('523.20');
    expect(applyPercent(toBig('1000'), toBig('0')).toFixed(2)).toBe('0.00');
  });
});

describe('max', () => {
  it('never returns a negative floor', () => {
    expect(max(toBig('18.5').minus(toBig('25')), toBig(0)).toFixed(2)).toBe('0.00');
    expect(max(toBig('5'), toBig('9')).toFixed(2)).toBe('9.00');
  });
});

describe('ParamReader', () => {
  const base = {
    version: '2026-27.1',
    campaign: '2026-27',
    published_at: '2026-09-26T00:00:00+00:00',
    params: {
      'oil.density_kg_per_l': {
        key: 'oil.density_kg_per_l',
        value: '0.916',
        unit: 'kg/L',
        verified: true,
        source_label: 'Reference',
        source_url: '',
      },
      'irpf.withholding_base_includes_vat': {
        key: 'irpf.withholding_base_includes_vat',
        value: 'false',
        unit: '',
        verified: false,
        source_label: 'AEAT',
        source_url: '',
      },
    },
  };

  it('throws a named error for a parameter the API failed to publish', () => {
    const reader = new ParamReader(base);

    expect(() => reader.decimal('vat.reagp_compensation_pct')).toThrow(
      /Missing parameter "vat\.reagp_compensation_pct"/,
    );
  });

  it('exposes the version and campaign of the set it reads', () => {
    const reader = new ParamReader(base);

    expect(reader.version).toBe('2026-27.1');
    expect(reader.campaign).toBe('2026-27');
  });

  /**
   * Spec §0.2 seeds a parameter empty when there is no defensible placeholder
   * (`labor.employer_cost_pct`, the olive VAT rate, the provincial wages). A
   * calculator that needs one has to name it, not fail on an empty string.
   */
  it('names the parameter when its value is still empty', () => {
    const withEmpty = {
      ...base,
      params: {
        'labor.employer_cost_pct': {
          key: 'labor.employer_cost_pct',
          value: '',
          unit: '%',
          verified: false,
          source_label: 'Seguridad Social',
          source_url: '',
        },
      },
    };

    expect(() => new ParamReader(withEmpty).decimal('labor.employer_cost_pct'))
      .toThrow(/labor\.employer_cost_pct/);
  });

  it('reads a string parameter and trims it', () => {
    const withStart = {
      ...base,
      params: {
        ...base.params,
        'campaign.start_month_day': {
          key: 'campaign.start_month_day',
          value: ' 10-01 ',
          unit: 'MM-DD',
          verified: true,
          source_label: 'Sector convention',
          source_url: '',
        },
      },
    };

    expect(new ParamReader(withStart).string('campaign.start_month_day')).toBe('10-01');
  });

  it('marks an unverified string parameter too', () => {
    const reader = new ParamReader({
      ...base,
      params: {
        'campaign.start_month_day': {
          key: 'campaign.start_month_day',
          value: '10-01',
          unit: 'MM-DD',
          verified: false,
          source_label: '',
          source_url: '',
        },
      },
    });

    expect(reader.string('campaign.start_month_day')).toBe('10-01');
    expect(reader.unverifiedKeys).toEqual(['campaign.start_month_day']);
  });

  it('tracks unverified parameters as they are read', () => {
    const reader = new ParamReader(base);
    reader.decimal('oil.density_kg_per_l');

    expect(reader.unverifiedKeys).toEqual([]);

    reader.bool('irpf.withholding_base_includes_vat');
    expect(reader.unverifiedKeys).toEqual(['irpf.withholding_base_includes_vat']);
  });

  it('records an unverified parameter via touch without parsing it', () => {
    const reader = new ParamReader(base);
    reader.touch('irpf.withholding_base_includes_vat');

    expect(reader.unverifiedKeys).toEqual(['irpf.withholding_base_includes_vat']);
  });

  it('parses the boolean spellings a text parameter realistically carries', () => {
    const withValue = (value: string) => ({
      ...base,
      params: {
        ...base.params,
        'irpf.withholding_base_includes_vat': {
          ...base.params['irpf.withholding_base_includes_vat'],
          value,
        },
      },
    });

    for (const yes of ['true', 'TRUE', '1', 'yes', 'si', 'sí']) {
      expect(new ParamReader(withValue(yes)).bool('irpf.withholding_base_includes_vat')).toBe(true);
    }
    for (const no of ['false', '0', 'no']) {
      expect(new ParamReader(withValue(no)).bool('irpf.withholding_base_includes_vat')).toBe(false);
    }
    expect(() => new ParamReader(withValue('maybe')).bool('irpf.withholding_base_includes_vat')).toThrow();
  });
});
