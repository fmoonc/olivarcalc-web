import { createJSONStorage, type PersistStorage } from 'zustand/middleware';
import type * as Calculations from '@olivar/calculations';

/**
 * Lazy loader for the calculation engine.
 *
 * The engine, zod and big.js included, is the heaviest thing an island would
 * otherwise pull in, and Astro server-renders every island on the page. Loading
 * it on first use is what keeps the initial payload inside the §10.6 budget; see
 * DECISIONS.md ADR-0008.
 *
 * The module is cached after the first call, so the second click is instant.
 */
type CalculationsModule = typeof Calculations;

let enginePromise: Promise<CalculationsModule> | null = null;

export function loadEngine(): Promise<CalculationsModule> {
  enginePromise ??= import('@olivar/calculations');
  return enginePromise;
}

/**
 * The first human-readable issue out of a zod error.
 *
 * A zod error carries every field problem at once; a farmer filling in a form
 * wants the sentence about the field they are looking at, not a schema dump.
 */
export function firstIssueOf(error: unknown): string {
  const issues = (error as { issues?: Array<{ message: string }> }).issues;
  return issues?.[0]?.message ?? 'alguno de los campos no es válido';
}

/**
 * Storage for zustand/persist that is inert on the server.
 *
 * Astro server-renders islands, and `persist` resolves its storage eagerly.
 * With no `localStorage` in Node the adapter comes back undefined, the store
 * hydrates to nothing, and the SSR pass crashes on `deliveries.length`.
 *
 * Wrapped in `createJSONStorage` so the value keeps the `PersistStorage` shape
 * zustand expects, rather than a bare object union.
 */
export function persistedStorage<T>(): PersistStorage<T> | undefined {
  if (typeof window !== 'undefined') {
    return createJSONStorage<T>(() => window.localStorage);
  }

  return createJSONStorage<T>(() => ({
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  }));
}
