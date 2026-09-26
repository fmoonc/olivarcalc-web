export { apiFetcher, apiConfig, setApiConfig, toApiError } from './fetcher.js';
export type { ApiFetchConfig, ApiError } from './fetcher.js';

// Generated code. Never hand-edit: change the Laravel side (FormRequest,
// Resource, PHPDoc) and re-run `yarn api:generate` (spec §3.3).
//
// Note: the generated hooks call global `fetch`, not the `apiFetcher` above.
// See the TODO in orval.config.ts and DECISIONS.md ADR-0002.
export * from './generated/default/default.js';
export * from './generated/model/index.js';
