export { apiFetcher, apiConfig, setApiConfig, toApiError } from './fetcher.js';
export type { ApiFetchConfig, ApiError } from './fetcher.js';

// Generated code. Never hand-edit: change the Laravel side (FormRequest,
// Resource, PHPDoc) and re-run `yarn api:generate` (spec §3.3).
//
// Re-export orval's own barrel rather than listing tag folders, so adding an
// endpoint with a new tag does not require touching this file.
//
// Note: the generated hooks call global `fetch`, not the `apiFetcher` above.
// See the TODO in orval.config.ts and DECISIONS.md ADR-0002.
export * from './generated/index.js';
