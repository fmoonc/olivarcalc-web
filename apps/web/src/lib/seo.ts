/**
 * Public build-time configuration. Kept in one module so no page reaches for
 * `import.meta.env` directly and the env var names stay traceable (spec §13.4).
 */

export const PUBLIC_SITE_URL: string =
  import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';

export const PUBLIC_SITE_NAME: string = import.meta.env.PUBLIC_SITE_NAME ?? 'OlivarCalc';

export const PUBLIC_ADSENSE_CLIENT: string = import.meta.env.PUBLIC_ADSENSE_CLIENT ?? '';

export const ADSENSE_PUBLISHER_ID: string = import.meta.env.ADSENSE_PUBLISHER_ID ?? '';

export const PUBLIC_GA4_ID: string = import.meta.env.PUBLIC_GA4_ID ?? '';

export const PUBLIC_SENTRY_DSN: string = import.meta.env.PUBLIC_SENTRY_DSN ?? '';

/** The five calculators, keyed by their `tool_key` in the API. */
export const toolKeys = {
  settlement: 'settlement',
  yieldConverter: 'yield_converter',
  costPerHectare: 'cost_per_hectare',
  harvestCrew: 'harvest_crew',
} as const;

export type ToolKey = (typeof toolKeys)[keyof typeof toolKeys];
