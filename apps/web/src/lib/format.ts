/**
 * Spanish formatting helpers.
 *
 * Spec §10.5: output uses `es-ES` formatting, and the user types decimal
 * commas. Amounts arrive from the API as decimal strings precisely so they can
 * be parsed here without a float ever entering the picture.
 */

const euroFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const kgFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const litersFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "1234.56" -> "1.234,56 €". */
export function formatMoney(decimal: string | number | null | undefined): string {
  if (decimal === null || decimal === undefined || decimal === '') return '—';
  return euroFormatter.format(parseDecimal(decimal));
}

/** "1550.00" -> "1.550,00". */
export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return numberFormatter.format(parseDecimal(value));
}

export function formatKg(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return kgFormatter.format(parseDecimal(value));
}

export function formatLiters(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return litersFormatter.format(parseDecimal(value));
}

/** Already a percentage value, e.g. "15.50" -> "15,50 %". */
export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${percentFormatter.format(parseDecimal(value))} %`;
}

/** A signed percentage, for the weekly price change. */
export function formatSignedPercent(
  value: string | number | null | undefined,
): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (value === null || value === undefined || value === '') {
    return { text: '—', direction: 'flat' };
  }
  const n = parseDecimal(value);
  const text = `${n > 0 ? '+' : ''}${percentFormatter.format(n)} %`;
  return {
    text,
    direction: n > 0 ? 'up' : n < 0 ? 'down' : 'flat',
  };
}

/** ISO date or Date -> "26/09/2026". */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

/** The "Valores actualizados a DD/MM/AAAA" note of spec §10.3. */
export function formatUpdatedAt(value: string | Date | null | undefined): string {
  if (!value) return '';
  return `Valores actualizados a ${formatDate(value)}`;
}

export const qualityLabels: Record<OilPriceQuality, string> = {
  extra: 'Extra',
  virgin: 'Virgen',
  lampante: 'Lampante',
};

export type OilPriceQuality = 'extra' | 'virgin' | 'lampante';

export const harvestTypeLabels = {
  tree: 'de vuelo',
  ground: 'de suelo',
} as const;

export const vatRegimeLabels = {
  reagp: 'REAGP (compensación)',
  general: 'Régimen general (IVA)',
  none: 'Sin IVA',
} as const;

/**
 * Parse a decimal string safely.
 *
 * The API sends "3.20" and the user types "3,20"; both reach here. The result
 * is only ever fed to Intl formatters, never accumulated, so a float here does
 * not violate spec §0.7 the way a float accumulator would.
 */
function parseDecimal(value: string | number): number {
  if (typeof value === 'number') return value;
  const normalised = value.trim().replace(/\s/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : 0;
}
