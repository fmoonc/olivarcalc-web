import { describe, expect, it } from 'vitest';

import {
  campaignOf,
  eurPerTonToEurPerKg,
  summarizeCampaign,
  weeklyChangePct,
} from '../src/oil-price.js';

describe('eurPerTonToEurPerKg', () => {
  it('divides the tonne price by 1000', () => {
    expect(eurPerTonToEurPerKg('3000')).toBe('3.0000');
    expect(eurPerTonToEurPerKg('3250.50')).toBe('3.2505');
  });

  it('accepts a decimal comma', () => {
    expect(eurPerTonToEurPerKg('3250,50')).toBe('3.2505');
  });
});

describe('weeklyChangePct', () => {
  it('reports a rise and a fall', () => {
    expect(weeklyChangePct('3.5', '3')).toBe('16.67');
    expect(weeklyChangePct('3', '3.5')).toBe('-14.29');
  });

  it('returns zero for an unchanged price', () => {
    expect(weeklyChangePct('3', '3')).toBe('0.00');
  });

  it('returns null when the previous week was zero, rather than dividing by zero', () => {
    expect(weeklyChangePct('3', '0')).toBeNull();
  });
});

describe('campaignOf', () => {
  // Spec §5.2: the campaign starts on 1 October. The boundary days are the
  // whole point, so they get their own cases.
  it('puts 30 September at the end of the previous campaign', () => {
    expect(campaignOf(new Date(2026, 8, 30))).toBe('2025-26');
  });

  it('puts 1 October at the start of the new campaign', () => {
    expect(campaignOf(new Date(2026, 9, 1))).toBe('2026-27');
  });

  it('stays in the same campaign through the winter', () => {
    expect(campaignOf(new Date(2026, 9, 15))).toBe('2026-27');
    expect(campaignOf(new Date(2027, 0, 20))).toBe('2026-27');
    expect(campaignOf(new Date(2027, 8, 30))).toBe('2026-27');
  });

  it('rolls over on the next 1 October', () => {
    expect(campaignOf(new Date(2027, 9, 1))).toBe('2027-28');
  });

  it('honours a custom start date from the parameters', () => {
    // With a 1 January start, 30 September 2026 is already inside the campaign
    // that began on 1 January 2026.
    expect(campaignOf(new Date(2026, 8, 30), '01-01')).toBe('2026-27');
    // The start day itself belongs to the new campaign, not the previous one.
    expect(campaignOf(new Date(2026, 0, 1), '01-01')).toBe('2026-27');
    // The day before it does not.
    expect(campaignOf(new Date(2025, 11, 31), '01-01')).toBe('2025-26');
  });

  it('rejects a malformed start date instead of guessing', () => {
    expect(() => campaignOf(new Date(2026, 9, 1), 'October')).toThrow();
    expect(() => campaignOf(new Date(2026, 9, 1), '13-01')).toThrow();
  });
});

describe('summarizeCampaign', () => {
  const prices = [
    { weekStart: '2026-10-05', avgPriceEurT: '3000' },
    { weekStart: '2026-10-12', avgPriceEurT: '3200' },
    { weekStart: '2026-10-19', avgPriceEurT: '2800' },
  ];

  it('computes mean, max, min and last', () => {
    const summary = summarizeCampaign('2026-27', prices)!;

    expect(summary).toEqual({
      campaign: '2026-27',
      meanEurT: '3000.00',
      maxEurT: '3200.00',
      minEurT: '2800.00',
      lastEurT: '2800.00',
      weeks: 3,
    });
  });

  it('sorts by week so "last" really is the latest', () => {
    const shuffled = [prices[2]!, prices[0]!, prices[1]!];

    expect(summarizeCampaign('2026-27', shuffled)!.lastEurT).toBe('2800.00');
  });

  it('returns null for an empty campaign rather than NaN', () => {
    expect(summarizeCampaign('2026-27', [])).toBeNull();
  });
});
