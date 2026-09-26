import { defineConfig } from 'orval';

export default defineConfig({
  olivarcalc: {
    input: {
      target: '../../openapi/openapi.json',
    },
    output: {
      // Everything generated lives under src/generated/ because `clean: true`
      // wipes the whole output folder. Point it at src/ instead and orval
      // deletes the hand-written fetcher on every run. That is not obvious and
      // it fails silently: the mutator import simply vanishes.
      target: './src/generated/default.ts',
      schemas: './src/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'tags-split',
      clean: true,
    },
    // TODO: re-enable once orval's react-query client honours the mutator.
    //
    // `src/fetcher.ts` exists and is correct, but orval 8.37 emits a bare
    // global `fetch(...)` for this client, ignoring override.mutator. Until
    // that works, the generated hooks bypass apiFetcher, so do not assume the
    // base URL or auth headers are being applied. See DECISIONS.md ADR-0002.
    //
    // override: {
    //   mutator: { path: './src/fetcher', name: 'apiFetcher' },
    // },
  },
});
