import { useEffect, useState } from 'react';

/**
 * Whether a React island has finished hydrating.
 *
 * Astro server-renders islands, so the form is on screen and looks usable
 * before React takes over. But the inputs are controlled by the Zustand store,
 * and hydration replaces the store contents with what it rehydrates from
 * `localStorage` — which on a first visit is empty. Anything the farmer typed
 * in the meantime is silently discarded.
 *
 * That is a real risk for this audience rather than a theoretical one: spec
 * §10.5 targets people on mid-range phones with patchy coverage, where the
 * engine chunk and the island's JS routinely land after the HTML is already
 * on screen. A farmer who starts typing his kilo count into a field that is
 * about to be reset has to type it again.
 *
 * Islands gate their form on this: disabled until hydrated, then enabled. A
 * visible "preparando" state is better than a form that quietly eats input.
 * `false` on the server and on the first client render, so the server-rendered
 * HTML and the first client render agree and React does not report a mismatch.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
