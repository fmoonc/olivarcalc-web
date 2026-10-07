/**
 * Build-time data access.
 *
 * Spec §10.1: if the API is unreachable during `astro build`, the build FAILS.
 * Never publish an empty guide index or a calculator with no parameters: a
 * half-built page is worse than a failed deploy. So every fetch here throws
 * with an actionable message instead of returning a default.
 *
 * Nothing in this module runs in the browser. The only island data that
 * reaches the client is what is explicitly passed as an island prop.
 */
import type { ParamSet } from '@olivar/calculations';

const API_URL = import.meta.env.API_URL ?? 'http://127.0.0.1:8000';
const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL ?? API_URL;

export type ParamValue = {
  key: string;
  value: string;
  unit: string;
  verified: boolean;
  source_label: string;
  source_url: string;
};

export type ToolPage = {
  tool_key: string;
  title: string;
  intro_markdown: string | null;
  body_markdown: string | null;
  faq: Array<{ question: string; answer: string }>;
  meta_title: string | null;
  meta_description: string | null;
  updated_at: string | null;
};

export type ArticleSummary = {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_path: string | null;
  category: { slug: string; name: string } | null;
  related_tool: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export type ArticleDetail = ArticleSummary & {
  body_markdown: string;
  faq: Array<{ question: string; answer: string }>;
  meta_title: string | null;
  meta_description: string | null;
  author: string | null;
  reviewed_at: string | null;
};

export type Category = {
  slug: string;
  name: string;
  description: string | null;
  articles_count: number;
};

export type OilPrice = {
  week_start: string;
  week_end: string;
  quality: 'extra' | 'virgin' | 'lampante';
  avg_price_eur_t: string;
  avg_price_eur_kg: string;
  volume_t: string | null;
  provisional: boolean;
  source: string;
};

export type LatestPrice = {
  quality: OilPrice['quality'];
  week_start: string;
  week_end: string;
  avg_price_eur_t: string;
  avg_price_eur_kg: string;
  volume_t: string | null;
  provisional: boolean;
  source: string;
  weekly_change_pct: string | null;
};

export type CampaignSummaryRow = {
  quality: OilPrice['quality'];
  weeks: number;
  mean_eur_t: string;
  max_eur_t: string;
  min_eur_t: string;
  last_eur_t: string;
};

/**
 * POOLred's weekly variation for one of its four indices.
 *
 * `poolred_id` and `name` are theirs, not ours, and are kept verbatim so the page
 * matches the source it credits. There is no price here: their public ticker
 * publishes a percentage and nothing else.
 */
export type IndexQuote = {
  poolred_id: string;
  name: string;
  /** Percentage as a decimal string, e.g. "-6.850" means -6.85 %. */
  variation_pct: string;
  quoted_on: string;
  period: string;
  source_stamp: string;
  is_finalized: boolean;
  source_url: string;
};

export type AffiliateProduct = {
  name: string;
  category: string;
  url: string;
  image_path: string | null;
  price_text: string | null;
  short_description: string;
};

export type BuildManifest = {
  generated_at: string;
  campaign: string | null;
  latest_price_week: string | null;
  articles: Array<{ slug: string; lastmod: string | null; related_tool: string | null }>;
  categories: Array<{ slug: string; name: string }>;
  tool_pages: Array<{ tool_key: string; lastmod: string | null }>;
};

export class ApiUnavailableError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly cause: unknown,
  ) {
    super(
      `The OlivarCalc API did not answer for ${endpoint} (${API_URL}).\n` +
        'Spec §10.1 requires the build to fail rather than ship empty pages.\n' +
        'Start the API (cd ../olivarcalc-api && make serve) or point API_URL ' +
        'at the staging API, then rebuild.',
    );
    this.name = 'ApiUnavailableError';
  }
}

/**
 * Fetch a build-time resource, or fail the build.
 *
 * A 404 is NOT swallowed: it means a page the site links to no longer exists,
 * which should stop the deploy too.
 */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_URL}/api/v1${path}`;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new ApiUnavailableError(path, error);
  }

  if (!response.ok) {
    throw new ApiUnavailableError(
      `${path} (HTTP ${response.status})`,
      await response.text().catch(() => ''),
    );
  }

  return (await response.json()) as T;
}

/** The published parameter set. Throws if none is published, by design. */
export async function getCurrentParameters(campaign?: string): Promise<ParamSet> {
  const query = campaign ? `?campaign=${encodeURIComponent(campaign)}` : '';
  // Not wrapped in `data`: the API serves a ParamSet bare so the calculators
  // can read `.params` directly. See DECISIONS.md ADR-0007.
  return api<ParamSet>(`/parameters/current${query}`);
}

export async function getToolPage(toolKey: string): Promise<ToolPage> {
  return api<ToolPage>(`/tool-pages/${encodeURIComponent(toolKey)}`);
}

export async function getCategories(): Promise<Category[]> {
  const { data } = await api<{ data: Category[] }>('/categories');
  return data;
}

export async function getArticles(params: {
  category?: string;
  tool?: string;
  perPage?: number;
} = {}): Promise<{ articles: ArticleSummary[]; total: number }> {
  const query = new URLSearchParams();
  if (params.category !== undefined) query.set('category', params.category);
  if (params.tool !== undefined) query.set('tool', params.tool);
  query.set('per_page', String(params.perPage ?? 50));

  const body = await api<{
    data: ArticleSummary[];
    meta: { total: number };
  }>(`/articles?${query.toString()}`);

  return { articles: body.data, total: body.meta?.total ?? body.data.length };
}

export async function getArticle(slug: string): Promise<ArticleDetail> {
  // ArticleDetailResource is served unwrapped, like ToolPageResource.
  return api<ArticleDetail>(`/articles/${encodeURIComponent(slug)}`);
}

export async function getOilPrices(
  quality?: OilPrice['quality'],
  range?: { from?: string; to?: string },
): Promise<OilPrice[]> {
  const query = new URLSearchParams();
  if (quality !== undefined) query.set('quality', quality);
  if (range?.from !== undefined) query.set('from', range.from);
  if (range?.to !== undefined) query.set('to', range.to);

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const { data } = await api<{ data: OilPrice[] }>(`/oil-prices${suffix}`);
  return data;
}

export async function getLatestPrices(): Promise<LatestPrice[]> {
  const { data } = await api<{ data: LatestPrice[] }>('/oil-prices/latest');
  return data;
}

/**
 * POOLred's latest variation for its four indices.
 *
 * Throws like every other fetcher here: Astro builds statically and a page with
 * no market data must fail the build rather than ship an empty chart (spec §10.1).
 */
export async function getLatestIndexQuotes(): Promise<IndexQuote[]> {
  const { data } = await api<{ data: IndexQuote[] }>('/index-quotes/latest');
  return data;
}

export async function getCampaignSummary(
  campaign: string,
): Promise<{ campaign: string; rows: CampaignSummaryRow[] }> {
  const body = await api<{ campaign: string; data: CampaignSummaryRow[] }>(
    `/oil-prices/campaigns/${encodeURIComponent(campaign)}/summary`,
  );
  return { campaign: body.campaign, rows: body.data };
}

export async function getAffiliateProducts(category?: string): Promise<AffiliateProduct[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  const { data } = await api<{ data: AffiliateProduct[] }>(`/affiliate-products${query}`);
  return data;
}

export async function getBuildManifest(): Promise<BuildManifest> {
  return api<BuildManifest>('/build-manifest');
}

export { API_URL, PUBLIC_API_URL };
