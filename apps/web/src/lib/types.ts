/**
 * Shared types between the server-rendered Astro shells and the React islands.
 * Kept free of React so both sides can import it.
 */
import type { BreakdownStep, Warning } from '@olivar/calculations';

export type ParamSetPayload = {
  version: string;
  campaign: string;
  published_at: string | null;
  params: Record<
    string,
    {
      key: string;
      value: string;
      unit: string;
      verified: boolean;
      source_label: string;
      source_url: string;
    }
  >;
};

export type { BreakdownStep, Warning };

/** The headline figure and the rows behind it, per spec §10.3. */
export type ResultSummary = {
  /** The one number, already formatted for display. */
  headline: string;
  headlineLabel: string;
  /** Secondary figures shown next to it. */
  figures: Array<{ label: string; value: string }>;
  breakdown: BreakdownStep[];
  warnings: Warning[];
  /** Present only when the user typed a shareable calculation. */
  shareText?: string;
};
